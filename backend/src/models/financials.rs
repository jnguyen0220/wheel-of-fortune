use serde::{Deserialize, Serialize};

/// A simplified financial health scorecard for a ticker, derived from
/// Yahoo Finance's financialData and defaultKeyStatistics modules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialHealth {
    pub ticker: String,
    /// Full company name (e.g. "Apple Inc.").
    pub name: Option<String>,

    // ── Profitability ─────────────────────────────────────────────────────────
    /// Trailing-twelve-month revenue (USD).
    pub revenue: Option<f64>,
    /// Revenue growth (year-over-year, as a decimal e.g. 0.12 = 12%).
    pub revenue_growth: Option<f64>,
    /// Net income (TTM, USD).
    pub net_income: Option<f64>,
    /// Profit margin (net income / revenue, as a decimal).
    pub profit_margin: Option<f64>,
    /// Operating margin (as a decimal).
    pub operating_margin: Option<f64>,
    /// Earnings per share (TTM).
    pub earnings_per_share: Option<f64>,

    // ── Balance sheet strength ────────────────────────────────────────────────
    /// Total cash on hand (USD).
    pub total_cash: Option<f64>,
    /// Total debt (USD).
    pub total_debt: Option<f64>,
    /// Debt-to-equity ratio.
    pub debt_to_equity: Option<f64>,
    /// Current ratio (current assets / current liabilities).
    pub current_ratio: Option<f64>,

    // ── Efficiency & returns ──────────────────────────────────────────────────
    /// Return on equity (as a decimal).
    pub return_on_equity: Option<f64>,
    /// Return on assets (as a decimal).
    pub return_on_assets: Option<f64>,
    /// Free cash flow (TTM, USD).
    pub free_cash_flow: Option<f64>,
    /// Operating cash flow (TTM, USD).
    pub operating_cash_flow: Option<f64>,

    // ── Valuation ─────────────────────────────────────────────────────────────
    /// Trailing P/E ratio.
    pub trailing_pe: Option<f64>,
    /// Forward P/E ratio.
    pub forward_pe: Option<f64>,
    /// Price-to-book ratio.
    pub price_to_book: Option<f64>,
    /// PEG ratio (P/E divided by earnings growth rate).
    pub peg_ratio: Option<f64>,

    // ── Computed overall score ─────────────────────────────────────────────────
    /// 0–100 composite score summarising financial health.
    pub health_score: u8,
    /// Human-readable verdict: "Strong", "Healthy", "Fair", "Weak", "Poor".
    pub verdict: String,
    /// Brief list of strengths.
    pub strengths: Vec<String>,
    /// Brief list of concerns.
    pub concerns: Vec<String>,
}

/// Compute the composite health score from individual metrics.
pub fn compute_health_score(h: &mut FinancialHealth) {
    let mut score: f64 = 50.0; // start neutral
    let mut strengths = Vec::new();
    let mut concerns = Vec::new();

    // Revenue growth
    if let Some(rg) = h.revenue_growth {
        if rg > 0.20 {
            score += 10.0;
            strengths.push("Strong revenue growth (>20%)".to_string());
        } else if rg > 0.10 {
            score += 6.0;
            strengths.push("Solid revenue growth (>10%)".to_string());
        } else if rg > 0.0 {
            score += 2.0;
        } else {
            score -= 8.0;
            concerns.push("Revenue is declining".to_string());
        }
    }

    // Profit margin
    if let Some(pm) = h.profit_margin {
        if pm > 0.20 {
            score += 10.0;
            strengths.push("High profit margin (>20%)".to_string());
        } else if pm > 0.10 {
            score += 5.0;
            strengths.push("Healthy profit margin (>10%)".to_string());
        } else if pm > 0.0 {
            score += 2.0;
        } else {
            score -= 10.0;
            concerns.push("Company is not profitable".to_string());
        }
    }

    // Operating margin
    if let Some(om) = h.operating_margin {
        if om > 0.25 {
            score += 5.0;
        } else if om < 0.0 {
            score -= 5.0;
            concerns.push("Negative operating margin".to_string());
        }
    }

    // Debt-to-equity
    if let Some(de) = h.debt_to_equity {
        if de < 30.0 {
            score += 8.0;
            strengths.push("Low debt (D/E < 0.3)".to_string());
        } else if de < 100.0 {
            score += 3.0;
        } else if de > 200.0 {
            score -= 8.0;
            concerns.push("High debt load (D/E > 2.0)".to_string());
        } else if de > 150.0 {
            score -= 4.0;
            concerns.push("Elevated debt (D/E > 1.5)".to_string());
        }
    }

    // Current ratio
    if let Some(cr) = h.current_ratio {
        if cr > 2.0 {
            score += 5.0;
            strengths.push("Strong liquidity (current ratio > 2)".to_string());
        } else if cr > 1.5 {
            score += 3.0;
        } else if cr < 1.0 {
            score -= 8.0;
            concerns.push("Poor liquidity (current ratio < 1)".to_string());
        }
    }

    // Return on equity
    if let Some(roe) = h.return_on_equity {
        if roe > 0.20 {
            score += 8.0;
            strengths.push("Excellent ROE (>20%)".to_string());
        } else if roe > 0.10 {
            score += 4.0;
        } else if roe < 0.0 {
            score -= 6.0;
            concerns.push("Negative return on equity".to_string());
        }
    }

    // Free cash flow
    if let Some(fcf) = h.free_cash_flow {
        if fcf > 0.0 {
            score += 6.0;
            strengths.push("Positive free cash flow".to_string());
        } else {
            score -= 6.0;
            concerns.push("Negative free cash flow".to_string());
        }
    }

    // Valuation (P/E)
    if let Some(pe) = h.trailing_pe {
        if pe > 0.0 && pe < 15.0 {
            score += 4.0;
            strengths.push("Attractively valued (P/E < 15)".to_string());
        } else if pe > 50.0 {
            score -= 4.0;
            concerns.push("Expensive valuation (P/E > 50)".to_string());
        }
    }

    // PEG ratio
    if let Some(peg) = h.peg_ratio {
        if peg > 0.0 && peg < 1.0 {
            score += 4.0;
            strengths.push("PEG < 1 suggests undervalued growth".to_string());
        } else if peg > 3.0 {
            score -= 3.0;
        }
    }

    // Clamp score to 0–100
    let final_score = score.clamp(0.0, 100.0) as u8;
    let verdict = match final_score {
        80..=100 => "Strong",
        65..=79 => "Healthy",
        45..=64 => "Fair",
        25..=44 => "Weak",
        _ => "Poor",
    };

    h.health_score = final_score;
    h.verdict = verdict.to_string();
    h.strengths = strengths;
    h.concerns = concerns;
}
