//! GET /api/financials?tickers=AAPL,TSLA
//!
//! Returns a financial health scorecard for each ticker, summarising key
//! metrics from Yahoo Finance's financialData and defaultKeyStatistics modules.

use axum::{
    extract::Query,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use tracing::warn;

use crate::adapters::yahoo_finance::{acquire_crumb, fetch_financial_health};
use crate::models::FinancialHealth;

pub fn router() -> Router {
    Router::new().route("/", get(get_financials))
}

#[derive(Deserialize)]
struct TickersQuery {
    tickers: String,
}

async fn get_financials(Query(query): Query<TickersQuery>) -> impl IntoResponse {
    let tickers: Vec<String> = query
        .tickers
        .split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    let session = acquire_crumb().await;
    let (client, crumb) = match session {
        Ok(s) => s,
        Err(e) => {
            warn!(error = %e, "Failed to acquire Yahoo Finance session for financials");
            return Json(HashMap::<String, FinancialHealth>::new());
        }
    };

    let mut result: HashMap<String, FinancialHealth> = HashMap::new();

    for ticker in &tickers {
        match fetch_financial_health(&client, &crumb, ticker).await {
            Ok(data) => {
                result.insert(ticker.clone(), data);
            }
            Err(e) => {
                warn!(ticker = %ticker, error = %e, "Failed to fetch financial health");
            }
        }
    }

    Json(result)
}
