//! GET /api/batch?tickers=AAPL,TSLA
//!
//! Returns market data, earnings calendar, earnings history, analyst trends,
//! and financial health in a single response. This avoids the frontend needing
//! to make 5 separate requests (each triggering independent crumb acquisitions).

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::warn;

use crate::adapters::yahoo_finance::fetch_combined_quote_summary;
use crate::models::{AnalystTrend, EarningsCalendar, EarningsResult, FinancialHealth, StockMarketData};
use crate::AppState;

use super::common::{TickersQuery, parse_tickers};

pub fn router(state: Arc<AppState>) -> Router {
    Router::new().route("/", get(get_batch)).with_state(state)
}

#[derive(Serialize)]
struct BatchResponse {
    market_data: HashMap<String, StockMarketData>,
    earnings_calendar: HashMap<String, Vec<EarningsCalendar>>,
    earnings_history: HashMap<String, Vec<EarningsResult>>,
    analyst_trends: HashMap<String, Vec<AnalystTrend>>,
    financials: HashMap<String, FinancialHealth>,
}

async fn get_batch(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TickersQuery>,
) -> impl IntoResponse {
    let tickers = parse_tickers(&query.tickers);

    let mut market_data: HashMap<String, StockMarketData> = HashMap::new();
    let mut earnings_calendar: HashMap<String, Vec<EarningsCalendar>> = HashMap::new();
    let mut earnings_history: HashMap<String, Vec<EarningsResult>> = HashMap::new();
    let mut analyst_trends: HashMap<String, Vec<AnalystTrend>> = HashMap::new();
    let mut financials: HashMap<String, FinancialHealth> = HashMap::new();

    // Check caches first for each data type (read locks only).
    let mut uncached_market: Vec<String> = Vec::new();
    let mut uncached_cal: Vec<String> = Vec::new();
    let mut uncached_hist: Vec<String> = Vec::new();
    let mut uncached_analyst: Vec<String> = Vec::new();
    let mut uncached_fin: Vec<String> = Vec::new();

    {
        let mc = state.market_data_cache.read().await;
        for ticker in &tickers {
            if let Some(v) = mc.peek(ticker) { market_data.insert(ticker.clone(), v); } else { uncached_market.push(ticker.clone()); }
        }
    }
    {
        let cc = state.earnings_calendar_cache.read().await;
        for ticker in &tickers {
            if let Some(v) = cc.peek(ticker) { earnings_calendar.insert(ticker.clone(), v); } else { uncached_cal.push(ticker.clone()); }
        }
    }
    {
        let hc = state.earnings_history_cache.read().await;
        for ticker in &tickers {
            if let Some(v) = hc.peek(ticker) { earnings_history.insert(ticker.clone(), v); } else { uncached_hist.push(ticker.clone()); }
        }
    }
    {
        let ac = state.analyst_trends_cache.read().await;
        for ticker in &tickers {
            if let Some(v) = ac.peek(ticker) { analyst_trends.insert(ticker.clone(), v); } else { uncached_analyst.push(ticker.clone()); }
        }
    }
    {
        let fc = state.financials_cache.read().await;
        for ticker in &tickers {
            if let Some(v) = fc.peek(ticker) { financials.insert(ticker.clone(), v); } else { uncached_fin.push(ticker.clone()); }
        }
    }

    // Acquire one Yahoo session for all crumb-requiring fetches.
    let session = if uncached_cal.is_empty() && uncached_hist.is_empty() && uncached_analyst.is_empty() && uncached_fin.is_empty() {
        None
    } else {
        match state.yahoo.get().await {
            Ok(s) => Some(s),
            Err(e) => {
                warn!(error = %e, "Failed to acquire Yahoo Finance session for batch");
                None
            }
        }
    };

    // Fetch uncached market data (uses chart API, no crumb needed).
    if !uncached_market.is_empty() {
        let tasks: Vec<_> = uncached_market
            .into_iter()
            .map(|ticker| {
                let provider = Arc::clone(&state.options_provider);
                tokio::spawn(async move {
                    match provider.fetch_stock_market_data(&ticker).await {
                        Ok(data) => Some((ticker, data)),
                        Err(e) => { warn!(ticker = %ticker, error = %e, "batch: market data failed"); None }
                    }
                })
            })
            .collect();

        let mut cache = state.market_data_cache.write().await;
        for task in tasks {
            if let Ok(Some((ticker, data))) = task.await {
                cache.insert(ticker.clone(), data.clone());
                market_data.insert(ticker, data);
            }
        }
    }

    // Fetch crumb-dependent data using combined quoteSummary (1 API call per ticker instead of 4).
    if let Some((client, crumb)) = session {
        // Find tickers that need any crumb-dependent data
        let mut needs_combined: Vec<String> = Vec::new();
        let mut combined_set = std::collections::HashSet::new();
        for t in uncached_cal.iter().chain(uncached_hist.iter()).chain(uncached_analyst.iter()).chain(uncached_fin.iter()) {
            if combined_set.insert(t.clone()) {
                needs_combined.push(t.clone());
            }
        }

        let combined_tasks: Vec<_> = needs_combined.into_iter().map(|ticker| {
            let c = client.clone(); let cr = crumb.clone();
            tokio::spawn(async move {
                match fetch_combined_quote_summary(&c, &cr, &ticker).await {
                    Ok(d) => Some((ticker, d)),
                    Err(e) => { warn!(ticker = %ticker, error = %e, "batch: combined fetch failed"); None }
                }
            })
        }).collect();

        // Collect results and update all caches.
        let uncached_cal_set: std::collections::HashSet<_> = uncached_cal.into_iter().collect();
        let uncached_hist_set: std::collections::HashSet<_> = uncached_hist.into_iter().collect();
        let uncached_analyst_set: std::collections::HashSet<_> = uncached_analyst.into_iter().collect();
        let uncached_fin_set: std::collections::HashSet<_> = uncached_fin.into_iter().collect();

        for task in combined_tasks {
            if let Ok(Some((ticker, data))) = task.await {
                if uncached_cal_set.contains(&ticker) {
                    let mut cache = state.earnings_calendar_cache.write().await;
                    cache.insert(ticker.clone(), data.earnings_calendar.clone());
                    earnings_calendar.insert(ticker.clone(), data.earnings_calendar);
                }
                if uncached_hist_set.contains(&ticker) {
                    let mut cache = state.earnings_history_cache.write().await;
                    cache.insert(ticker.clone(), data.earnings_history.clone());
                    earnings_history.insert(ticker.clone(), data.earnings_history);
                }
                if uncached_analyst_set.contains(&ticker) {
                    let mut cache = state.analyst_trends_cache.write().await;
                    cache.insert(ticker.clone(), data.analyst_trends.clone());
                    analyst_trends.insert(ticker.clone(), data.analyst_trends);
                }
                if uncached_fin_set.contains(&ticker) {
                    if let Some(health) = data.financial_health {
                        let mut cache = state.financials_cache.write().await;
                        cache.insert(ticker.clone(), health.clone());
                        financials.insert(ticker, health);
                    }
                }
            }
        }
    }

    Json(BatchResponse {
        market_data,
        earnings_calendar,
        earnings_history,
        analyst_trends,
        financials,
    })
}
