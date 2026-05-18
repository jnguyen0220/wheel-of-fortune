//! GET /api/search?q=apple
//!
//! Returns matching tickers and company names from Yahoo Finance autocomplete.

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::warn;

use crate::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new().route("/", get(search_tickers)).with_state(state)
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub symbol: String,
    pub name: String,
    pub exchange: String,
    pub r#type: String,
}

#[derive(Debug, Deserialize)]
struct YahooSearchResponse {
    quotes: Option<Vec<YahooQuote>>,
}

#[derive(Debug, Deserialize)]
struct YahooQuote {
    symbol: Option<String>,
    shortname: Option<String>,
    longname: Option<String>,
    exchange: Option<String>,
    #[serde(rename = "quoteType")]
    quote_type: Option<String>,
}

async fn search_tickers(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    let q = query.q.trim();
    if q.is_empty() {
        return Json(Vec::<SearchResult>::new());
    }

    match fetch_search(&state.yahoo.http, q).await {
        Ok(results) => Json(results),
        Err(()) => Json(Vec::new()),
    }
}

async fn fetch_search(client: &Client, query: &str) -> Result<Vec<SearchResult>, ()> {
    let url = "https://query1.finance.yahoo.com/v1/finance/search";

    let resp = client
        .get(url)
        .query(&[
            ("q", query),
            ("quotesCount", "15"),
            ("newsCount", "0"),
            ("listsCount", "0"),
            ("enableFuzzyQuery", "true"),
        ])
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| {
            warn!(query, error = %e, "Failed to fetch search results");
        })?;

    if !resp.status().is_success() {
        warn!(query, status = %resp.status(), "Yahoo search returned non-200");
        return Ok(Vec::new());
    }

    let body: YahooSearchResponse = resp.json().await.map_err(|e| {
        warn!(query, error = %e, "Failed to parse search JSON");
    })?;

    let results = body
        .quotes
        .unwrap_or_default()
        .into_iter()
        .filter_map(|q| {
            let symbol = q.symbol?;
            let name = q.longname.or(q.shortname).unwrap_or_default();
            Some(SearchResult {
                symbol,
                name,
                exchange: q.exchange.unwrap_or_default(),
                r#type: q.quote_type.unwrap_or_default(),
            })
        })
        .collect();

    Ok(results)
}
