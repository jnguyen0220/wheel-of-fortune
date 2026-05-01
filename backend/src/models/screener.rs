use serde::{Deserialize, Serialize};

/// A stock candidate surfaced by the undervalued stock screener.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenerCandidate {
    pub ticker: String,
    /// Current market price.
    pub current_price: f64,
    /// Analyst consensus target price (mean).
    pub target_price: Option<f64>,
    /// Upside to analyst target (as percent, e.g. 15.0 = 15%).
    pub upside_percent: Option<f64>,
    /// Forward P/E ratio.
    pub forward_pe: Option<f64>,
    /// Trailing P/E ratio.
    pub trailing_pe: Option<f64>,
    /// PEG ratio (P/E / growth).
    pub peg_ratio: Option<f64>,
    /// Price-to-book ratio.
    pub price_to_book: Option<f64>,
    /// Profit margin (as decimal, e.g. 0.25 = 25%).
    pub profit_margin: Option<f64>,
    /// Revenue growth YoY (as decimal, e.g. 0.12 = 12%).
    pub revenue_growth: Option<f64>,
    /// Debt-to-equity ratio.
    pub debt_to_equity: Option<f64>,
    /// Free cash flow (TTM, USD).
    pub free_cash_flow: Option<f64>,
    /// Number of analysts covering the stock.
    pub analyst_count: Option<u32>,
    /// 0–100 composite undervalue score.
    pub value_score: u8,
    /// Why this stock is considered undervalued.
    pub reasons: Vec<String>,
}

/// Compute the composite value score for a screener candidate.
pub fn compute_value_score(c: &mut ScreenerCandidate) {
    let mut score: f64 = 0.0;
    let mut reasons = Vec::new();

    // Upside to analyst target (max 30 pts)
    if let Some(upside) = c.upside_percent {
        if upside >= 30.0 {
            score += 30.0;
            reasons.push(format!("{:.0}% upside to analyst target", upside));
        } else if upside >= 20.0 {
            score += 25.0;
            reasons.push(format!("{:.0}% upside to analyst target", upside));
        } else if upside >= 10.0 {
            score += 15.0;
            reasons.push(format!("{:.0}% upside to analyst target", upside));
        } else if upside > 0.0 {
            score += 5.0;
        }
    }

    // Forward P/E (max 20 pts)
    if let Some(fpe) = c.forward_pe {
        if fpe > 0.0 && fpe < 12.0 {
            score += 20.0;
            reasons.push(format!("Low forward P/E ({:.1})", fpe));
        } else if fpe > 0.0 && fpe < 18.0 {
            score += 12.0;
            reasons.push(format!("Reasonable forward P/E ({:.1})", fpe));
        } else if fpe > 0.0 && fpe < 25.0 {
            score += 5.0;
        }
    }

    // PEG ratio (max 20 pts)
    if let Some(peg) = c.peg_ratio {
        if peg > 0.0 && peg < 1.0 {
            score += 20.0;
            reasons.push(format!("PEG < 1 ({:.2}) — undervalued vs growth", peg));
        } else if peg > 0.0 && peg < 1.5 {
            score += 10.0;
            reasons.push(format!("PEG {:.2} — fairly valued vs growth", peg));
        }
    }

    // Price-to-book (max 15 pts)
    if let Some(pb) = c.price_to_book {
        if pb > 0.0 && pb < 1.0 {
            score += 15.0;
            reasons.push(format!("Trading below book value (P/B {:.2})", pb));
        } else if pb > 0.0 && pb < 2.0 {
            score += 8.0;
            reasons.push(format!("Low P/B ratio ({:.2})", pb));
        } else if pb > 0.0 && pb < 3.0 {
            score += 3.0;
        }
    }

    // Profitability bonus (max 10 pts)
    if let Some(pm) = c.profit_margin {
        if pm > 0.20 {
            score += 10.0;
        } else if pm > 0.10 {
            score += 6.0;
        } else if pm > 0.0 {
            score += 3.0;
        }
    }

    // Free cash flow positive (max 5 pts)
    if let Some(fcf) = c.free_cash_flow {
        if fcf > 0.0 {
            score += 5.0;
        }
    }

    c.value_score = (score.round() as u8).min(100);
    c.reasons = reasons;
}
