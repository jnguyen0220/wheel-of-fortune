pub mod yahoo_finance;

use anyhow::Result;
use async_trait::async_trait;

use crate::models::{OptionsChain, StockMarketData};

/// Trait that abstracts the source of options market data.
#[async_trait]
pub trait OptionsDataProvider: Send + Sync {
    /// Fetch the full options chain for the given ticker symbol.
    async fn fetch_options_chain(&self, ticker: &str) -> Result<OptionsChain>;

    /// Fetch market data (current price, daily range, 52-week range) for a ticker.
    async fn fetch_stock_market_data(&self, ticker: &str) -> Result<StockMarketData>;

    /// Fetch options chains for multiple tickers.
    async fn fetch_options_chains(&self, tickers: &[String]) -> Result<Vec<OptionsChain>>;
}
