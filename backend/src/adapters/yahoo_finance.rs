//! Yahoo Finance market data and options chain fetcher.
//!
//! # Market data (no auth required)
//! Uses the unofficial Yahoo Finance chart API:
//!   `GET https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=5d`
//!
//! # Options chain (crumb + cookie auth)
//! Uses the unofficial Yahoo Finance options API:
//!   `GET https://query1.finance.yahoo.com/v7/finance/options/{TICKER}?crumb={CRUMB}&date={TS}`
//!
//! The crumb is obtained by:
//! 1. `GET https://fc.yahoo.com` – populates the cookie jar
//! 2. `GET https://query1.finance.yahoo.com/v1/test/getcrumb` – returns the crumb string
//!
//! Yahoo's options response does **not** include option Greeks, so delta is
//! computed on-the-fly using the Black-Scholes formula with a 5 % risk-free rate.

use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::Datelike;
use reqwest::Client;
use serde::Deserialize;
use tracing::{debug, instrument};

use crate::adapters::OptionsDataProvider;
use crate::models::{AnalystTrend, EarningsCalendar, EarningsResult};
use crate::models::{OptionsChain, OptionsContract, OptionType, StockMarketData};

// ── Market data response types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct YahooChartResponse {
    chart: YahooChart,
}

#[derive(Debug, Deserialize)]
struct YahooChart {
    result: Option<Vec<YahooChartResult>>,
    error: Option<YahooError>,
}

#[derive(Debug, Deserialize)]
struct YahooChartResult {
    meta: YahooMeta,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooMeta {
    regular_market_price: Option<f64>,
    regular_market_day_high: Option<f64>,
    regular_market_day_low: Option<f64>,
    fifty_two_week_high: Option<f64>,
    fifty_two_week_low: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct YahooError {
    description: Option<String>,
}

// ── Public fetcher ────────────────────────────────────────────────────────────

/// Fetch live market data for `ticker` from Yahoo Finance.
///
/// Makes a single HTTPS request to Yahoo Finance's chart API and extracts
/// price, daily range, and 52-week range from the `meta` field.
#[instrument(skip(client))]
pub async fn fetch_yahoo_market_data(
    client: &Client,
    ticker: &str,
) -> Result<StockMarketData> {
    let url = format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=5d",
        ticker.to_uppercase()
    );

    let resp = client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .header("Accept", "application/json")
        .send()
        .await
        .context("HTTP request to Yahoo Finance failed")?;

    if !resp.status().is_success() {
        anyhow::bail!(
            "Yahoo Finance returned HTTP {} for ticker {}",
            resp.status(),
            ticker
        );
    }

    let body: YahooChartResponse = resp
        .json()
        .await
        .context("Failed to parse Yahoo Finance JSON response")?;

    if let Some(err) = body.chart.error {
        anyhow::bail!(
            "Yahoo Finance API error for {}: {}",
            ticker,
            err.description.unwrap_or_else(|| "unknown".to_string())
        );
    }

    let result = body
        .chart
        .result
        .and_then(|r| r.into_iter().next())
        .context("Yahoo Finance returned empty result array")?;

    let meta = result.meta;

    let price = meta
        .regular_market_price
        .context("Missing regularMarketPrice")?;
    let daily_high = meta.regular_market_day_high.unwrap_or(price);
    let daily_low = meta.regular_market_day_low.unwrap_or(price);
    let week52_high = meta.fifty_two_week_high.unwrap_or(price);
    let week52_low = meta.fifty_two_week_low.unwrap_or(price);

    Ok(StockMarketData {
        ticker: ticker.to_uppercase(),
        price,
        daily_high,
        daily_low,
        week52_high,
        week52_low,
    })
}

// ── Options API response types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooOptionsResponse {
    option_chain: YahooOptionChain,
}

#[derive(Debug, Deserialize)]
struct YahooOptionChain {
    result: Option<Vec<YahooOptionResult>>,
    error: Option<YahooError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooOptionResult {
    quote: YahooOptionQuote,
    /// All available expiration timestamps for this ticker
    expiration_dates: Vec<i64>,
    /// Options for the requested expiration date (usually one element)
    options: Vec<YahooOptionExpiry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooOptionQuote {
    regular_market_price: f64,
}

#[derive(Debug, Deserialize)]
struct YahooOptionExpiry {
    calls: Vec<YahooContract>,
    puts: Vec<YahooContract>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooContract {
    strike: f64,
    bid: Option<f64>,
    ask: Option<f64>,
    last_price: Option<f64>,
    volume: Option<u64>,
    open_interest: Option<u64>,
    implied_volatility: Option<f64>,
    expiration: i64,
}

// ── Black-Scholes helpers ─────────────────────────────────────────────────────

/// Abramowitz & Stegun approximation for the standard normal CDF.
/// Accurate to within ±1.5 × 10⁻⁷.
fn normal_cdf(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.2316419 * x.abs());
    let d = 0.3989422803 * (-x * x / 2.0).exp();
    let p = d * t
        * (0.3193815
            + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302745))));
    if x >= 0.0 {
        1.0 - p
    } else {
        p
    }
}

