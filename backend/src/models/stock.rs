use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Market data for a stock
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockMarketData {
    pub ticker: String,
    pub price: f64,
    pub daily_low: f64,
    pub daily_high: f64,
    pub week52_low: f64,
    pub week52_high: f64,
    /// Whether this stock trades in pre-market and after-hours sessions.
    pub has_pre_post_market_data: bool,
    /// Current market state: "PRE", "REGULAR", "POST", "POSTPOST", "PREPRE", "CLOSED".
    pub market_state: String,
    /// Pre-market price (if available and market is in PRE state).
    pub pre_market_price: Option<f64>,
    /// Pre-market change percent.
    pub pre_market_change_percent: Option<f64>,
    /// Post-market price (if available and market is in POST state).
    pub post_market_price: Option<f64>,
    /// Post-market change percent.
    pub post_market_change_percent: Option<f64>,
}

/// A stock holding in the user's inventory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockHolding {
    pub id: Uuid,
    pub ticker: String,
    pub shares: u32,
    /// Average cost basis per share
    pub cost_basis: f64,
    /// Current market price per share
    pub current_price: f64,
}

impl StockHolding {
    pub fn market_value(&self) -> f64 {
        self.shares as f64 * self.current_price
    }

    pub fn unrealized_pnl(&self) -> f64 {
        (self.current_price - self.cost_basis) * self.shares as f64
    }

    pub fn pnl_percent(&self) -> f64 {
        if self.cost_basis == 0.0 {
            return 0.0;
        }
        ((self.current_price - self.cost_basis) / self.cost_basis) * 100.0
    }
}

/// Request body for adding/updating inventory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockHoldingInput {
    pub ticker: String,
    pub shares: u32,
    pub cost_basis: f64,
    pub current_price: f64,
}

/// Full user inventory
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Inventory {
    pub holdings: Vec<StockHolding>,
}


