use serde::{Deserialize, Serialize};

/// Analyst recommendation trend for a ticker from Yahoo Finance.
///
/// Represents a single time period (e.g. current month, one month ago)
/// with the distribution of analyst ratings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalystTrend {
    pub ticker: String,
    pub period: String,
    pub strong_buy: u32,
    pub buy: u32,
    pub hold: u32,
    pub sell: u32,
    pub strong_sell: u32,
}
