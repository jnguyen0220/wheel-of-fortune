//! Web API Adapter – fetches live options data from MarketData.app.
//!
//! Uses the **Options Chain** endpoint:
//!   `GET https://api.marketdata.app/v1/options/chain/{UNDERLYING}/?expiration=YYYY-MM-DD&token=KEY`
//!
//! Expirations are fetched dynamically via:
//!   `GET https://api.marketdata.app/v1/options/expirations/{UNDERLYING}/?token=KEY`
//!
//! Documentation: https://www.marketdata.app/docs/api
//!
//! The response is a flat structure where each field is an array of values.
//! Only expirations in the 25-35 DTE window are fetched and merged into a
//! single [`OptionsChain`].
//!
//! # Configuration (environment variables)
//! | Variable          | Description                                  |
//! |-------------------|----------------------------------------------|
//! | `OPTIONS_API_KEY` | MarketData.app API key                       |

use anyhow::{Context, Result};
use async_trait::async_trait;
use futures::future;
use reqwest::Client;
use serde::Deserialize;
use tracing::{debug, instrument};

use crate::adapters::OptionsDataProvider;
use crate::models::{OptionsChain, OptionsContract, OptionType, StockMarketData};

// ── MarketData.app response types ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MarketDataExpirationsResponse {
    pub s: String, // "ok" or "error"
    pub expirations: Option<Vec<String>>,
    pub errmsg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MarketDataCandlesResponse {
    pub s: String,
    pub h: Vec<f64>,
    pub l: Vec<f64>,
    pub c: Vec<f64>,
    pub errmsg: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(non_snake_case)]
struct MarketDataChainResponse {
    pub s: String, // "ok" or "error"
    pub strike: Vec<f64>,
    pub bid: Vec<Option<f64>>,
    pub ask: Vec<Option<f64>>,
    pub last: Vec<Option<f64>>,
    pub volume: Vec<Option<u64>>,
    pub openInterest: Vec<Option<u64>>,
    pub iv: Vec<Option<f64>>,
    pub delta: Vec<Option<f64>>,
    pub gamma: Vec<Option<f64>>,
    pub vega: Vec<Option<f64>>,
    pub theta: Vec<Option<f64>>,
    pub side: Vec<String>,
    pub dte: Vec<u32>,
    #[serde(alias = "underlying")]
    pub _underlying: Vec<String>,
    pub underlyingPrice: Vec<f64>,
    pub expiration: Vec<i64>,
    pub errmsg: Option<String>,
}

// ── Adapter ───────────────────────────────────────────────────────────────────

pub struct WebApiAdapter {
    client: Client,
    api_key: String,
}

/// Base URL for the MarketData.app REST API.
const MARKETDATA_BASE: &str = "https://api.marketdata.app/v1";

impl WebApiAdapter {
    /// Construct the adapter. Reads `OPTIONS_API_KEY` from the environment.
    pub fn from_env() -> Result<Self> {
        let api_key =
            std::env::var("OPTIONS_API_KEY").context("OPTIONS_API_KEY not set")?;

        let client = Client::builder()
            .build()
            .context("Failed to build HTTP client")?;

        Ok(Self { client, api_key })
    }

    /// Fetch available expirations for a ticker.
    async fn fetch_expirations(&self, ticker: &str) -> Result<Vec<String>> {
        let url = format!(
            "{MARKETDATA_BASE}/options/expirations/{ticker}/?token={}",
            self.api_key
        );

        debug!(url = %url, "Fetching MarketData expirations");

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .context("HTTP request failed")?
            .error_for_status()
            .context("MarketData API returned an error status")?
            .json::<MarketDataExpirationsResponse>()
            .await
            .context("Failed to deserialise MarketData API response")?;

        if resp.s != "ok" {
            anyhow::bail!(
                "MarketData expirations API error: {}",
                resp.errmsg.unwrap_or_default()
            );
        }

        resp.expirations.context("No expirations in response")
    }

