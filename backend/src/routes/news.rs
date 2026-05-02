//! GET /api/news?tickers=AAPL,TSLA
//!
//! Returns recent news headlines for the given tickers from Yahoo Finance.
//! If no tickers are specified, uses a default list of popular stocks.

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

use super::common::{parse_tickers_or_default, OptionalTickersQuery};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new().route("/", get(get_news)).with_state(state)
}

#[derive(Debug, Clone, Serialize)]
pub struct NewsItem {
    pub ticker: String,
    pub title: String,
    pub publisher: String,
    pub link: String,
    pub published_at: i64,
}

#[derive(Debug, Deserialize)]
struct YahooSearchResponse {
    news: Option<Vec<YahooNewsItem>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YahooNewsItem {
    title: Option<String>,
    publisher: Option<String>,
    link: Option<String>,
    provider_publish_time: Option<i64>,
}

async fn get_news(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OptionalTickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers_or_default(query.tickers.as_deref());

    let mut all_news: Vec<NewsItem> = Vec::new();
    let mut uncached: Vec<String> = Vec::new();

    {
        let mut cache = state.news_cache.write().await;
        for ticker in &tickers {
            if let Some(cached) = cache.get(ticker) {
                all_news.extend(cached);
            } else {
                uncached.push(ticker.clone());
            }
        }
    }

    if !uncached.is_empty() {
        let client = state.yahoo.http.clone();

        let tasks: Vec<_> = uncached
            .into_iter()
            .map(|ticker| {
                let client = client.clone();
                tokio::spawn(async move {
                    let items = fetch_news(&client, &ticker).await.unwrap_or_default();
                    (ticker, items)
                })
            })
            .collect();

        let mut cache = state.news_cache.write().await;
        for task in tasks {
            if let Ok((ticker, items)) = task.await {
                cache.insert(ticker, items.clone());
                all_news.extend(items);
            }
        }
    }

    // Sort by most recent first
    all_news.sort_by(|a, b| b.published_at.cmp(&a.published_at));

    Json(all_news)
}

async fn fetch_news(client: &Client, ticker: &str) -> Result<Vec<NewsItem>, ()> {
    let url = format!(
        "https://query1.finance.yahoo.com/v1/finance/search?q={}&newsCount=20&quotesCount=0&listsCount=0",
        ticker
    );

    let resp = client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| {
            warn!(ticker, error = %e, "Failed to fetch news");
        })?;

    if !resp.status().is_success() {
        warn!(ticker, status = %resp.status(), "Yahoo Finance news returned non-200");
        return Ok(Vec::new());
    }

    let body: YahooSearchResponse = resp.json().await.map_err(|e| {
        warn!(ticker, error = %e, "Failed to parse news JSON");
    })?;

    let items = body
        .news
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            Some(NewsItem {
                ticker: ticker.to_string(),
                title: item.title?,
                publisher: item.publisher.unwrap_or_default(),
                link: item.link?,
                published_at: item.provider_publish_time.unwrap_or(0),
            })
        })
        .collect();

    Ok(items)
}
