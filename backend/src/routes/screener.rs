//! GET /api/screener?tickers=AAPL,MSFT,TSLA,...
//!
//! Screens the given tickers for undervalued candidates using Yahoo Finance
//! valuation metrics (analyst targets, P/E, PEG, P/B). Returns candidates
//! sorted by value score descending.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tracing::warn;

use crate::adapters::yahoo_finance::fetch_screener_data;
use crate::models::ScreenerCandidate;
use crate::AppState;

use super::common::parse_tickers_or_default;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new().route("/", get(screen_stocks)).with_state(state)
}

#[derive(Deserialize)]
struct ScreenerQuery {
    /// Comma-separated tickers to screen. If omitted, uses a default list.
    tickers: Option<String>,
    /// Minimum value score threshold (0–100). Defaults to 30.
    min_score: Option<u8>,
}

async fn screen_stocks(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ScreenerQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers_or_default(query.tickers.as_deref());

    let min_score = query.min_score.unwrap_or(30);

    let mut candidates: Vec<ScreenerCandidate> = Vec::new();
    let mut uncached: Vec<String> = Vec::new();

    {
        let mut cache = state.screener_cache.write().await;
        for ticker in &tickers {
            if let Some(cached) = cache.get(ticker) {
                if cached.value_score >= min_score {
                    candidates.push(cached);
                }
            } else {
                uncached.push(ticker.clone());
            }
        }
    }

    if !uncached.is_empty() {
        let session = state.yahoo.get().await;
        let (client, crumb) = match session {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, "Failed to acquire Yahoo Finance session for screener");
                candidates.sort_by(|a, b| b.value_score.cmp(&a.value_score));
                return Json(candidates);
            }
        };

        let tasks: Vec<_> = uncached
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

        let mut cache = state.screener_cache.write().await;
        for task in tasks {
            if let Ok(Some(c)) = task.await {
                cache.insert(c.ticker.clone(), c.clone());
                if c.value_score >= min_score {
                    candidates.push(c);
                }
            }
        }
    }

    // Sort by value score descending
    candidates.sort_by(|a, b| b.value_score.cmp(&a.value_score));

    Json(candidates)
}
