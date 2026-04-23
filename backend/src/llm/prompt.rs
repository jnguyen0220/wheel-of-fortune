//! LLM Prompt Builder for the Wheel Strategy Advisor
//!
//! Builds a prompt from raw options chain data and sends it directly to
//! the LLM.  The LLM is the recommendation engine — it selects strikes,
//! allocates contracts, and produces the final trade list.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::models::{Inventory, OptionsChain, OptionsContract};

// ── Prompt payloads ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmPrompt {
    pub messages: Vec<ChatMessage>,
    pub temperature: f64,
    pub max_tokens: u32,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ann_roc_csp(c: &OptionsContract) -> f64 {
    if c.strike == 0.0 || c.dte == 0 {
        return 0.0;
    }
    (c.mid_price() / c.strike) * (365.0 / c.dte as f64) * 100.0
}

fn ann_roc_cc(c: &OptionsContract) -> f64 {
    if c.underlying_price == 0.0 || c.dte == 0 {
        return 0.0;
    }
    (c.mid_price() / c.underlying_price) * (365.0 / c.dte as f64) * 100.0
}

fn min_premium_floor(strike: f64, min_abs: f64, min_pct: f64) -> f64 {
    let pct_floor = strike * min_pct;
    min_abs.max(pct_floor)
}

/// Pick the single best contract from a filtered candidate list.
/// "Best" = highest annualised ROC (most premium per dollar of risk).
fn best_contract<'a>(
    candidates: Vec<&'a OptionsContract>,
    is_csp: bool,
) -> Option<&'a OptionsContract> {
    candidates.into_iter().max_by(|a, b| {
        let roc_a = if is_csp {
            ann_roc_csp(a)
        } else {
            ann_roc_cc(a)
        };
        let roc_b = if is_csp {
            ann_roc_csp(b)
        } else {
            ann_roc_cc(b)
        };
        roc_a
            .partial_cmp(&roc_b)
            .unwrap_or(std::cmp::Ordering::Equal)
    })
}

// ── System prompt ─────────────────────────────────────────────────────────────

fn build_system_prompt() -> &'static str {
    include_str!("prompt.md")
}

// ── User prompt builder ───────────────────────────────────────────────────────

fn format_inventory_section(inventory: &Inventory) -> String {
    if inventory.holdings.is_empty() {
        return "No existing equity positions.".to_string();
    }

    let mut section = String::new();
    section.push_str("| Ticker | Shares | Avg Cost | Current Price | Mkt Value | P&L |\n");
    section.push_str("|--------|--------|----------|---------------|-----------|-----|\n");
    for h in &inventory.holdings {
        section.push_str(&format!(
            "| {} | {} | ${:.2} | ${:.2} | ${:.2} | {:.1}% |\n",
            h.ticker,
            h.shares,
            h.cost_basis,
            h.current_price,
            h.market_value(),
            h.pnl_percent(),
        ));
    }
    section
}

fn format_cash_section(available_cash: f64) -> String {
    if available_cash.is_finite() {
        format!(
            "- **Total shared capital (cash pool for CSPs):** ${:.2}\n- 1 option contract = 100 shares.\n- Margin per CSP contract = strike x 100.\n- Total CSP collateral = sum(contracts x strike x 100) and must not exceed cash.\n- Contracts must be whole numbers.",
            available_cash
        )
    } else {
        "- **Available cash:** unlimited (paper trading)\n- 1 option contract = 100 shares.\n- Contracts must be whole numbers.".to_string()
    }
}

