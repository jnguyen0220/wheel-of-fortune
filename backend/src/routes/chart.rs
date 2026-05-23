//! GET /api/chart?ticker=AAPL&range=5y
//!
//! Returns historical daily OHLCV candles for the given ticker and range.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tracing::warn;

use crate::adapters::yahoo_finance::fetch_chart_data;
use crate::models::Candle;
use crate::AppState;

#[derive(Deserialize)]
struct ChartQuery {
    ticker: String,
    /// Yahoo Finance range: "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"
    #[serde(default = "default_range")]
    range: String,
}

fn default_range() -> String {
    "5y".to_string()
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_chart))
        .with_state(state)
}

async fn get_chart(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ChartQuery>,
) -> impl IntoResponse {
    let ticker = query.ticker.trim().to_uppercase();
    if ticker.is_empty() {
        return Json(Vec::<Candle>::new());
    }

    let allowed_ranges = ["1mo", "3mo", "6mo", "1y", "2y", "5y", "max"];
    let range = if allowed_ranges.contains(&query.range.as_str()) {
        &query.range
    } else {
        "5y"
    };

    match fetch_chart_data(&state.yahoo, &ticker, range).await {
        Ok(candles) => Json(candles),
        Err(e) => {
            warn!(ticker = %ticker, range = %range, error = %e, "Failed to fetch chart data");
            Json(Vec::<Candle>::new())
        }
    }
}
