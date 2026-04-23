use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::{Inventory, StockHolding, StockHoldingInput};
use crate::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(get_inventory).post(add_holding))
        .route("/:id", get(get_inventory).put(update_holding).delete(delete_holding))
        .with_state(state)
}

/// GET /api/inventory — return all holdings
async fn get_inventory(State(state): State<Arc<AppState>>) -> Json<Inventory> {
    let holdings = state.inventory.read().await;
    Json(Inventory {
        holdings: holdings.clone(),
    })
}

/// POST /api/inventory — add a new holding
async fn add_holding(
    State(state): State<Arc<AppState>>,
    Json(input): Json<StockHoldingInput>,
) -> impl IntoResponse {
    let holding = StockHolding {
        id: Uuid::new_v4(),
        ticker: input.ticker.to_uppercase(),
        shares: input.shares,
        cost_basis: input.cost_basis,
        current_price: input.current_price,
    };
    let mut holdings = state.inventory.write().await;
    holdings.push(holding.clone());
    (StatusCode::CREATED, Json(holding))
}

/// PUT /api/inventory/:id — update price / shares for an existing holding
async fn update_holding(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(input): Json<StockHoldingInput>,
) -> impl IntoResponse {
    let mut holdings = state.inventory.write().await;
    if let Some(h) = holdings.iter_mut().find(|h| h.id == id) {
        h.ticker = input.ticker.to_uppercase();
        h.shares = input.shares;
        h.cost_basis = input.cost_basis;
        h.current_price = input.current_price;
        (StatusCode::OK, Json(Some(h.clone())))
    } else {
        (StatusCode::NOT_FOUND, Json(None))
    }
}

/// DELETE /api/inventory/:id — remove a holding
async fn delete_holding(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> StatusCode {
    let mut holdings = state.inventory.write().await;
    let original_len = holdings.len();
    holdings.retain(|h| h.id != id);
    if holdings.len() < original_len {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}
