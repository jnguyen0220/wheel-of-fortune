//! GET /api/financials?tickers=AAPL,TSLA
//!
//! Returns a financial health scorecard for each ticker, summarising key
//! metrics from Yahoo Finance's financialData and defaultKeyStatistics modules.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::warn;

use crate::adapters::yahoo_finance::fetch_financial_health;
use crate::models::FinancialHealth;
use crate::AppState;

use super::common::{TickersQuery, parse_tickers};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new().route("/", get(get_financials)).with_state(state)
}

async fn get_financials(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);

    let mut result: HashMap<String, FinancialHealth> = HashMap::new();
    let mut uncached_tickers: Vec<String> = Vec::new();

    // Check cache for each ticker.
    {
        let mut cache = state.financials_cache.write().await;
        for ticker in &tickers {
            if let Some(cached) = cache.get(ticker) {
                result.insert(ticker.clone(), cached);
            } else {
                uncached_tickers.push(ticker.clone());
            }
        }
    }

    // Fetch uncached tickers from Yahoo Finance.
    if !uncached_tickers.is_empty() {
        let session = state.yahoo.get().await;
        let (client, crumb) = match session {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, "Failed to acquire Yahoo Finance session for financials");
                return Json(result);
            }
        };

        let tasks: Vec<_> = uncached_tickers
            .into_iter()
            .map(|ticker| {
                let client = client.clone();
                let crumb = crumb.clone();
                tokio::spawn(async move {
                    match fetch_financial_health(&client, &crumb, &ticker).await {
                        Ok(data) => Some((ticker, data)),
                        Err(e) => {
                            warn!(ticker = %ticker, error = %e, "Failed to fetch financial health");
                            None
                        }
                    }
                })
            })
            .collect();

        let mut cache = state.financials_cache.write().await;
        for task in tasks {
            if let Ok(Some((ticker, data))) = task.await {
                cache.insert(ticker.clone(), data.clone());
                result.insert(ticker, data);
            }
        }
    }

    Json(result)
}
