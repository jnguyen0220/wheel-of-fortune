//! GET /api/earnings/calendar?tickers=AAPL,TSLA
//! GET /api/earnings/history?tickers=AAPL,TSLA
//!
//! Returns upcoming earnings dates and past earnings results (EPS beat/miss)
//! by querying Yahoo Finance's quoteSummary modules.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::adapters::yahoo_finance::{fetch_earnings_calendar, fetch_earnings_history};
use crate::AppState;

use super::common::{TickersQuery, fetch_cached_ticker_data, parse_tickers};

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
    fetch_cached_ticker_data(
        tickers,
        &state.earnings_calendar_cache,
        &state,
        true,
        |client, crumb, ticker| async move {
            fetch_earnings_calendar(&client, &crumb, &ticker).await
        },
    )
    .await
}

async fn get_earnings_history(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);
    fetch_cached_ticker_data(
        tickers,
        &state.earnings_history_cache,
        &state,
        true,
        |client, crumb, ticker| async move {
            fetch_earnings_history(&client, &crumb, &ticker).await
        },
    )
    .await
}
