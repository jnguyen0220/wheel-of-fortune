//! GET /api/financials?tickers=AAPL,TSLA
//!
//! Returns a financial health scorecard for each ticker, summarising key
//! metrics from Yahoo Finance's financialData and defaultKeyStatistics modules.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::adapters::yahoo_finance::fetch_financial_health;
use crate::AppState;

use super::common::{TickersQuery, fetch_cached_ticker_data, parse_tickers};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new().route("/", get(get_financials)).with_state(state)
}

async fn get_financials(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);
    fetch_cached_ticker_data(
        tickers,
        &state.financials_cache,
        &state,
        true,
        |client, crumb, ticker| async move {
            fetch_financial_health(&client, &crumb, &ticker).await
        },
    )
    .await
}