/// Standard normal probability density function φ(x).
#[inline]
fn normal_pdf(x: f64) -> f64 {
    std::f64::consts::FRAC_1_SQRT_2 * std::f64::consts::FRAC_2_SQRT_PI * 0.5
        * (-x * x / 2.0).exp()
}

/// Compute d1 and d2 for Black-Scholes.
/// Returns `None` when inputs are degenerate (t ≤ 0, σ ≤ 0, s ≤ 0, k ≤ 0).
fn bs_d1_d2(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> Option<(f64, f64)> {
    if t <= 0.0 || sigma <= 0.0 || s <= 0.0 || k <= 0.0 {
        return None;
    }
    let d1 = ((s / k).ln() + (r + sigma * sigma / 2.0) * t) / (sigma * t.sqrt());
    let d2 = d1 - sigma * t.sqrt();
    Some((d1, d2))
}

/// Black-Scholes delta for a European call option (returns a value in [0, 1]).
fn bs_call_delta(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, _)| normal_cdf(d1))
        .unwrap_or(0.0)
}

/// Black-Scholes delta for a European put option (returns a value in [-1, 0]).
fn bs_put_delta(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, _)| normal_cdf(d1) - 1.0)
        .unwrap_or(0.0)
}

/// Black-Scholes gamma (identical for calls and puts).
/// Returned as Δ-delta per $1 move in the underlying.
fn bs_gamma(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, _)| normal_pdf(d1) / (s * sigma * t.sqrt()))
        .unwrap_or(0.0)
}

/// Black-Scholes vega (identical for calls and puts).
/// Returned as change in option value per 1 % move in IV (divided by 100).
fn bs_vega(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, _)| s * normal_pdf(d1) * t.sqrt() / 100.0)
        .unwrap_or(0.0)
}

/// Raw vega (dollars per unit σ change) used by the IV solver.
fn bs_vega_raw(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, _)| s * normal_pdf(d1) * t.sqrt())
        .unwrap_or(0.0)
}

/// Black-Scholes call price.
fn bs_call_price(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, d2)| s * normal_cdf(d1) - k * (-r * t).exp() * normal_cdf(d2))
        .unwrap_or(0.0)
}

/// Black-Scholes put price (via put-call parity for numerical stability).
fn bs_put_price(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, d2)| k * (-r * t).exp() * normal_cdf(-d2) - s * normal_cdf(-d1))
        .unwrap_or(0.0)
}

/// Newton-Raphson implied volatility solver.
///
/// Given a `market_price` (mid-price of bid/ask), inverts the Black-Scholes
/// formula to recover the implied volatility.  Returns `None` when the solver
/// fails to converge or the inputs are degenerate.
fn compute_iv(market_price: f64, s: f64, k: f64, t: f64, r: f64, is_call: bool) -> Option<f64> {
    if market_price <= 0.0 || t <= 0.0 || s <= 0.0 || k <= 0.0 {
        return None;
    }
    // Intrinsic value floor check: option must be worth more than intrinsic.
    let intrinsic = if is_call {
        (s - k * (-r * t).exp()).max(0.0)
    } else {
        (k * (-r * t).exp() - s).max(0.0)
    };
    if market_price <= intrinsic {
        return None;
    }

    let mut sigma: f64 = 0.30; // initial guess – 30 % IV
    for _ in 0..200 {
        let price = if is_call {
            bs_call_price(s, k, t, sigma, r)
        } else {
            bs_put_price(s, k, t, sigma, r)
        };
        let v = bs_vega_raw(s, k, t, sigma, r);
        if v.abs() < 1e-12 {
            break;
        }
        let diff = price - market_price;
        if diff.abs() < 1e-7 {
            break;
        }
        sigma -= diff / v;
        sigma = sigma.clamp(0.001, 10.0);
    }
    if sigma > 0.001 && sigma < 9.9 {
        Some(sigma)
    } else {
        None
    }
}

/// Black-Scholes theta for a European call option.
/// Returned as **daily** dollar decay per contract (×100 shares, ÷365).
fn bs_call_theta(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, d2)| {
            let annual = -(s * normal_pdf(d1) * sigma) / (2.0 * t.sqrt())
                - r * k * (-r * t).exp() * normal_cdf(d2);
            annual / 365.0 * 100.0
        })
        .unwrap_or(0.0)
}

