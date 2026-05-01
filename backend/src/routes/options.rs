//! GET /api/options?tickers=AAPL,TSLA
//!
//! Returns the full options chain for each requested ticker.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tracing::warn;

use crate::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_options))
        .with_state(state)
}

#[derive(Deserialize)]
struct OptionsQuery {
    tickers: String,
}

async fn get_options(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OptionsQuery>,
) -> impl IntoResponse {
    let tickers: Vec<String> = query
        .tickers
        .split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    match state.options_provider.fetch_options_chains(&tickers).await {
        Ok(chains) => Json(chains),
        Err(e) => {
            warn!(error = %e, "Failed to fetch any options chains");
            Json(Vec::new())
        }
    }
}
