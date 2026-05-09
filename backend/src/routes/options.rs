//! GET /api/options?tickers=AAPL,TSLA
//!
//! Returns the full options chain for each requested ticker.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use std::sync::Arc;
use tracing::warn;

use crate::AppState;

use super::common::{TickersQuery, parse_tickers};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_options))
        .with_state(state)
}

async fn get_options(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);

    match state.options_provider.fetch_options_chains(&tickers).await {
        Ok(chains) => Json(chains),
        Err(e) => {
            warn!(error = %e, "Failed to fetch any options chains");
            Json(Vec::new())
        }
    }
}
