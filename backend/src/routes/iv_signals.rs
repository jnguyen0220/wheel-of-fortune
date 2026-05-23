//! GET /api/iv-signals?tickers=AAPL,TSLA
//!
//! Returns IV-aware premium selling signals for the requested tickers.
//! Analyses historical daily candles + options chain IV to evaluate whether
//! current conditions favor premium selling (high IV rank, range-bound regime,
//! overpriced options relative to realized vol).

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
use crate::strategy::iv_signal::{self, IvSignal};
use crate::AppState;

use super::common::{TickersQuery, parse_tickers};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_iv_signals))
        .with_state(state)
}

async fn get_iv_signals(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);

    let semaphore = Arc::new(Semaphore::new(10));

    // Fetch chart data and options chains concurrently.
    let tasks: Vec<_> = tickers
        .into_iter()
        .map(|ticker| {
            let yahoo = Arc::clone(&state.yahoo);
            let sem = Arc::clone(&semaphore);
            let state = Arc::clone(&state);
            tokio::spawn(async move {
                // Get candles (from cache or fetch).
                let candles = {
                    let cache = state.chart_cache.read().await;
                    cache.peek(&ticker)
                };

                let candles = match candles {
                    Some(c) => c,
                    None => {
                        let _permit = sem.acquire().await.unwrap();
                        match fetch_chart_data(&yahoo, &ticker, "6mo").await {
                            Ok(c) => {
                                let mut cache = state.chart_cache.write().await;
                                cache.insert(ticker.clone(), c.clone());
                                c
                            }
                            Err(e) => {
                                warn!(ticker = %ticker, error = %e, "Failed to fetch chart data for IV signal");
                                return None;
                            }
                        }
                    }
                };

                // Get options chain (from cache or fetch).
                let chain = {
                    let cache = state.options_cache.read().await;
                    cache.peek(&ticker)
                };

                let chain = match chain {
                    Some(c) => Some(c),
                    None => {
                        // Try fetching the chain
                        match state.options_provider.fetch_options_chains(&[ticker.clone()]).await {
                            Ok(mut chains) => {
                                if let Some(c) = chains.pop() {
                                    let mut cache = state.options_cache.write().await;
                                    cache.insert(ticker.clone(), c.clone());
                                    Some(c)
                                } else {
                                    None
                                }
                            }
                            Err(_) => None,
                        }
                    }
                };

                iv_signal::analyse(&ticker, &candles, chain.as_ref())
            })
        })
        .collect();

    let mut signals: Vec<IvSignal> = Vec::new();
    for task in tasks {
        match task.await {
            Ok(Some(signal)) => signals.push(signal),
            Ok(None) => {}
            Err(e) => warn!(error = %e, "Task panicked during IV signal analysis"),
        }
    }

    // Sort by premium_score descending (best opportunities first).
    signals.sort_by(|a, b| {
        b.premium_score
            .partial_cmp(&a.premium_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Json(signals)
}