/// Black-Scholes theta for a European put option.
/// Returned as **daily** dollar decay per contract (×100 shares, ÷365).
fn bs_put_theta(s: f64, k: f64, t: f64, sigma: f64, r: f64) -> f64 {
    bs_d1_d2(s, k, t, sigma, r)
        .map(|(d1, d2)| {
            let annual = -(s * normal_pdf(d1) * sigma) / (2.0 * t.sqrt())
                + r * k * (-r * t).exp() * normal_cdf(-d2);
            annual / 365.0 * 100.0
        })
        .unwrap_or(0.0)
}

// ── Yahoo options fetcher ─────────────────────────────────────────────────────

const YF_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
    AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// Obtain a Yahoo Finance crumb using a fresh cookie-enabled HTTP client.
///
/// Returns `(client_with_cookies, crumb_string)`.
pub async fn acquire_crumb() -> Result<(Client, String)> {
    let client = Client::builder()
        .cookie_store(true)
        .user_agent(YF_USER_AGENT)
        .build()
        .context("Failed to build cookie-enabled HTTP client")?;

    // 1. Seed the cookie jar by visiting fc.yahoo.com
    client
        .get("https://fc.yahoo.com")
        .header("Accept", "text/html")
        .send()
        .await
        .context("Failed to reach fc.yahoo.com")?;

    // 2. Fetch the crumb
    let crumb = client
        .get("https://query1.finance.yahoo.com/v1/test/getcrumb")
        .header("Accept", "text/plain")
        .send()
        .await
        .context("Failed to fetch Yahoo Finance crumb")?
        .text()
        .await
        .context("Failed to read crumb response")?;

    if crumb.is_empty() || crumb.contains("Unauthorized") {
        anyhow::bail!("Yahoo Finance crumb acquisition failed: {crumb}");
    }

    Ok((client, crumb))
}

/// Fetch options data for a single expiration timestamp.
async fn fetch_expiration_data(
    client: &Client,
    ticker: &str,
    crumb: &str,
    expiration_ts: i64,
) -> Result<(Vec<YahooContract>, Vec<YahooContract>, f64)> {
    let url = format!(
        "https://query1.finance.yahoo.com/v7/finance/options/{ticker}?crumb={crumb}&date={expiration_ts}",
        ticker = ticker.to_uppercase()
    );

    let resp: YahooOptionsResponse = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .context("HTTP request to Yahoo Finance options API failed")?
        .json()
        .await
        .context("Failed to parse Yahoo Finance options JSON")?;

    if let Some(err) = resp.option_chain.error {
        anyhow::bail!(
            "Yahoo Finance options error: {}",
            err.description.unwrap_or_default()
        );
    }

    let result = resp
        .option_chain
        .result
        .and_then(|r| r.into_iter().next())
        .context("Yahoo Finance options returned empty result")?;

    let underlying = result.quote.regular_market_price;
    let expiry = result.options.into_iter().next().unwrap_or(YahooOptionExpiry {
        calls: vec![],
        puts: vec![],
    });

    Ok((expiry.calls, expiry.puts, underlying))
}

/// Convert a [`YahooContract`] into an [`OptionsContract`], computing delta
/// via Black-Scholes.
fn map_yahoo_contract(
    raw: YahooContract,
    option_type: OptionType,
    ticker: &str,
    underlying: f64,
) -> Option<OptionsContract> {
    use chrono::{DateTime, Local, Utc};

    let expiration_dt = DateTime::<Utc>::from_timestamp(raw.expiration, 0)?;
    let expiration = expiration_dt.naive_utc().date();

    let today = Local::now().naive_local().date();
    let dte = (expiration - today).num_days();
    if dte < 0 {
        return None;
    }
    let dte = dte as u32;

    let yahoo_iv = raw.implied_volatility.unwrap_or(0.0);
    let t_years = dte as f64 / 365.0;
    let r = 0.05; // risk-free rate (5 %)

    // Prefer computing IV from the mid-price via Newton-Raphson: Yahoo's
    // impliedVolatility field is unreliable and can be orders of magnitude off,
    // producing degenerate Black-Scholes deltas (0 or -1).
    // Fall back to Yahoo's reported value only when the mid-price solver fails
    // AND Yahoo's value is within a plausible range (5 %–500 % annualised).
    let is_call = matches!(option_type, OptionType::Call);
    let mid = ((raw.bid.unwrap_or(0.0) + raw.ask.unwrap_or(0.0)) / 2.0)
        .max(raw.last_price.unwrap_or(0.0));
    let iv = if let Some(solved) = compute_iv(mid, underlying, raw.strike, t_years, r, is_call) {
        solved
    } else if yahoo_iv >= 0.05 && yahoo_iv <= 5.0 {
        // Yahoo's value is plausible – use it as a last resort.
        yahoo_iv
    } else {
        // No usable IV; skip this contract.
        return None;
    };

    debug!(
        ticker = %ticker,
        strike = %raw.strike,
        iv = %iv,
        dte = %dte,
        "computed IV for contract"
    );

    let delta = match option_type {
        OptionType::Put => bs_put_delta(underlying, raw.strike, t_years, iv, r),
        OptionType::Call => bs_call_delta(underlying, raw.strike, t_years, iv, r),
    };

    let gamma = bs_gamma(underlying, raw.strike, t_years, iv, r);
    let vega = bs_vega(underlying, raw.strike, t_years, iv, r);
    let theta = match option_type {
        OptionType::Put => bs_put_theta(underlying, raw.strike, t_years, iv, r),
        OptionType::Call => bs_call_theta(underlying, raw.strike, t_years, iv, r),
    };

    Some(OptionsContract {
        ticker: ticker.to_uppercase(),
        option_type,
        strike: raw.strike,
        expiration,
        bid: raw.bid.unwrap_or(0.0),
        ask: raw.ask.unwrap_or(0.0),
        last: raw.last_price.unwrap_or(0.0),
        volume: raw.volume.unwrap_or(0),
        open_interest: raw.open_interest.unwrap_or(0),
        implied_volatility: iv,
        delta,
        theta,
        gamma,
        vega,
        dte,
        underlying_price: underlying,
    })
}

