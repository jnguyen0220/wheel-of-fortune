//! GET /api/analyst-trends?tickers=AAPL,TSLA
//!
//! Returns analyst recommendation trends (strongBuy, buy, hold, sell, strongSell)
//! for the given tickers. Powered by Yahoo Finance's recommendationTrend module.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::warn;

use crate::adapters::yahoo_finance::fetch_recommendation_trend;
use crate::models::AnalystTrend;
use crate::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new().route("/", get(get_analyst_trends)).with_state(state)
}

#[derive(Deserialize)]
struct TickersQuery {
    tickers: String,
}

async fn get_analyst_trends(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers: Vec<String> = query
        .tickers
        .split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    let mut result: HashMap<String, Vec<AnalystTrend>> = HashMap::new();
    let mut uncached: Vec<String> = Vec::new();

    {
        let mut cache = state.analyst_trends_cache.write().await;
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
            warn!(error = %e, "Failed to acquire Yahoo Finance session for analyst trends");
            return Json(result);
        }
    };

    let tasks: Vec<_> = uncached
        .into_iter()
        .map(|ticker| {
            let client = client.clone();
            let crumb = crumb.clone();
            tokio::spawn(async move {
                match fetch_recommendation_trend(&client, &crumb, &ticker).await {
                    Ok(data) => Some((ticker, data)),
                    Err(e) => {
                        warn!(ticker = %ticker, error = %e, "Failed to fetch analyst trends");
                        None
                    }
                }
            })
        })
        .collect();

    let mut cache = state.analyst_trends_cache.write().await;
    for task in tasks {
        if let Ok(Some((ticker, data))) = task.await {
            cache.insert(ticker.clone(), data.clone());
            result.insert(ticker, data);
        }
    }

    Json(result)
}
