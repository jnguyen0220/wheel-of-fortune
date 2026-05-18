//! GET /api/options?tickers=AAPL,TSLA
//!
//! Returns the full options chain for each requested ticker.
//! Results are cached for 5 minutes per ticker.

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

    // Check cache for each ticker
    let mut cached_chains = Vec::new();
    let mut uncached_tickers = Vec::new();
    {
        let cache = state.options_cache.read().await;
        for ticker in &tickers {
            if let Some(chain) = cache.peek(ticker) {
                cached_chains.push(chain);
            } else {
                uncached_tickers.push(ticker.clone());
            }
        }
    }

    // Fetch uncached tickers
    if !uncached_tickers.is_empty() {
        match state.options_provider.fetch_options_chains(&uncached_tickers).await {
            Ok(chains) => {
                let mut cache = state.options_cache.write().await;
                for chain in chains {
                    cache.insert(chain.ticker.clone(), chain.clone());
                    cached_chains.push(chain);
                }
            }
            Err(e) => {
                warn!(error = %e, "Failed to fetch options chains for uncached tickers");
            }
        }
    }

    Json(cached_chains)
}
