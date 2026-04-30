pub mod analyst;
pub mod earnings;
pub mod financials;
pub mod inventory;
pub mod market_data;
pub mod options;
pub mod prices;
pub mod recommendations;

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
        .nest("/prices", prices::router(state.clone()))
        .nest("/options", options::router(state.clone()))
        .nest("/recommendations", recommendations::router(state))
        .nest("/earnings", earnings::router())
        .nest("/analyst-trends", analyst::router())
        .nest("/financials", financials::router())
}
