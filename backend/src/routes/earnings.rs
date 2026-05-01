//! GET /api/earnings/calendar?tickers=AAPL,TSLA
//! GET /api/earnings/history?tickers=AAPL,TSLA
//!
//! Returns upcoming earnings dates and past earnings results (EPS beat/miss)
//! by querying Yahoo Finance's quoteSummary modules.

use axum::{
    extract::Query,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use tracing::warn;

use crate::adapters::yahoo_finance::{acquire_crumb, fetch_earnings_calendar, fetch_earnings_history};
use crate::models::{EarningsCalendar, EarningsResult};

pub fn router() -> Router {
    Router::new()
        .route("/calendar", get(get_earnings_calendar))
        .route("/history", get(get_earnings_history))
}

#[derive(Deserialize)]
struct TickersQuery {
    tickers: String,
}

async fn get_earnings_calendar(
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers: Vec<String> = query
        .tickers
        .split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    let session = acquire_crumb().await;
    let (client, crumb) = match session {
        Ok(s) => s,
        Err(e) => {
            warn!(error = %e, "Failed to acquire Yahoo Finance session for earnings calendar");
            return Json(HashMap::<String, Vec<EarningsCalendar>>::new());
        }
    };

    let tasks: Vec<_> = tickers
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

    let mut result: HashMap<String, Vec<EarningsCalendar>> = HashMap::new();
    for task in tasks {
        if let Ok(Some((ticker, data))) = task.await {
            result.insert(ticker, data);
        }
    }

    Json(result)
}

async fn get_earnings_history(
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers: Vec<String> = query
        .tickers
        .split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    let session = acquire_crumb().await;
    let (client, crumb) = match session {
        Ok(s) => s,
        Err(e) => {
            warn!(error = %e, "Failed to acquire Yahoo Finance session for earnings history");
            return Json(HashMap::<String, Vec<EarningsResult>>::new());
        }
    };

    let tasks: Vec<_> = tickers
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

    let mut result: HashMap<String, Vec<EarningsResult>> = HashMap::new();
    for task in tasks {
        if let Ok(Some((ticker, data))) = task.await {
            result.insert(ticker, data);
        }
    }

    Json(result)
}
