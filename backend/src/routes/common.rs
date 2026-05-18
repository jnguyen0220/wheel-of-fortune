use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;

use axum::Json;
use reqwest::Client;
use serde::Deserialize;
use tokio::sync::RwLock;
use tracing::warn;

use crate::cache::TtlCache;
use crate::AppState;

/// Common query parameter struct for routes that accept a comma-separated `tickers` param.
#[derive(Deserialize)]
pub struct TickersQuery {
    pub tickers: String,
}

/// Common query parameter struct for routes where `tickers` is optional (falls back to defaults).
#[derive(Deserialize)]
pub struct OptionalTickersQuery {
    pub tickers: Option<String>,
}

/// Parse a comma-separated tickers string into a Vec of uppercase, trimmed ticker symbols.
pub fn parse_tickers(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect()
}

/// Parse an optional tickers string, falling back to DEFAULT_TICKERS if absent or empty.
pub fn parse_tickers_or_default(raw: Option<&str>) -> Vec<String> {
    match raw {
        Some(t) if !t.trim().is_empty() => parse_tickers(t),
        _ => DEFAULT_TICKERS.iter().map(|s| s.to_string()).collect(),
    }
}

/// A curated list of well-known, liquid stocks suitable for the wheel strategy.
/// These have active options markets and are commonly wheeled.
pub const DEFAULT_TICKERS: &[&str] = &[
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "AMD", "INTC", "NFLX", "DIS", "BA", "JPM", "BAC", "GS",
    "V", "MA", "PFE", "JNJ", "UNH", "XOM", "CVX", "KO", "PEP",
    "WMT", "HD", "MCD", "NKE", "SBUX", "PYPL", "SQ", "SOFI",
    "PLTR", "COIN", "HOOD", "F", "GM", "T", "VZ", "CSCO",
];

/// Generic cached-fetch for ticker-keyed data.
///
/// 1. Checks the cache for each ticker, collecting cached hits.
/// 2. Acquires a Yahoo session (if `needs_crumb` is true).
/// 3. Spawns concurrent fetch tasks for uncached tickers.
/// 4. Stores results in the cache and returns the full map.
pub async fn fetch_cached_ticker_data<V, F, Fut>(
    tickers: Vec<String>,
    cache: &RwLock<TtlCache<V>>,
    state: &Arc<AppState>,
    needs_crumb: bool,
    fetch_fn: F,
) -> Json<HashMap<String, V>>
where
    V: Clone + Send + Sync + 'static,
    F: Fn(Client, String, String) -> Fut + Send + Sync + Clone + 'static,
    Fut: Future<Output = anyhow::Result<V>> + Send + 'static,
{
    let mut result: HashMap<String, V> = HashMap::new();
    let mut uncached: Vec<String> = Vec::new();

    {
        let mut c = cache.write().await;
        for ticker in &tickers {
            if let Some(cached) = c.get(ticker) {
                result.insert(ticker.clone(), cached);
            } else {
                uncached.push(ticker.clone());
            }
        }
    }

    if uncached.is_empty() {
        return Json(result);
    }

    let session = if needs_crumb {
        match state.yahoo.get().await {
            Ok(s) => Some(s),
            Err(e) => {
                warn!(error = %e, "Failed to acquire Yahoo Finance session");
                return Json(result);
            }
        }
    } else {
        None
    };

    let (client, crumb) = session.unwrap_or_else(|| {
        (state.yahoo.http.clone(), String::new())
    });

    let tasks: Vec<_> = uncached
        .into_iter()
        .map(|ticker| {
            let client = client.clone();
            let crumb = crumb.clone();
            let f = fetch_fn.clone();
            tokio::spawn(async move {
                match f(client, crumb, ticker.clone()).await {
                    Ok(data) => Some((ticker, data)),
                    Err(e) => {
                        warn!(ticker = %ticker, error = %e, "Failed to fetch data");
                        None
                    }
                }
            })
        })
        .collect();

    let mut c = cache.write().await;
    for task in tasks {
        if let Ok(Some((ticker, data))) = task.await {
            c.insert(ticker.clone(), data.clone());
            result.insert(ticker, data);
        }
    }

    Json(result)
}
