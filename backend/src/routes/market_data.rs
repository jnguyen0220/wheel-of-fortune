//! GET /api/market-data?tickers=AAPL,TSLA
//!
//! Returns current price, daily high/low, and 52-week high/low for each
//! requested ticker by querying the MarketData.app daily candles endpoint.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::{collections::HashMap, sync::Arc};
use tracing::warn;

use crate::models::StockMarketData;
use crate::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_market_data))
        .with_state(state)
}

#[derive(Deserialize)]
struct MarketDataQuery {
    tickers: String,
}

async fn get_market_data(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MarketDataQuery>,
) -> impl IntoResponse {
    let tickers: Vec<String> = query
        .tickers
        .split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    let mut result: HashMap<String, StockMarketData> = HashMap::new();
    let mut uncached: Vec<String> = Vec::new();

    {
        let mut cache = state.market_data_cache.write().await;
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

    let tasks: Vec<_> = uncached
        .into_iter()
        .map(|ticker| {
            let provider = Arc::clone(&state.options_provider);
            tokio::spawn(async move {
                match provider.fetch_stock_market_data(&ticker).await {
                    Ok(data) => Some((ticker, data)),
                    Err(e) => {
                        warn!(ticker = %ticker, error = %e, "Failed to fetch market data");
                        None
                    }
                }
            })
        })
        .collect();

    let mut cache = state.market_data_cache.write().await;
    for task in tasks {
        if let Ok(Some((ticker, data))) = task.await {
            cache.insert(ticker.clone(), data.clone());
            result.insert(ticker, data);
        }
    }

    Json(result)
}
