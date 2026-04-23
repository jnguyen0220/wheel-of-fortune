//! GET /api/prices?tickers=AAPL,TSLA
//!
//! Returns the current underlying price for each requested ticker by
//! fetching the options chain (which always includes `underlying_price`).

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tracing::warn;

use crate::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_prices))
        .with_state(state)
}

#[derive(Deserialize)]
struct PricesQuery {
    tickers: String,
}

#[derive(Serialize)]
struct PricesResponse {
    prices: HashMap<String, f64>,
}

async fn get_prices(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PricesQuery>,
) -> impl IntoResponse {
    let tickers: Vec<String> = query
        .tickers
        .split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    let mut prices: HashMap<String, f64> = HashMap::new();

    for ticker in &tickers {
        match state.options_provider.fetch_options_chain(ticker).await {
            Ok(chain) => {
                prices.insert(ticker.clone(), chain.underlying_price);
            }
            Err(e) => {
                warn!(ticker = %ticker, error = %e, "Failed to fetch price");
            }
        }
    }

    Json(PricesResponse { prices })
}