/// Fetch a full options chain for `ticker` using an already-acquired session.
async fn fetch_yahoo_options_chain_with_session(
    ticker: &str,
    cookie_client: &Client,
    crumb: &str,
) -> Result<OptionsChain> {
    use chrono::Local;

    let ticker_upper = ticker.to_uppercase();

    debug!(ticker = %ticker_upper, "Fetching Yahoo Finance options chain (shared session)");

    // Fetch the front-page options response to get all expiration timestamps
    let url = format!(
        "https://query1.finance.yahoo.com/v7/finance/options/{ticker_upper}?crumb={crumb}"
    );

    let front: YahooOptionsResponse = cookie_client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .context("Failed to fetch Yahoo options front page")?
        .json()
        .await
        .context("Failed to parse Yahoo options front page JSON")?;

    if let Some(err) = front.option_chain.error {
        anyhow::bail!(
            "Yahoo Finance options error: {}",
            err.description.unwrap_or_default()
        );
    }

    let front_result = front
        .option_chain
        .result
        .and_then(|r| r.into_iter().next())
        .context("Yahoo Finance returned empty options result")?;

    let underlying = front_result.quote.regular_market_price;
    let all_expirations = front_result.expiration_dates;

    // Fetch all future expirations — the strategy engine filters by DTE range
    let today = Local::now().naive_local().date();
    let target_ts: Vec<i64> = all_expirations
        .into_iter()
        .filter(|&ts| {
            use chrono::{DateTime, Utc};
            if let Some(dt) = DateTime::<Utc>::from_timestamp(ts, 0) {
                let exp_date = dt.naive_utc().date();
                let dte = (exp_date - today).num_days();
                dte >= 1 && dte <= 90
            } else {
                false
            }
        })
        .collect();

    if target_ts.is_empty() {
        anyhow::bail!("No future expirations found for {ticker_upper}");
    }

    let mut all_contracts: Vec<OptionsContract> = Vec::new();

    for ts in target_ts {
        match fetch_expiration_data(cookie_client, &ticker_upper, crumb, ts).await {
            Ok((calls, puts, ul)) => {
                let underlying = if ul > 0.0 { ul } else { underlying };
                for raw in puts {
                    if let Some(c) = map_yahoo_contract(raw, OptionType::Put, &ticker_upper, underlying) {
                        all_contracts.push(c);
                    }
                }
                for raw in calls {
                    if let Some(c) = map_yahoo_contract(raw, OptionType::Call, &ticker_upper, underlying) {
                        all_contracts.push(c);
                    }
                }
            }
            Err(e) => {
                debug!(ts, error = %e, "Failed to fetch Yahoo options for expiration, skipping");
            }
        }
    }

    if all_contracts.is_empty() {
        anyhow::bail!("No options contracts fetched from Yahoo Finance for {ticker_upper}");
    }

    Ok(OptionsChain {
        ticker: ticker_upper,
        underlying_price: underlying,
        contracts: all_contracts,
    })
}