fn build_user_prompt(
    inventory: &Inventory,
    chains: &[OptionsChain],
    available_cash: f64,
    min_premium_abs: f64,
    min_premium_pct: f64,
) -> String {
    let mut options_blocks = String::new();
    let mut csp_candidates: Vec<(String, OptionsContract, f64, f64)> = Vec::new();

    for chain in chains {
        let ticker = &chain.ticker;
        let spot = chain.underlying_price;
        let shares_held: u32 = inventory
            .holdings
            .iter()
            .find(|h| h.ticker.to_uppercase() == ticker.to_uppercase())
            .map(|h| h.shares)
            .unwrap_or(0);

        options_blocks.push_str(&format!("### {} — Spot ${:.2}", ticker, spot));
        if shares_held >= 100 {
            options_blocks.push_str(&format!(
                " — {} shares held → ✅ SELL CALLS (CC, {} contracts)",
                shares_held,
                shares_held / 100
            ));
        } else if shares_held > 0 {
            options_blocks.push_str(&format!(
                " — {} shares held → ⛔ NO TRADES (partial lot, skip)",
                shares_held
            ));
        } else {
            options_blocks.push_str(
                " — 0 shares held → ✅ SELL PUTS (CSP). Do NOT sell calls on this ticker.",
            );
        }
        options_blocks.push('\n');

        // CSP candidates — only for tickers with zero shares held
        if shares_held == 0 {
            use crate::models::OptionType;
            let csp_raw: Vec<&OptionsContract> = chain
                .contracts
                .iter()
                .filter(|c| c.option_type == OptionType::Put)
                .collect();

            if csp_raw.is_empty() {
                options_blocks.push_str(&format!(
                    "  ⛔ NO VALID CONTRACTS — omit {} from trades entirely.\n\n",
                    ticker
                ));
            } else {
                for contract in csp_raw {
                    let ann_roc = ann_roc_csp(contract);
                    let margin_per = contract.strike * 100.0;
                    let min_premium = min_premium_floor(
                        contract.strike,
                        min_premium_abs,
                        min_premium_pct,
                    );
                    options_blocks.push_str(&format!(
                        "  CSP candidate: ticker={} | strike=${:.2} | expiry={} | DTE={} | mid=${:.2}/share | min=${:.2}/share | delta={:.2} | IV={:.0}% | ann.ROC={:.0}% | margin/contract=${:.0}\n",
                        ticker,
                        contract.strike,
                        contract.expiration,
                        contract.dte,
                        contract.mid_price(),
                        min_premium,
                        contract.delta,
                        contract.implied_volatility * 100.0,
                        ann_roc,
                        margin_per,
                    ));
                    csp_candidates.push((ticker.clone(), contract.clone(), ann_roc, margin_per));
                }
                options_blocks.push('\n');
            }
        }

        // CC candidates
        if shares_held >= 100 {
            use crate::models::OptionType;
            let cc_raw: Vec<&OptionsContract> = chain
                .contracts
                .iter()
                .filter(|c| c.option_type == OptionType::Call)
                .collect();

            let max_cc = shares_held / 100;
            if cc_raw.is_empty() {
                options_blocks.push_str(&format!(
                    "  ⛔ NO VALID CALL CONTRACTS — omit {} CC from trades.\n\n",
                    ticker
                ));
            } else {
                for contract in cc_raw {
                    let ann_roc = ann_roc_cc(contract);
                    let min_premium = min_premium_floor(
                        contract.strike,
                        min_premium_abs,
                        min_premium_pct,
                    );
                    options_blocks.push_str(&format!(
                        "  CC candidate: ticker={} | strike=${:.2} | expiry={} | DTE={} | mid=${:.2}/share | min=${:.2}/share | delta={:.2} | IV={:.0}% | ann.ROC={:.0}% | shares={} | max_contracts={}\n",
                        ticker,
                        contract.strike,
                        contract.expiration,
                        contract.dte,
                        contract.mid_price(),
                        min_premium,
                        contract.delta,
                        contract.implied_volatility * 100.0,
                        ann_roc,
                        shares_held,
                        max_cc,
                    ));
                }
                options_blocks.push('\n');
            }
        }
    }

    let csp_allocation_guidance = if available_cash.is_finite() && !csp_candidates.is_empty() {
        let mut ranked = csp_candidates.clone();
        ranked.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        let mut guidance = String::new();
        guidance.push_str("- Allocate cash across the highest-return CSPs when it improves total premium and reduces risk.\n");
        guidance.push_str("- Top CSP candidates (ranked by ann.ROC):\n");
        for (i, (ticker, contract, roc, margin_per)) in ranked.iter().take(5).enumerate() {
            guidance.push_str(&format!(
                "  - {}. {} strike=${:.2} expiry={} DTE={} ann.ROC={:.0}% margin/contract=${:.0}\n",
                i + 1,
                ticker,
                contract.strike,
                contract.expiration,
                contract.dte,
                roc,
                margin_per
            ));
        }
        guidance.push_str("- Use multiple legs if it increases total premium for the same cash budget.\n");
        guidance.push_str("- Prefer shorter DTE only if ROC and total premium improve.\n");
        guidance.push_str(
            "- Use all or nearly all cash; avoid leaving more than 5% idle unless no valid contracts remain.",
        );
        guidance
    } else {
        "- No CSP candidates available from the provided input data.".to_string()
    };

    let mut user_prompt = include_str!("user.md").to_string();
    user_prompt = user_prompt.replace("{{inventory_section}}", &format_inventory_section(inventory));
    user_prompt = user_prompt.replace("{{cash_section}}", &format_cash_section(available_cash));
    user_prompt = user_prompt.replace("{{min_premium_abs}}", &format!("${:.2}", min_premium_abs));
    user_prompt = user_prompt.replace("{{min_premium_pct}}", &format!("{:.2}", min_premium_pct * 100.0));
    user_prompt = user_prompt.replace("{{options_blocks}}", &options_blocks);
    user_prompt.replace("{{csp_allocation_guidance}}", &csp_allocation_guidance)
}

