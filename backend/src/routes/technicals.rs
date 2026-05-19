//! GET /api/technicals?tickers=AAPL,TSLA
//!
//! Returns EMA pullback strategy signals for the requested tickers.
//! Analyses historical daily candles and evaluates CALL/PUT setups based on:
//! 50-DMA, 9/21 EMA, RSI, volume, and candle patterns.
//!
//! Optimised for large ticker lists: uses chart_cache (30-min TTL) and
//! limits concurrency to 10 parallel Yahoo Finance requests.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tracing::warn;

use crate::adapters::yahoo_finance::fetch_chart_data;
use crate::strategy::ema_pullback::{self, EmaPullbackSignal};
use crate::AppState;

use super::common::{TickersQuery, parse_tickers};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_technicals))
        .with_state(state)
}

async fn get_technicals(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);

    // Limit concurrent Yahoo Finance requests to avoid rate-limiting.
    let semaphore = Arc::new(Semaphore::new(10));

    let tasks: Vec<_> = tickers
        .into_iter()
        .map(|ticker| {
            let yahoo = Arc::clone(&state.yahoo);
            let sem = Arc::clone(&semaphore);
            let state = Arc::clone(&state);
            tokio::spawn(async move {
                // Check cache first (read lock, cheap).
                {
                    let cache = state.chart_cache.read().await;
                    if let Some(candles) = cache.peek(&ticker) {
                        return ema_pullback::analyse(&ticker, &candles);
                    }
                }

                // Acquire semaphore permit before hitting network.
                let _permit = sem.acquire().await.unwrap();

                match fetch_chart_data(&yahoo, &ticker, "3mo").await {
                    Ok(candles) => {
                        let signal = ema_pullback::analyse(&ticker, &candles);
                        // Store in cache.
                        {
                            let mut cache = state.chart_cache.write().await;
                            cache.insert(ticker.clone(), candles);
                        }
                        signal
                    }
                    Err(e) => {
                        warn!(ticker = %ticker, error = %e, "Failed to fetch chart data");
                        None
                    }
                }
            })
        })
        .collect();

    let mut signals: Vec<EmaPullbackSignal> = Vec::new();
    for task in tasks {
        match task.await {
            Ok(Some(signal)) => signals.push(signal),
            Ok(None) => {}
            Err(e) => warn!(error = %e, "Task panicked during technical analysis"),
        }
    }

    // Sort by criteria_met descending (strongest signals first).
    signals.sort_by(|a, b| b.criteria_met.cmp(&a.criteria_met));

    Json(signals)
}
