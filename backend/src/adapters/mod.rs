pub mod json_adapter;
pub mod web_api_adapter;
pub mod yahoo_finance;

use anyhow::Result;
use async_trait::async_trait;

use crate::models::{OptionsChain, StockMarketData};

/// Trait that abstracts the source of options market data.
/// Implement this to add new data providers (mock JSON, live API, etc.).
#[async_trait]
pub trait OptionsDataProvider: Send + Sync {
    /// Fetch the full options chain for the given ticker symbol.
    async fn fetch_options_chain(&self, ticker: &str) -> Result<OptionsChain>;

    /// Fetch market data (current price, daily range, 52-week range) for a ticker.
    /// Default implementation derives approximate values from the options chain.
    async fn fetch_stock_market_data(&self, ticker: &str) -> Result<StockMarketData> {
        let chain = self.fetch_options_chain(ticker).await?;
        let price = chain.underlying_price;
        Ok(StockMarketData {
            ticker: ticker.to_uppercase(),
            price,
            daily_low: price * 0.98,
            daily_high: price * 1.02,
            week52_low: price * 0.75,
            week52_high: price * 1.30,
        })
    }

    /// Fetch options chains for multiple tickers.
    async fn fetch_options_chains(&self, tickers: &[String]) -> Result<Vec<OptionsChain>> {
        let mut chains = Vec::new();
        for ticker in tickers {
            match self.fetch_options_chain(ticker).await {
                Ok(chain) => chains.push(chain),
                Err(e) => {
                    // Log the error but continue with other tickers
                    tracing::warn!("Failed to fetch options for {}: {}", ticker, e);
                }
            }
        }
        // Return error only if we couldn't fetch any data
        if chains.is_empty() {
            anyhow::bail!("Failed to fetch options data for any of the requested tickers");
        }
        Ok(chains)
    }

    /// Human-readable name of this adapter (for logging / diagnostics).
    fn adapter_name(&self) -> &'static str;
}
