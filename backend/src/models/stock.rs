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

impl Inventory {
    pub fn total_market_value(&self) -> f64 {
        self.holdings.iter().map(|h| h.market_value()).sum()
    }
}
