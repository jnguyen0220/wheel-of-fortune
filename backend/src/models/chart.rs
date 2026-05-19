use serde::{Deserialize, Serialize};

/// A single OHLCV daily candle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    /// Unix timestamp (seconds) for the trading day.
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: u64,
}
