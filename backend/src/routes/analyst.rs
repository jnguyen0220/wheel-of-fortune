//! GET /api/analyst-trends?tickers=AAPL,TSLA
//!
//! Returns analyst recommendation trends (strongBuy, buy, hold, sell, strongSell)
//! for the given tickers. Powered by Yahoo Finance's recommendationTrend module.

use axum::{
    extract::Query,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use tracing::warn;

use crate::adapters::yahoo_finance::{acquire_crumb, fetch_recommendation_trend};
use crate::models::AnalystTrend;

pub fn router() -> Router {
    Router::new().route("/", get(get_analyst_trends))
}

#[derive(Deserialize)]
struct TickersQuery {
    tickers: String,
}

async fn get_analyst_trends(
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
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
            warn!(error = %e, "Failed to acquire Yahoo Finance session for analyst trends");
            return Json(HashMap::<String, Vec<AnalystTrend>>::new());
        }
    };

    let mut result: HashMap<String, Vec<AnalystTrend>> = HashMap::new();

    for ticker in &tickers {
        match fetch_recommendation_trend(&client, &crumb, ticker).await {
            Ok(data) => {
                result.insert(ticker.clone(), data);
            }
            Err(e) => {
                warn!(ticker = %ticker, error = %e, "Failed to fetch analyst trends");
            }
        }
    }

    Json(result)
}