    /// Fetch and filter expirations to the 25-35 DTE window.
    async fn fetch_target_expirations(&self, ticker: &str) -> Result<Vec<String>> {
        use chrono::{Local, NaiveDate};

        let expirations = self.fetch_expirations(ticker).await?;
        let today = Local::now().naive_local().date();

        let target_expirations: Vec<String> = expirations
            .into_iter()
            .filter_map(|exp_str| {
                let exp_date = NaiveDate::parse_from_str(&exp_str, "%Y-%m-%d").ok()?;
                let days_to_exp = (exp_date - today).num_days();
                if (25..=35).contains(&days_to_exp) {
                    Some(exp_str)
                } else {
                    None
                }
            })
            .collect();

        Ok(target_expirations)
    }

    /// Fetch options chain for a specific expiration.
    async fn fetch_chain_for_expiration(
        &self,
        ticker: &str,
        expiration: &str,
    ) -> Result<MarketDataChainResponse> {
        let url = format!(
            "{MARKETDATA_BASE}/options/chain/{ticker}/?expiration={expiration}&token={}",
            self.api_key
        );

        debug!(url = %url, "Fetching MarketData options chain");

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .context("HTTP request failed")?
            .error_for_status()
            .context("MarketData API returned an error status")?
            .json::<MarketDataChainResponse>()
            .await
            .context("Failed to deserialise MarketData API response")?;

        if resp.s != "ok" {
            anyhow::bail!(
                "MarketData chain API error: {}",
                resp.errmsg.unwrap_or_default()
            );
        }

        Ok(resp)
    }

    /// Map arrays from MarketData response into individual [`OptionsContract`] items.
    fn map_contracts(
        chain: MarketDataChainResponse,
        ticker: &str,
    ) -> Result<Vec<OptionsContract>> {
        use chrono::DateTime;
        use chrono::Utc;

        let mut contracts = Vec::new();
        let len = chain.strike.len();

        for i in 0..len {
            let option_type = match chain.side.get(i).map(|s| s.as_str()) {
                Some("call") => OptionType::Call,
                Some("put") => OptionType::Put,
                _ => continue, // Skip unknown types
            };

            // Convert Unix timestamp to NaiveDate
            let expiration_timestamp = *chain.expiration.get(i).unwrap_or(&0);
            let datetime = DateTime::<Utc>::from_timestamp(expiration_timestamp, 0)
                .context("Invalid expiration timestamp")?;
            let expiration = datetime.naive_utc().date();

            let contract = OptionsContract {
                ticker: ticker.to_string(),
                option_type,
                strike: *chain.strike.get(i).unwrap_or(&0.0),
                expiration,
                bid: chain.bid.get(i).and_then(|v| *v).unwrap_or(0.0),
                ask: chain.ask.get(i).and_then(|v| *v).unwrap_or(0.0),
                last: chain.last.get(i).and_then(|v| *v).unwrap_or(0.0),
                volume: chain.volume.get(i).and_then(|v| *v).unwrap_or(0),
                open_interest: chain.openInterest.get(i).and_then(|v| *v).unwrap_or(0),
                implied_volatility: chain.iv.get(i).and_then(|v| *v).unwrap_or(0.0),
                delta: chain.delta.get(i).and_then(|v| *v).unwrap_or(0.0),
                theta: chain.theta.get(i).and_then(|v| *v).unwrap_or(0.0),
                gamma: chain.gamma.get(i).and_then(|v| *v).unwrap_or(0.0),
                vega: chain.vega.get(i).and_then(|v| *v).unwrap_or(0.0),
                dte: *chain.dte.get(i).unwrap_or(&0),
                underlying_price: *chain.underlyingPrice.get(i).unwrap_or(&0.0),
            };

            contracts.push(contract);
        }

        Ok(contracts)
    }

    /// Keep only structurally valid contracts.
    ///
    /// We intentionally avoid strategy-level prefiltering here so the LLM input
    /// mirrors the fetched chain data without hidden business-rule filtering.
    fn sanitize_contracts_for_prompt(
        contracts: Vec<OptionsContract>,
    ) -> Vec<OptionsContract> {
        contracts
            .into_iter()
            .filter(|c| c.strike > 0.0)
            .filter(|c| c.bid >= 0.0 && c.ask >= 0.0)
            .filter(|c| c.dte > 0)
            .collect()
    }

