pub mod analyst;
pub mod batch;
pub mod chart;
pub mod common;
pub mod discovery;
pub mod earnings;
pub mod financials;
pub mod inventory;
pub mod iv_signals;
pub mod market_data;
pub mod news;
pub mod options;
pub mod recommendations;
pub mod screener;
pub mod search;

use axum::{routing::get, Router};
use std::sync::Arc;

use crate::AppState;

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .nest("/api", api_routes(state))
}

async fn health_check() -> &'static str {
    "OK"
}

fn api_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .nest("/inventory", inventory::router(state.clone()))
        .nest("/market-data", market_data::router(state.clone()))
        .nest("/options", options::router(state.clone()))
        .nest("/recommendations", recommendations::router(state.clone()))
        .nest("/earnings", earnings::router(state.clone()))
        .nest("/analyst-trends", analyst::router(state.clone()))
        .nest("/financials", financials::router(state.clone()))
        .nest("/screener", screener::router(state.clone()))
        .nest("/news", news::router(state.clone()))
        .nest("/search", search::router(state.clone()))
        .nest("/discovery", discovery::router(state.clone()))
        .nest("/batch", batch::router(state.clone()))
        .nest("/iv-signals", iv_signals::router(state.clone()))
        .nest("/chart", chart::router(state.clone()))
}
