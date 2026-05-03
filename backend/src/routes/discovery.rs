//! GET /api/discovery?screener_id=most_actives
//! GET /api/discovery/prefetch — fetches all screeners in one go and caches for 24h
//!
//! Proxies Yahoo Finance's predefined screener lists (most active, gainers, losers, etc.)
//! and returns a list of tickers with rank and price.
//! Results are cached for 24 hours. The prefetch endpoint fetches all screeners
//! concurrently so individual lookups are served from cache without hitting Yahoo.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::time::Duration;
use tracing::{info, warn};

use crate::AppState;

/// All known screener IDs that we batch-fetch.
const ALL_SCREENER_IDS: &[&str] = &[
    "most_actives",
    "day_gainers",
    "day_losers",
    "most_shorted_stocks",
    "undervalued_large_caps",
    "undervalued_growth_stocks",
    "growth_technology_stocks",
    "aggressive_small_caps",
    "small_cap_gainers",
    "conservative_foreign_funds",
    "high_yield_bond",
    "portfolio_anchors",
    "solid_large_growth_funds",
    "solid_midcap_growth_funds",
    "top_mutual_funds",
];

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_discovery))
        .route("/prefetch", get(prefetch_all))
        .with_state(state)
}

/// A single stock entry from a predefined screener.
#[derive(Debug, Clone, Serialize)]
pub struct DiscoveryItem {
    pub rank: usize,
    pub ticker: String,
    pub name: String,
    pub price: f64,
    pub change_percent: f64,
    pub volume: u64,
    pub market_cap: f64,
}

#[derive(Deserialize)]
struct DiscoveryQuery {
    /// The predefined screener ID (e.g. "most_actives", "day_gainers", "day_losers").
    screener_id: String,
}

async fn get_discovery(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DiscoveryQuery>,
) -> impl IntoResponse {
    let screener_id = &query.screener_id;

    // Check cache first
    {
        let mut cache = state.discovery_cache.write().await;
        if let Some(cached) = cache.get(screener_id) {
            return Json(cached);
        }
    }

    // Cache miss — batch-fetch all screeners (fills cache for everything)
    batch_fetch_all(&state).await;

    // Try cache again after batch fetch
    {
        let mut cache = state.discovery_cache.write().await;
        if let Some(cached) = cache.get(screener_id) {
            return Json(cached);
        }
    }

    // If still not found, this specific screener failed
    Json(Vec::<DiscoveryItem>::new())
}

/// Prefetch endpoint — triggers batch fetch of all screeners, returns status.
async fn prefetch_all(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Check if any screener is already cached (i.e. batch was done recently)
    {
        let mut cache = state.discovery_cache.write().await;
        if cache.get(ALL_SCREENER_IDS[0]).is_some() {
            return Json(serde_json::json!({ "status": "cached", "screeners": ALL_SCREENER_IDS.len() }));
        }
    }

    let fetched = batch_fetch_all(&state).await;
    Json(serde_json::json!({ "status": "fetched", "screeners": fetched }))
}

/// Fetch all screeners sequentially with a small delay between each to avoid 429s.
/// Stores results in the discovery cache.
async fn batch_fetch_all(state: &Arc<AppState>) -> usize {
    let session = state.yahoo.get().await;
    let (client, crumb) = match session {
        Ok(s) => s,
        Err(e) => {
            warn!(error = %e, "Failed to acquire Yahoo session for discovery batch");
            return 0;
        }
    };

    let mut fetched = 0;
    for screener_id in ALL_SCREENER_IDS {
        // Skip if already cached
        {
            let cache = state.discovery_cache.read().await;
            if cache.peek(screener_id).is_some() {
                fetched += 1;
                continue;
            }
        }

        match fetch_predefined_screener(&client, &crumb, screener_id).await {
            Ok(items) => {
                let mut cache = state.discovery_cache.write().await;
                cache.insert(screener_id.to_string(), items);
                fetched += 1;
            }
            Err(e) => {
                warn!(screener_id = %screener_id, error = %e, "Failed to fetch discovery screener in batch");
            }
        }

        // Small delay between requests to avoid rate limiting
        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    info!(fetched = fetched, total = ALL_SCREENER_IDS.len(), "Discovery batch fetch complete");
    fetched
}

// ── Yahoo Finance predefined screener response types ──────────────────────────

#[derive(Debug, Deserialize)]
struct YahooScreenerResponse {
    finance: Option<YahooFinanceWrapper>,
}

#[derive(Debug, Deserialize)]
struct YahooFinanceWrapper {
    result: Option<Vec<YahooScreenerResult>>,
}

#[derive(Debug, Deserialize)]
struct YahooScreenerResult {
    quotes: Option<Vec<YahooQuote>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooQuote {
    symbol: Option<String>,
    short_name: Option<String>,
    long_name: Option<String>,
    regular_market_price: Option<f64>,
    regular_market_change_percent: Option<f64>,
    regular_market_volume: Option<u64>,
    market_cap: Option<f64>,
}

async fn fetch_predefined_screener(
    client: &Client,
    crumb: &str,
    screener_id: &str,
) -> anyhow::Result<Vec<DiscoveryItem>> {
    let url = format!(
        "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds={}&count=25&crumb={}",
        screener_id, crumb
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await?;

    if !resp.status().is_success() {
        anyhow::bail!(
            "Yahoo Finance returned HTTP {} for screener {}",
            resp.status(),
            screener_id
        );
    }

    let data: YahooScreenerResponse = resp.json().await?;

    let quotes = data
        .finance
        .and_then(|f| f.result)
        .and_then(|r| r.into_iter().next())
        .and_then(|r| r.quotes)
        .unwrap_or_default();

    let items: Vec<DiscoveryItem> = quotes
        .into_iter()
        .enumerate()
        .filter_map(|(i, q)| {
            let ticker = q.symbol?;
            Some(DiscoveryItem {
                rank: i + 1,
                ticker,
                name: q.long_name.or(q.short_name).unwrap_or_default(),
                price: q.regular_market_price.unwrap_or(0.0),
                change_percent: q.regular_market_change_percent.unwrap_or(0.0),
                volume: q.regular_market_volume.unwrap_or(0),
                market_cap: q.market_cap.unwrap_or(0.0),
            })
        })
        .collect();

    Ok(items)
}