/// Fetch a full options chain for `ticker` from Yahoo Finance.
///
/// Acquires a crumb + cookie session, discovers all expirations in the 25-35 DTE
/// window, fetches each one, and computes put/call delta via Black-Scholes.
#[instrument(skip_all, fields(ticker))]
pub async fn fetch_yahoo_options_chain(ticker: &str) -> Result<OptionsChain> {
    let ticker_upper = ticker.to_uppercase();

    // Acquire crumb + cookie session
    let (cookie_client, crumb) = acquire_crumb()
        .await
        .context("Yahoo Finance crumb acquisition failed")?;

    debug!(ticker = %ticker_upper, "Yahoo Finance crumb acquired");

    fetch_yahoo_options_chain_with_session(&ticker_upper, &cookie_client, &crumb).await
}

// ── Adapter struct ────────────────────────────────────────────────────────────

/// [`OptionsDataProvider`] implementation backed by Yahoo Finance.
///
/// No API key required. Uses the unofficial crumb + cookie auth flow.
pub struct YahooFinanceAdapter;

#[async_trait]
impl OptionsDataProvider for YahooFinanceAdapter {
    fn adapter_name(&self) -> &'static str {
        "YahooFinanceAdapter"
    }

    async fn fetch_options_chain(&self, ticker: &str) -> Result<OptionsChain> {
        fetch_yahoo_options_chain(ticker).await
    }

    /// Override the default implementation to acquire the Yahoo crumb **once**
    /// and reuse it for all tickers, avoiding per-ticker session overhead and
    /// rate-limit issues that cause subsequent tickers to fail.
    async fn fetch_options_chains(&self, tickers: &[String]) -> Result<Vec<OptionsChain>> {
        let (cookie_client, crumb) = acquire_crumb()
            .await
            .context("Yahoo Finance crumb acquisition failed")?;

        // Fetch all tickers concurrently, sharing the same crumb + cookie session.
        let tasks: Vec<_> = tickers
            .iter()
            .map(|ticker| {
                let client = cookie_client.clone();
                let crumb = crumb.clone();
                let ticker = ticker.clone();
                tokio::spawn(async move {
                    fetch_yahoo_options_chain_with_session(&ticker, &client, &crumb).await
                        .map_err(|e| (ticker, e))
                })
            })
            .collect();

        let mut chains = Vec::new();
        for task in tasks {
            match task.await {
                Ok(Ok(chain)) => chains.push(chain),
                Ok(Err((ticker, e))) => tracing::warn!("Failed to fetch options for {}: {}", ticker, e),
                Err(e) => tracing::warn!("Task panicked: {}", e),
            }
        }

        if chains.is_empty() {
            anyhow::bail!("Failed to fetch options data for any of the requested tickers");
        }
        Ok(chains)
    }

    async fn fetch_stock_market_data(&self, ticker: &str) -> Result<StockMarketData> {
        // Use the dedicated chart endpoint for accurate market data.
        let client = Client::builder()
            .user_agent(YF_USER_AGENT)
            .build()
            .context("Failed to build HTTP client")?;
        fetch_yahoo_market_data(&client, ticker).await
    }
}

// ── Earnings calendar & history ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct YahooCalendarEvents {
    earnings: Option<YahooEarningsDates>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooEarningsDates {
    earnings_date: Option<Vec<YahooTimestamp>>,
}

#[derive(Debug, Deserialize)]
struct YahooTimestamp {
    raw: Option<i64>,
    fmt: Option<String>,
}

/// Yahoo Finance earnings history response.
#[derive(Debug, Deserialize)]
struct YahooEarningsHistoryOuter {
    history: Option<Vec<YahooEarningsHistoryItem>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooEarningsHistoryItem {
    quarter: Option<YahooTimestamp>,
    eps_estimate: Option<YahooNumeric>,
    eps_actual: Option<YahooNumeric>,
    eps_difference: Option<YahooNumeric>,
}

#[derive(Debug, Deserialize)]
struct YahooNumeric {
    raw: Option<f64>,
}

/// Quotesummary module response wrapper used for both calendar events and
/// earnings history.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuoteSummaryEnvelope {
    quote_summary: Option<QuoteSummaryInner>,
}

