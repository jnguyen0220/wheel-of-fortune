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

use crate::adapters::yahoo_finance::{
    fetch_earnings_calendar, fetch_earnings_history, fetch_financial_health,
    fetch_recommendation_trend,
};
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

    // Check caches first for each data type.
    let mut uncached_market: Vec<String> = Vec::new();
    let mut uncached_cal: Vec<String> = Vec::new();
    let mut uncached_hist: Vec<String> = Vec::new();
    let mut uncached_analyst: Vec<String> = Vec::new();
    let mut uncached_fin: Vec<String> = Vec::new();

    {
        let mut mc = state.market_data_cache.write().await;
        let mut cc = state.earnings_calendar_cache.write().await;
        let mut hc = state.earnings_history_cache.write().await;
        let mut ac = state.analyst_trends_cache.write().await;
        let mut fc = state.financials_cache.write().await;

        for ticker in &tickers {
            if let Some(v) = mc.get(ticker) { market_data.insert(ticker.clone(), v); } else { uncached_market.push(ticker.clone()); }
            if let Some(v) = cc.get(ticker) { earnings_calendar.insert(ticker.clone(), v); } else { uncached_cal.push(ticker.clone()); }
            if let Some(v) = hc.get(ticker) { earnings_history.insert(ticker.clone(), v); } else { uncached_hist.push(ticker.clone()); }
            if let Some(v) = ac.get(ticker) { analyst_trends.insert(ticker.clone(), v); } else { uncached_analyst.push(ticker.clone()); }
            if let Some(v) = fc.get(ticker) { financials.insert(ticker.clone(), v); } else { uncached_fin.push(ticker.clone()); }
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

    // Fetch crumb-dependent data in parallel (all sharing the same session).
    if let Some((client, crumb)) = session {
        // Earnings calendar
        let cal_tasks: Vec<_> = uncached_cal.into_iter().map(|ticker| {
            let c = client.clone(); let cr = crumb.clone();
            tokio::spawn(async move {
                match fetch_earnings_calendar(&c, &cr, &ticker).await {
                    Ok(d) => Some((ticker, d)), Err(_) => None,
                }
            })
        }).collect();

        // Earnings history
        let hist_tasks: Vec<_> = uncached_hist.into_iter().map(|ticker| {
            let c = client.clone(); let cr = crumb.clone();
            tokio::spawn(async move {
                match fetch_earnings_history(&c, &cr, &ticker).await {
                    Ok(d) => Some((ticker, d)), Err(_) => None,
                }
            })
        }).collect();

        // Analyst trends
        let analyst_tasks: Vec<_> = uncached_analyst.into_iter().map(|ticker| {
            let c = client.clone(); let cr = crumb.clone();
            tokio::spawn(async move {
                match fetch_recommendation_trend(&c, &cr, &ticker).await {
                    Ok(d) => Some((ticker, d)), Err(_) => None,
                }
            })
        }).collect();

        // Financial health
        let fin_tasks: Vec<_> = uncached_fin.into_iter().map(|ticker| {
            let c = client.clone(); let cr = crumb.clone();
            tokio::spawn(async move {
                match fetch_financial_health(&c, &cr, &ticker).await {
                    Ok(d) => Some((ticker, d)), Err(_) => None,
                }
            })
        }).collect();

        // Collect results and update caches.
        {
            let mut cache = state.earnings_calendar_cache.write().await;
            for task in cal_tasks {
                if let Ok(Some((ticker, data))) = task.await {
                    cache.insert(ticker.clone(), data.clone());
                    earnings_calendar.insert(ticker, data);
                }
            }
        }
        {
            let mut cache = state.earnings_history_cache.write().await;
            for task in hist_tasks {
                if let Ok(Some((ticker, data))) = task.await {
                    cache.insert(ticker.clone(), data.clone());
                    earnings_history.insert(ticker, data);
                }
            }
        }
        {
            let mut cache = state.analyst_trends_cache.write().await;
            for task in analyst_tasks {
                if let Ok(Some((ticker, data))) = task.await {
                    cache.insert(ticker.clone(), data.clone());
                    analyst_trends.insert(ticker, data);
                }
            }
        }
        {
            let mut cache = state.financials_cache.write().await;
            for task in fin_tasks {
                if let Ok(Some((ticker, data))) = task.await {
                    cache.insert(ticker.clone(), data.clone());
                    financials.insert(ticker, data);
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
