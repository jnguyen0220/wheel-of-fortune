//! GET /api/analyst-trends?tickers=AAPL,TSLA
//!
//! Returns analyst recommendation trends (strongBuy, buy, hold, sell, strongSell)
//! for the given tickers. Powered by Yahoo Finance's recommendationTrend module.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::adapters::yahoo_finance::fetch_recommendation_trend;
use crate::AppState;

use super::common::{TickersQuery, fetch_cached_ticker_data, parse_tickers};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new().route("/", get(get_analyst_trends)).with_state(state)
}

async fn get_analyst_trends(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);
    fetch_cached_ticker_data(
        tickers,
        &state.analyst_trends_cache,
        &state,
        true,
        |client, crumb, ticker| async move {
            fetch_recommendation_trend(&client, &crumb, &ticker).await
        },
    )
    .await
}