#[derive(Debug, Deserialize)]
struct QuoteSummaryInner {
    result: Option<Vec<QuoteSummaryResult>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuoteSummaryResult {
    calendar_events: Option<YahooCalendarEvents>,
    earnings_history: Option<YahooEarningsHistoryOuter>,
    recommendation_trend: Option<YahooRecommendationTrend>,
    financial_data: Option<YahooFinancialData>,
    default_key_statistics: Option<YahooKeyStatistics>,
    quote_type: Option<YahooQuoteType>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooQuoteType {
    short_name: Option<String>,
    long_name: Option<String>,
}

/// Fetch upcoming earnings date(s) for a single ticker from Yahoo Finance.
#[instrument(skip(client, crumb))]
pub async fn fetch_earnings_calendar(
    client: &Client,
    crumb: &str,
    ticker: &str,
) -> Result<Vec<EarningsCalendar>> {
    let url = format!(
        "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=calendarEvents&crumb={crumb}",
        ticker = ticker.to_uppercase(),
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .context("Failed to fetch earnings calendar")?;

    if !resp.status().is_success() {
        anyhow::bail!("Yahoo Finance returned HTTP {} for earnings calendar of {}", resp.status(), ticker);
    }

    let envelope: QuoteSummaryEnvelope = resp
        .json()
        .await
        .context("Failed to parse earnings calendar JSON")?;

    let dates = envelope
        .quote_summary
        .and_then(|qs| qs.result)
        .and_then(|r| r.into_iter().next())
        .and_then(|r| r.calendar_events)
        .and_then(|ce| ce.earnings)
        .and_then(|e| e.earnings_date)
        .unwrap_or_default();

    let today = chrono::Local::now().naive_local().date();

    let mut out = Vec::new();
    for ts_val in dates {
        if let Some(ts) = ts_val.raw {
            if let Some(dt) = chrono::DateTime::<chrono::Utc>::from_timestamp(ts, 0) {
                let date = dt.naive_utc().date();
                let days_until = (date - today).num_days();
                // Include dates up to 90 days out and recently past (up to 7 days ago)
                if days_until >= -7 && days_until <= 90 {
                    out.push(EarningsCalendar {
                        ticker: ticker.to_uppercase(),
                        earnings_date: date,
                        days_until,
                        time_of_day: ts_val.fmt.clone().unwrap_or_else(|| "TAS".to_string()),
                    });
                }
            }
        }
    }

    Ok(out)
}

/// Fetch past earnings results (EPS history) for a single ticker from Yahoo Finance.
#[instrument(skip(client, crumb))]
pub async fn fetch_earnings_history(
    client: &Client,
    crumb: &str,
    ticker: &str,
) -> Result<Vec<EarningsResult>> {
    let url = format!(
        "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=earningsHistory&crumb={crumb}",
        ticker = ticker.to_uppercase(),
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .context("Failed to fetch earnings history")?;

    if !resp.status().is_success() {
        anyhow::bail!("Yahoo Finance returned HTTP {} for earnings history of {}", resp.status(), ticker);
    }

    let envelope: QuoteSummaryEnvelope = resp
        .json()
        .await
        .context("Failed to parse earnings history JSON")?;

    let history = envelope
        .quote_summary
        .and_then(|qs| qs.result)
        .and_then(|r| r.into_iter().next())
        .and_then(|r| r.earnings_history)
        .and_then(|eh| eh.history)
        .unwrap_or_default();

    let mut out = Vec::new();
    for item in history {
        let quarter_ts = item.quarter.and_then(|q| q.raw).unwrap_or(0);
        let report_date = chrono::DateTime::<chrono::Utc>::from_timestamp(quarter_ts, 0)
            .map(|dt| dt.naive_utc().date())
            .unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(2000, 1, 1).unwrap());

        let eps_est = item.eps_estimate.and_then(|e| e.raw);
        let eps_act = item.eps_actual.and_then(|e| e.raw);
        let eps_diff = item.eps_difference.and_then(|e| e.raw);
        let beat = match (eps_est, eps_act) {
            (Some(est), Some(act)) => Some(act >= est),
            _ => None,
        };

        // Derive a fiscal quarter label from the report date
        let q = match report_date.month() {
            1..=3 => "Q1",
            4..=6 => "Q2",
            7..=9 => "Q3",
            _ => "Q4",
        };
        let fiscal_quarter = format!("{} {}", q, report_date.year());

        out.push(EarningsResult {
            ticker: ticker.to_uppercase(),
            report_date,
            fiscal_quarter,
            eps_estimate: eps_est,
            eps_actual: eps_act,
            eps_surprise: eps_diff,
            revenue_estimate: None,
            revenue_actual: None,
            beat,
        });
    }

    Ok(out)
}

// ── Recommendation trend ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct YahooRecommendationTrend {
    trend: Option<Vec<YahooTrendItem>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooTrendItem {
    period: Option<String>,
    strong_buy: Option<u32>,
    buy: Option<u32>,
    hold: Option<u32>,
    sell: Option<u32>,
    strong_sell: Option<u32>,
}

/// Fetch analyst recommendation trends for a single ticker from Yahoo Finance.
#[instrument(skip(client, crumb))]
pub async fn fetch_recommendation_trend(
    client: &Client,
    crumb: &str,
    ticker: &str,
) -> Result<Vec<AnalystTrend>> {
    let url = format!(
        "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=recommendationTrend&crumb={crumb}",
        ticker = ticker.to_uppercase(),
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .context("Failed to fetch recommendation trend")?;

    if !resp.status().is_success() {
        anyhow::bail!("Yahoo Finance returned HTTP {} for recommendation trend of {}", resp.status(), ticker);
    }

    let envelope: QuoteSummaryEnvelope = resp
        .json()
        .await
        .context("Failed to parse recommendation trend JSON")?;

    let items = envelope
        .quote_summary
        .and_then(|qs| qs.result)
        .and_then(|r| r.into_iter().next())
        .and_then(|r| r.recommendation_trend)
        .and_then(|rt| rt.trend)
        .unwrap_or_default();

    let out: Vec<AnalystTrend> = items
        .into_iter()
        .map(|item| AnalystTrend {
            ticker: ticker.to_uppercase(),
            period: item.period.unwrap_or_default(),
            strong_buy: item.strong_buy.unwrap_or(0),
            buy: item.buy.unwrap_or(0),
            hold: item.hold.unwrap_or(0),
            sell: item.sell.unwrap_or(0),
            strong_sell: item.strong_sell.unwrap_or(0),
        })
        .collect();

    Ok(out)
}

// ── Financial health data ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooFinancialData {
    total_revenue: Option<YahooNumeric>,
    revenue_growth: Option<YahooNumeric>,
    net_income_to_common: Option<YahooNumeric>,
    profit_margins: Option<YahooNumeric>,
    operating_margins: Option<YahooNumeric>,
    total_cash: Option<YahooNumeric>,
    total_debt: Option<YahooNumeric>,
    debt_to_equity: Option<YahooNumeric>,
    current_ratio: Option<YahooNumeric>,
    return_on_equity: Option<YahooNumeric>,
    return_on_assets: Option<YahooNumeric>,
    free_cashflow: Option<YahooNumeric>,
    operating_cashflow: Option<YahooNumeric>,
    earnings_growth: Option<YahooNumeric>,
    current_price: Option<YahooNumeric>,
    target_mean_price: Option<YahooNumeric>,
    number_of_analyst_opinions: Option<YahooNumeric>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooKeyStatistics {
    trailing_eps: Option<YahooNumeric>,
    #[serde(alias = "forwardPE")]
    forward_pe: Option<YahooNumeric>,
    #[serde(alias = "trailingPE")]
    trailing_pe: Option<YahooNumeric>,
    price_to_book: Option<YahooNumeric>,
    peg_ratio: Option<YahooNumeric>,
}

/// Fetch financial health metrics for a single ticker from Yahoo Finance.
///
/// Uses the `financialData` and `defaultKeyStatistics` quoteSummary modules.
#[instrument(skip(client, crumb))]
pub async fn fetch_financial_health(
    client: &Client,
    crumb: &str,
    ticker: &str,
) -> Result<crate::models::FinancialHealth> {
    let url = format!(
        "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=financialData,defaultKeyStatistics,quoteType&crumb={crumb}",
        ticker = ticker.to_uppercase(),
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .context("Failed to fetch financial data")?;

    if !resp.status().is_success() {
        anyhow::bail!(
            "Yahoo Finance returned HTTP {} for financial data of {}",
            resp.status(),
            ticker
        );
    }

    let envelope: QuoteSummaryEnvelope = resp
        .json()
        .await
        .context("Failed to parse financial data JSON")?;

    let result = envelope
        .quote_summary
        .and_then(|qs| qs.result)
        .and_then(|r| r.into_iter().next())
        .context("Yahoo Finance returned empty result for financial data")?;

    let fd = result.financial_data;
    let ks = result.default_key_statistics;
    let qt = result.quote_type;

    let mut health = crate::models::FinancialHealth {
        ticker: ticker.to_uppercase(),
        name: qt.and_then(|q| q.long_name.or(q.short_name)),
        revenue: fd.as_ref().and_then(|f| f.total_revenue.as_ref()).and_then(|v| v.raw),
        revenue_growth: fd.as_ref().and_then(|f| f.revenue_growth.as_ref()).and_then(|v| v.raw),
        net_income: fd.as_ref().and_then(|f| f.net_income_to_common.as_ref()).and_then(|v| v.raw),
        profit_margin: fd.as_ref().and_then(|f| f.profit_margins.as_ref()).and_then(|v| v.raw),
        operating_margin: fd.as_ref().and_then(|f| f.operating_margins.as_ref()).and_then(|v| v.raw),
        earnings_per_share: ks.as_ref().and_then(|k| k.trailing_eps.as_ref()).and_then(|v| v.raw),
        total_cash: fd.as_ref().and_then(|f| f.total_cash.as_ref()).and_then(|v| v.raw),
        total_debt: fd.as_ref().and_then(|f| f.total_debt.as_ref()).and_then(|v| v.raw),
        debt_to_equity: fd.as_ref().and_then(|f| f.debt_to_equity.as_ref()).and_then(|v| v.raw),
        current_ratio: fd.as_ref().and_then(|f| f.current_ratio.as_ref()).and_then(|v| v.raw),
        return_on_equity: fd.as_ref().and_then(|f| f.return_on_equity.as_ref()).and_then(|v| v.raw),
        return_on_assets: fd.as_ref().and_then(|f| f.return_on_assets.as_ref()).and_then(|v| v.raw),
        free_cash_flow: fd.as_ref().and_then(|f| f.free_cashflow.as_ref()).and_then(|v| v.raw),
        operating_cash_flow: fd.as_ref().and_then(|f| f.operating_cashflow.as_ref()).and_then(|v| v.raw),
        trailing_pe: ks.as_ref().and_then(|k| k.trailing_pe.as_ref()).and_then(|v| v.raw),
        forward_pe: ks.as_ref().and_then(|k| k.forward_pe.as_ref()).and_then(|v| v.raw),
        price_to_book: ks.as_ref().and_then(|k| k.price_to_book.as_ref()).and_then(|v| v.raw),
        peg_ratio: ks.as_ref().and_then(|k| k.peg_ratio.as_ref()).and_then(|v| v.raw),
        health_score: 0,
        verdict: String::new(),
        strengths: Vec::new(),
        concerns: Vec::new(),
    };

    crate::models::compute_health_score(&mut health);

    Ok(health)
}

// ── Screener / undervalue data ────────────────────────────────────────────────

/// Fetch valuation data for a single ticker to determine if it's undervalued.
///
/// Uses `financialData` and `defaultKeyStatistics` modules — same request as
/// financial health but extracts valuation-specific fields including analyst
/// target price.
#[instrument(skip(client, crumb))]
pub async fn fetch_screener_data(
    client: &Client,
    crumb: &str,
    ticker: &str,
) -> Result<crate::models::ScreenerCandidate> {
    let url = format!(
        "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=financialData,defaultKeyStatistics&crumb={crumb}",
        ticker = ticker.to_uppercase(),
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .context("Failed to fetch screener data")?;

    if !resp.status().is_success() {
        anyhow::bail!(
            "Yahoo Finance returned HTTP {} for screener data of {}",
            resp.status(),
            ticker
        );
    }

    let envelope: QuoteSummaryEnvelope = resp
        .json()
        .await
        .context("Failed to parse screener data JSON")?;

    let result = envelope
        .quote_summary
        .and_then(|qs| qs.result)
        .and_then(|r| r.into_iter().next())
        .context("Yahoo Finance returned empty result for screener data")?;

    let fd = result.financial_data;
    let ks = result.default_key_statistics;

    let current_price = fd.as_ref()
        .and_then(|f| f.current_price.as_ref())
        .and_then(|v| v.raw)
        .unwrap_or(0.0);

    let target_price = fd.as_ref()
        .and_then(|f| f.target_mean_price.as_ref())
        .and_then(|v| v.raw);

    let upside_percent = target_price.and_then(|tp| {
        if current_price > 0.0 {
            Some(((tp - current_price) / current_price) * 100.0)
        } else {
            None
        }
    });

    let analyst_count = fd.as_ref()
        .and_then(|f| f.number_of_analyst_opinions.as_ref())
        .and_then(|v| v.raw)
        .map(|n| n as u32);

    let mut candidate = crate::models::ScreenerCandidate {
        ticker: ticker.to_uppercase(),
        current_price,
        target_price,
        upside_percent,
        forward_pe: ks.as_ref().and_then(|k| k.forward_pe.as_ref()).and_then(|v| v.raw),
        trailing_pe: ks.as_ref().and_then(|k| k.trailing_pe.as_ref()).and_then(|v| v.raw),
        peg_ratio: ks.as_ref().and_then(|k| k.peg_ratio.as_ref()).and_then(|v| v.raw),
        price_to_book: ks.as_ref().and_then(|k| k.price_to_book.as_ref()).and_then(|v| v.raw),
        profit_margin: fd.as_ref().and_then(|f| f.profit_margins.as_ref()).and_then(|v| v.raw),
        revenue_growth: fd.as_ref().and_then(|f| f.revenue_growth.as_ref()).and_then(|v| v.raw),
        debt_to_equity: fd.as_ref().and_then(|f| f.debt_to_equity.as_ref()).and_then(|v| v.raw),
        free_cash_flow: fd.as_ref().and_then(|f| f.free_cashflow.as_ref()).and_then(|v| v.raw),
        analyst_count,
        value_score: 0,
        reasons: Vec::new(),
    };

    crate::models::compute_value_score(&mut candidate);

    Ok(candidate)
}
