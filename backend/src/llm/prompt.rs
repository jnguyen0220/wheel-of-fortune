//! LLM Prompt Builder for the Wheel Strategy Advisor
//!
//! Builds a ranking prompt from pre-computed wheel strategy trades.
//! The recommendation engine has already filtered and validated all trades —
//! the LLM's job is to rank them and provide rationale.

use serde::{Deserialize, Serialize};

use crate::models::Inventory;
use crate::strategy::wheel::{WheelLeg, WheelRecommendation};

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

fn format_cc_table(recommendations: &[&WheelRecommendation]) -> String {
    if recommendations.is_empty() {
        return "No executable trades found.".to_string();
    }

    let mut table = String::new();
    table.push_str("| # | Ticker | Strike | Expiry | DTE | Contracts | Mid/share | Ann.ROC | OI | Quality |\n");
    table.push_str("|---|--------|--------|--------|-----|-----------|-----------|---------|------|--------|\n");

    for (i, rec) in recommendations.iter().enumerate() {
        table.push_str(&format!(
            "| {} | {} | ${:.2} | {} | {} | {} | ${:.2} | {:.1}% | {} | {:.0} |\n",
            i + 1,
            rec.ticker,
            rec.contract.strike,
            rec.contract.expiration,
            rec.contract.dte,
            rec.contracts_allocated,
            rec.contract.mid_price(),
            rec.annualised_roc,
            rec.contract.open_interest,
            rec.quality_score,
        ));
    }
    table
}

fn format_csp_table(recommendations: &[&WheelRecommendation]) -> String {
    if recommendations.is_empty() {
        return "No executable trades found.".to_string();
    }

    let mut table = String::new();
    table.push_str("| # | Ticker | Strike | Expiry | DTE | Contracts | Mid/share | Ann.ROC | OI | Collateral | Quality |\n");
    table.push_str("|---|--------|--------|--------|-----|-----------|-----------|---------|------|------------|--------|\n");

    for (i, rec) in recommendations.iter().enumerate() {
        let collateral = rec.contract.strike * 100.0 * rec.contracts_allocated as f64;
        table.push_str(&format!(
            "| {} | {} | ${:.2} | {} | {} | {} | ${:.2} | {:.1}% | {} | ${:.0} | {:.0} |\n",
            i + 1,
            rec.ticker,
            rec.contract.strike,
            rec.contract.expiration,
            rec.contract.dte,
            rec.contracts_allocated,
            rec.contract.mid_price(),
            rec.annualised_roc,
            rec.contract.open_interest,
            collateral,
            rec.quality_score,
        ));
    }
    table
}

fn build_user_prompt(
    recommendations: &[WheelRecommendation],
    inventory: &Inventory,
    available_cash: f64,
    min_dte: u32,
    max_dte: u32,
) -> String {
    let mut user_prompt = include_str!("user.md").to_string();
    user_prompt = user_prompt.replace("{{inventory_section}}", &format_inventory_section(inventory));

    let cash_str = if available_cash.is_finite() {
        format!("${:.2}", available_cash)
    } else {
        "unlimited (paper trading)".to_string()
    };
    user_prompt = user_prompt.replace("{{available_cash}}", &cash_str);
    user_prompt = user_prompt.replace("{{dte_min}}", &min_dte.to_string());
    user_prompt = user_prompt.replace("{{dte_max}}", &max_dte.to_string());

    // Split recommendations into CC and CSP groups
    let cc_recs: Vec<&WheelRecommendation> = recommendations
        .iter()
        .filter(|r| r.leg == WheelLeg::CoveredCall)
        .collect();
    let csp_recs: Vec<&WheelRecommendation> = recommendations
        .iter()
        .filter(|r| r.leg == WheelLeg::CashSecuredPut)
        .collect();

    let cc_section = if cc_recs.is_empty() {
        "## Covered Calls (CC)\n\nNo CC trades — no shares held.".to_string()
    } else {
        let table = format_cc_table(&cc_recs);
        format!(
            "## Covered Calls (CC) — {} trades\n\nUse existing shares. Rank these independently from CSPs.\n\n{}",
            cc_recs.len(),
            table
        )
    };

    let csp_section = if csp_recs.is_empty() {
        "## Cash-Secured Puts (CSP)\n\nNo CSP trades — insufficient cash or all tickers have full positions.".to_string()
    } else {
        let table = format_csp_table(&csp_recs);
        format!(
            "## Cash-Secured Puts (CSP) — {} trades\n\nUse available cash. Rank these independently from CCs.\n\n{}",
            csp_recs.len(),
            table
        )
    };

    user_prompt = user_prompt.replace("{{cc_section}}", &cc_section);
    user_prompt = user_prompt.replace("{{csp_section}}", &csp_section);

    user_prompt
}

// ── Public assembler ──────────────────────────────────────────────────────────

pub fn build_ranking_prompt(
    recommendations: &[WheelRecommendation],
    inventory: &Inventory,
    available_cash: f64,
    min_dte: u32,
    max_dte: u32,
) -> LlmPrompt {
    LlmPrompt {
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: build_system_prompt().to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: build_user_prompt(recommendations, inventory, available_cash, min_dte, max_dte),
            },
        ],
        temperature: 0.3,
        max_tokens: 2048,
    }
}