    /// Fallback: derive market data from MarketData.app daily candles.
    async fn fetch_market_data_from_candles(&self, ticker: &str) -> anyhow::Result<StockMarketData> {
        use chrono::Local;

        let ticker_upper = ticker.to_uppercase();
        let today = Local::now().naive_local().date();
        let one_year_ago = today - chrono::Duration::days(365);

        let url = format!(
            "{MARKETDATA_BASE}/stocks/candles/D/{ticker_upper}/?from={}&to={}&token={}",
            one_year_ago.format("%Y-%m-%d"),
            today.format("%Y-%m-%d"),
            self.api_key
        );

        debug!(url = %url, "Fetching MarketData daily candles (fallback)");

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .context("HTTP request failed")?
            .error_for_status()
            .context("MarketData candles API returned an error status")?;

        let data = resp
            .json::<MarketDataCandlesResponse>()
            .await
            .context("Failed to deserialise MarketData candles response")?;

        if data.s != "ok" {
            anyhow::bail!("MarketData candles error: {}", data.errmsg.unwrap_or_default());
        }
        if data.c.is_empty() {
            anyhow::bail!("No candle data returned for {ticker_upper}");
        }

        let price = *data.c.last().unwrap();
        let daily_high = *data.h.last().unwrap_or(&price);
        let daily_low = *data.l.last().unwrap_or(&price);
        let week52_high = data.h.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let week52_low = data.l.iter().copied().fold(f64::INFINITY, f64::min);

        Ok(StockMarketData {
            ticker: ticker_upper,
            price,
            daily_low,
            daily_high,
            week52_low,
            week52_high,
        })
    }
}

#[async_trait]
impl OptionsDataProvider for WebApiAdapter {
    fn adapter_name(&self) -> &'static str {
        "WebApiAdapter (MarketData.app live data)"
    }

    async fn fetch_stock_market_data(&self, ticker: &str) -> anyhow::Result<StockMarketData> {
        // Use Yahoo Finance as the primary source — no API key required and it
        // returns price, daily range, and 52-week range in a single request.
        // Fall back to the MarketData.app candles endpoint if Yahoo fails.
        match crate::adapters::yahoo_finance::fetch_yahoo_market_data(&self.client, ticker).await {
            Ok(data) => {
                tracing::debug!(ticker = %ticker, price = %data.price, "Yahoo Finance market data fetched");
                Ok(data)
            }
            Err(yahoo_err) => {
                tracing::warn!(
                    ticker = %ticker,
                    error = %yahoo_err,
                    "Yahoo Finance failed, falling back to MarketData.app candles"
                );
                self.fetch_market_data_from_candles(ticker).await
            }
        }
    }

    #[instrument(skip(self), fields(ticker))]
    async fn fetch_options_chain(&self, ticker: &str) -> Result<OptionsChain> {
        let ticker_upper = ticker.to_uppercase();

        // Primary source: MarketData.app (this adapter is explicitly the web API path).
        let target_expirations = self.fetch_target_expirations(&ticker_upper).await?;

        if target_expirations.is_empty() {
            anyhow::bail!("No expirations found in 25-35 DTE window for ticker {}", ticker_upper);
        }

        debug!(
            ticker = %ticker_upper,
            target_count = %target_expirations.len(),
            "Found target expirations in 25-35 DTE window"
        );

        // Fetch options chains for the target expirations in parallel
        let mut all_contracts = Vec::new();
        let mut underlying_price = 0.0;

        // Create parallel fetch futures
        let fetch_futures = target_expirations.iter().map(|expiration| {
            self.fetch_chain_for_expiration(&ticker_upper, expiration)
        });

        // Wait for all futures to complete
        let results = future::join_all(fetch_futures).await;

        for result in results {
            match result {
                Ok(chain) => {
                    let contracts = Self::map_contracts(chain.clone(), &ticker_upper)?;
                    all_contracts.extend(contracts);
                    
                    // Capture underlying price
                    if underlying_price == 0.0 {
                        underlying_price = chain.underlyingPrice.first().copied().unwrap_or(0.0);
                    }
                }
                Err(e) => {
                    debug!("Failed to fetch chain for expiration: {}", e);
                }
            }
        }

        let all_contracts = Self::sanitize_contracts_for_prompt(all_contracts);

        if all_contracts.is_empty() {
            anyhow::bail!("No valid options data found in 25-35 DTE window for ticker {}", ticker_upper);
        }

        Ok(OptionsChain {
            ticker: ticker_upper,
            underlying_price,
            contracts: all_contracts,
        })
    }
}
