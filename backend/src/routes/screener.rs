//! GET /api/screener?tickers=AAPL,MSFT,TSLA,...
//!
//! Screens the given tickers for undervalued candidates using Yahoo Finance
//! valuation metrics (analyst targets, P/E, PEG, P/B). Returns candidates
//! sorted by value score descending.

use axum::{
    extract::Query,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use tracing::warn;

use crate::adapters::yahoo_finance::{acquire_crumb, fetch_screener_data};
use crate::models::ScreenerCandidate;

/// A curated list of well-known, liquid stocks suitable for the wheel strategy.
/// These have active options markets and are commonly wheeled.
const DEFAULT_TICKERS: &[&str] = &[
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "AMD", "INTC", "NFLX", "DIS", "BA", "JPM", "BAC", "GS",
    "V", "MA", "PFE", "JNJ", "UNH", "XOM", "CVX", "KO", "PEP",
    "WMT", "HD", "MCD", "NKE", "SBUX", "PYPL", "SQ", "SOFI",
    "PLTR", "COIN", "HOOD", "F", "GM", "T", "VZ", "CSCO",
];

pub fn router() -> Router {
    Router::new().route("/", get(screen_stocks))
}

#[derive(Deserialize)]
struct ScreenerQuery {
    /// Comma-separated tickers to screen. If omitted, uses a default list.
    tickers: Option<String>,
    /// Minimum value score threshold (0–100). Defaults to 30.
    min_score: Option<u8>,
}

async fn screen_stocks(Query(query): Query<ScreenerQuery>) -> impl IntoResponse {
    let tickers: Vec<String> = match query.tickers {
        Some(t) if !t.trim().is_empty() => t
            .split(',')
            .map(|s| s.trim().to_uppercase())
            .filter(|s| !s.is_empty())
            .collect(),
        _ => DEFAULT_TICKERS.iter().map(|s| s.to_string()).collect(),
    };

    let min_score = query.min_score.unwrap_or(30);

    let session = acquire_crumb().await;
    let (client, crumb) = match session {
        Ok(s) => s,
        Err(e) => {
            warn!(error = %e, "Failed to acquire Yahoo Finance session for screener");
            return Json(Vec::<ScreenerCandidate>::new());
        }
    };

    // Fetch all tickers in parallel
    let tasks: Vec<_> = tickers
        .into_iter()
        .map(|ticker| {
            let client = client.clone();
            let crumb = crumb.clone();
            tokio::spawn(async move {
                match fetch_screener_data(&client, &crumb, &ticker).await {
                    Ok(candidate) => Some(candidate),
                    Err(e) => {
                        warn!(ticker = %ticker, error = %e, "Failed to screen ticker");
                        None
                    }
                }
            })
        })
        .collect();

    let mut candidates: Vec<ScreenerCandidate> = Vec::new();
    for task in tasks {
        if let Ok(Some(c)) = task.await {
            if c.value_score >= min_score {
                candidates.push(c);
            }
        }
    }

    // Sort by value score descending
    candidates.sort_by(|a, b| b.value_score.cmp(&a.value_score));

    Json(candidates)
}
