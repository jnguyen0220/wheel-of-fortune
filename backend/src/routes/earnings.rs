//! GET /api/earnings/calendar?tickers=AAPL,TSLA
//! GET /api/earnings/history?tickers=AAPL,TSLA
//!
//! Returns upcoming earnings dates and past earnings results (EPS beat/miss)
//! by querying Yahoo Finance's quoteSummary modules.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::warn;

use crate::adapters::yahoo_finance::{fetch_earnings_calendar, fetch_earnings_history};
use crate::models::{EarningsCalendar, EarningsResult};
use crate::AppState;

use super::common::{TickersQuery, parse_tickers};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/calendar", get(get_earnings_calendar))
        .route("/history", get(get_earnings_history))
        .with_state(state)
}

async fn get_earnings_calendar(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);

    let mut result: HashMap<String, Vec<EarningsCalendar>> = HashMap::new();
    let mut uncached: Vec<String> = Vec::new();

    {
        let mut cache = state.earnings_calendar_cache.write().await;
        for ticker in &tickers {
            if let Some(cached) = cache.get(ticker) {
                result.insert(ticker.clone(), cached);
            } else {
                uncached.push(ticker.clone());
            }
        }
    }

    if uncached.is_empty() {
        return Json(result);
    }

    let session = state.yahoo.get().await;
    let (client, crumb) = match session {
        Ok(s) => s,
        Err(e) => {
            warn!(error = %e, "Failed to acquire Yahoo Finance session for earnings calendar");
            return Json(result);
        }
    };

    let tasks: Vec<_> = uncached
        .into_iter()
        .map(|ticker| {
            let client = client.clone();
            let crumb = crumb.clone();
            tokio::spawn(async move {
                match fetch_earnings_calendar(&client, &crumb, &ticker).await {
                    Ok(data) => Some((ticker, data)),
                    Err(e) => {
                        warn!(ticker = %ticker, error = %e, "Failed to fetch earnings calendar");
                        None
                    }
                }
            })
        })
        .collect();

    let mut cache = state.earnings_calendar_cache.write().await;
    for task in tasks {
        if let Ok(Some((ticker, data))) = task.await {
            cache.insert(ticker.clone(), data.clone());
            result.insert(ticker, data);
        }
    }

    Json(result)
}

async fn get_earnings_history(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers: Vec<String> = query
        .tickers
        .split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    let mut result: HashMap<String, Vec<EarningsResult>> = HashMap::new();
    let mut uncached: Vec<String> = Vec::new();

    {
        let mut cache = state.earnings_history_cache.write().await;
        for ticker in &tickers {
            if let Some(cached) = cache.get(ticker) {
                result.insert(ticker.clone(), cached);
            } else {
                uncached.push(ticker.clone());
            }
        }
    }

    if uncached.is_empty() {
        return Json(result);
    }

    let session = state.yahoo.get().await;
    let (client, crumb) = match session {
        Ok(s) => s,
        Err(e) => {
            warn!(error = %e, "Failed to acquire Yahoo Finance session for earnings history");
            return Json(result);
        }
    };

    let tasks: Vec<_> = uncached
        .into_iter()
        .map(|ticker| {
            let client = client.clone();
            let crumb = crumb.clone();
            tokio::spawn(async move {
                match fetch_earnings_history(&client, &crumb, &ticker).await {
                    Ok(data) => Some((ticker, data)),
                    Err(e) => {
                        warn!(ticker = %ticker, error = %e, "Failed to fetch earnings history");
                        None
                    }
                }
            })
        })
        .collect();

    let mut cache = state.earnings_history_cache.write().await;
    for task in tasks {
        if let Ok(Some((ticker, data))) = task.await {
            cache.insert(ticker.clone(), data.clone());
            result.insert(ticker, data);
        }
    }

    Json(result)
}
