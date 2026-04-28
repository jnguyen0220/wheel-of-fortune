use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub enum OptionType {
    Call,
    Put,
}

/// A single options contract
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionsContract {
    pub ticker: String,
    pub option_type: OptionType,
    pub strike: f64,
    pub expiration: NaiveDate,
    pub bid: f64,
    pub ask: f64,
    pub last: f64,
    pub volume: u64,
    pub open_interest: u64,
    pub implied_volatility: f64,
    /// Delta (0.0 – 1.0 for calls, -1.0 – 0.0 for puts)
    pub delta: f64,
    /// Theta (daily decay in dollars per contract, negative)
    pub theta: f64,
    /// Gamma (rate of change of delta per $1 move in underlying)
    #[serde(default)]
    pub gamma: f64,
    /// Vega (change in option price per 1 % move in IV)
    #[serde(default)]
    pub vega: f64,
    /// Number of days to expiration
    pub dte: u32,
    /// Underlying price at time of data fetch
    pub underlying_price: f64,
}

impl OptionsContract {
    /// Mid-market price (falls back to last traded price when bid/ask are unavailable)
    pub fn mid_price(&self) -> f64 {
        if self.bid > 0.0 && self.ask > 0.0 {
            (self.bid + self.ask) / 2.0
        } else if self.bid > 0.0 || self.ask > 0.0 {
            self.bid + self.ask // one is zero, so this gives the non-zero one
        } else {
            self.last
        }
    }

    /// Annualised return on capital for a CSP (premium / strike)
    pub fn csp_return_on_capital(&self) -> f64 {
        if self.strike == 0.0 || self.dte == 0 {
            return 0.0;
        }
        let annual_factor = 365.0 / self.dte as f64;
        (self.mid_price() / self.strike) * annual_factor * 100.0
    }

    /// Annualised return on capital for a CC (premium / underlying price)
    pub fn cc_return_on_capital(&self) -> f64 {
        if self.underlying_price == 0.0 || self.dte == 0 {
            return 0.0;
        }
        let annual_factor = 365.0 / self.dte as f64;
        (self.mid_price() / self.underlying_price) * annual_factor * 100.0
    }
}

/// Options chain for a ticker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionsChain {
    pub ticker: String,
    pub underlying_price: f64,
    pub contracts: Vec<OptionsContract>,
}
