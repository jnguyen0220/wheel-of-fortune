use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

/// Upcoming earnings date for a ticker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarningsCalendar {
    pub ticker: String,
    /// Earnings report date (YYYY-MM-DD).
    pub earnings_date: NaiveDate,
    /// Days until earnings from today.
    pub days_until: i64,
    /// Time of day: "BMO" (before market open), "AMC" (after market close), or "TAS" (time not supplied).
    pub time_of_day: String,
}

/// Historical earnings result for a single quarter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarningsResult {
    pub ticker: String,
    /// Report date (YYYY-MM-DD).
    pub report_date: NaiveDate,
    /// Fiscal quarter label, e.g. "Q1 2025".
    pub fiscal_quarter: String,
    /// Consensus EPS estimate.
    pub eps_estimate: Option<f64>,
    /// Actual reported EPS.
    pub eps_actual: Option<f64>,
    /// EPS surprise (actual − estimate).
    pub eps_surprise: Option<f64>,
    /// Consensus revenue estimate (USD).
    pub revenue_estimate: Option<f64>,
    /// Actual reported revenue (USD).
    pub revenue_actual: Option<f64>,
    /// Whether the company beat EPS estimate.
    pub beat: Option<bool>,
}