// ── Valid strikes extractor ───────────────────────────────────────────────────

/// Returns the pre-selected best strike for each ticker/type, matching exactly
/// what the LLM prompt shows on the "→ Use in JSON: strike=" line.
/// Frontend uses this for exact-match validation — the LLM must output this value.
pub fn build_valid_strikes(
    inventory: &Inventory,
    chains: &[OptionsChain],
    min_premium_abs: f64,
    min_premium_pct: f64,
) -> HashMap<String, HashMap<String, Vec<f64>>> {
    use crate::models::OptionType;
    let mut out: HashMap<String, HashMap<String, Vec<f64>>> = HashMap::new();

    for chain in chains {
        let ticker = chain.ticker.to_uppercase();
        let spot = chain.underlying_price;
        let shares_held: u32 = inventory
            .holdings
            .iter()
            .find(|h| h.ticker.to_uppercase() == ticker)
            .map(|h| h.shares)
            .unwrap_or(0);

        let entry = out.entry(ticker).or_default();

        if shares_held == 0 {
            let csp_raw: Vec<&OptionsContract> = chain
                .contracts
                .iter()
                .filter(|c| {
                    let min_premium = min_premium_floor(c.strike, min_premium_abs, min_premium_pct);
                    c.option_type == OptionType::Put
                        && c.strike > 0.0
                        && c.strike < spot
                        && c.dte >= 7
                        && c.dte <= 60
                        && c.delta.abs() >= 0.08
                        && c.delta.abs() <= 0.55
                        && c.open_interest >= 5
                        && c.mid_price() >= min_premium
                        && c.bid > 0.0
                        && c.ask > 0.0
                })
                .collect();
            let mut strikes: Vec<f64> = if !csp_raw.is_empty() {
                csp_raw.iter().map(|c| c.strike).collect()
            } else {
                // Fallback to all put strikes so UI validation still blocks hallucinations.
                chain
                    .contracts
                    .iter()
                    .filter(|c| c.option_type == OptionType::Put && c.strike > 0.0)
                    .map(|c| c.strike)
                    .collect()
            };
            if !strikes.is_empty() {
                strikes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                strikes.dedup_by(|a, b| (*a - *b).abs() < 1e-6);
                entry.insert("CSP".to_string(), strikes);
            }
        }

        if shares_held >= 100 {
            let cc_raw: Vec<&OptionsContract> = chain
                .contracts
                .iter()
                .filter(|c| {
                    let min_premium = min_premium_floor(c.strike, min_premium_abs, min_premium_pct);
                    c.option_type == OptionType::Call
                        && c.strike > spot
                        && c.strike > 0.0
                        && c.dte >= 7
                        && c.dte <= 60
                        && c.delta.abs() >= 0.08
                        && c.delta.abs() <= 0.55
                        && c.open_interest >= 5
                        && c.mid_price() >= min_premium
                        && c.bid > 0.0
                        && c.ask > 0.0
                })
                .collect();
            let mut strikes: Vec<f64> = if !cc_raw.is_empty() {
                cc_raw.iter().map(|c| c.strike).collect()
            } else {
                chain
                    .contracts
                    .iter()
                    .filter(|c| c.option_type == OptionType::Call && c.strike > 0.0)
                    .map(|c| c.strike)
                    .collect()
            };
            if !strikes.is_empty() {
                strikes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                strikes.dedup_by(|a, b| (*a - *b).abs() < 1e-6);
                entry.insert("CC".to_string(), strikes);
            }
        }
    }

    out
}

// ── Assembler ─────────────────────────────────────────────────────────────────

pub fn build_llm_prompt(
    inventory: &Inventory,
    chains: &[OptionsChain],
    available_cash: f64,
    min_premium_abs: f64,
    min_premium_pct: f64,
) -> LlmPrompt {
    LlmPrompt {
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: build_system_prompt().to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: build_user_prompt(
                    inventory,
                    chains,
                    available_cash,
                    min_premium_abs,
                    min_premium_pct,
                ),
            },
        ],
        temperature: 0.3,
        max_tokens: 2048,
    }
}
