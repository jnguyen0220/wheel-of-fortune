use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::error;

use crate::llm::prompt::build_ranking_prompt;
use crate::models::{AnalystTrend, EarningsCalendar, Inventory, OptionsChain, StockMarketData};
use crate::strategy::wheel::{evaluate_wheel, WheelRecommendation};
use crate::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", post(get_recommendations))
        .with_state(state)
}

/// Request body – the caller can optionally supply a custom inventory
/// instead of the server-side in-memory one.
#[derive(Debug, Deserialize)]
pub struct RecommendationRequest {
    /// Override the server-side inventory.  If omitted, the stored inventory
    /// is used.
    pub inventory: Option<Inventory>,
    /// Tickers to fetch options data for.  Must match filenames in `data/mock/`.
    pub tickers: Vec<String>,
    /// Available cash for CSP recommendations (in dollars)
    pub available_cash: Option<f64>,
    /// Minimum days-to-expiration filter applied to options contracts.
    pub dte_min: Option<u32>,
    /// Maximum days-to-expiration filter applied to options contracts.
    pub dte_max: Option<u32>,
    /// Pre-fetched options chains from the frontend. When provided, the backend
    /// skips its own Yahoo Finance fetch — a major latency saving.
    pub chains: Option<Vec<OptionsChain>>,
    /// Upcoming earnings dates per ticker (from the frontend).
    pub earnings_calendar: Option<Vec<EarningsCalendar>>,
    /// Analyst recommendation trends per ticker (from the frontend).
    pub analyst_trends: Option<Vec<AnalystTrend>>,
    /// Minimum open interest threshold.
    pub min_open_interest: Option<u64>,
    /// CC delta range.
    pub cc_delta_min: Option<f64>,
    pub cc_delta_max: Option<f64>,
    /// CSP delta range.
    pub csp_delta_min: Option<f64>,
    pub csp_delta_max: Option<f64>,
    /// Minimum annualised ROC (percent).
    pub min_annualised_roc: Option<f64>,
    /// Maximum annualised ROC (percent) — filters out suspiciously high returns.
    pub max_annualised_roc: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct RecommendationResponse {
    pub market_data: HashMap<String, StockMarketData>,
    /// Pre-computed trade candidates from the wheel strategy engine.
    pub recommendations: Vec<WheelRecommendation>,
    /// The LLM prompt that asks the model to rank the pre-computed trades.
    pub llm_prompt: crate::llm::prompt::LlmPrompt,
    /// Adapter used to fetch options data.
    pub data_source: String,
    /// Tickers that were requested but had no options chain data.
    pub tickers_without_options: Vec<String>,
}

/// POST /api/recommendations
///
/// Fetches options chains for the requested tickers, runs the wheel strategy
/// engine, builds the LLM prompt, and returns all three artefacts to the
/// frontend. The frontend is responsible for actually calling the LLM API,
/// keeping backend infrastructure credentials out of the Rust service.
async fn get_recommendations(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RecommendationRequest>,
) -> impl IntoResponse {
    let requested_tickers = req.tickers;

    // Resolve inventory: use request body override or stored inventory.
    let (mut inventory, uses_request_inventory) = if let Some(inv) = req.inventory {
        (inv, true)
    } else {
        let holdings = state.inventory.read().await;
        (
            Inventory {
                holdings: holdings.clone(),
            },
            false,
        )
    };

    // Merge form tickers with inventory tickers so the option-chain fetch always
    // includes holdings present in the form payload.
    let mut merged_tickers: Vec<String> = requested_tickers
        .into_iter()
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect();

    for h in &inventory.holdings {
        let t = h.ticker.trim().to_uppercase();
        if !t.is_empty() && !merged_tickers.iter().any(|x| x == &t) {
            merged_tickers.push(t);
        }
    }

    if merged_tickers.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "tickers list must not be empty" })),
        )
            .into_response();
    }

    // Use pre-fetched chains from the frontend when available; otherwise fetch.
    let chains = if let Some(c) = req.chains {
        c
    } else {
        match state
            .options_provider
            .fetch_options_chains(&merged_tickers)
            .await
        {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to fetch options chains: {e:#}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("{e:#}") })),
                )
                    .into_response();
            }
        }
    };

    let data_source = state.options_provider.adapter_name().to_string();

    // Identify tickers that had no options chain returned.
    let tickers_with_chains: std::collections::HashSet<String> =
        chains.iter().map(|c| c.ticker.to_uppercase()).collect();
    let tickers_without_options: Vec<String> = merged_tickers
        .iter()
        .filter(|t| !tickers_with_chains.contains(t.as_str()))
        .cloned()
        .collect();

    // Build market data for each ticker — fetch concurrently.
    let market_data_tasks: Vec<_> = chains
        .iter()
        .map(|chain| {
            let provider = Arc::clone(&state.options_provider);
            let chain_ticker = chain.ticker.clone();
            let chain_price = chain.underlying_price;
            let has_contracts = !chain.contracts.is_empty();
            tokio::spawn(async move {
                match provider.fetch_stock_market_data(&chain_ticker).await {
                    Ok(data) => (chain_ticker, data),
                    Err(_) => (
                        chain_ticker.clone(),
                        StockMarketData {
                            ticker: chain_ticker,
                            price: chain_price,
                            daily_low: if has_contracts { chain_price * 0.98 } else { 0.0 },
                            daily_high: if has_contracts { chain_price * 1.02 } else { 0.0 },
                            week52_low: if has_contracts { chain_price * 0.75 } else { 0.0 },
                            week52_high: if has_contracts { chain_price * 1.30 } else { 0.0 },
                        },
                    ),
                }
            })
        })
        .collect();

    let mut market_data: HashMap<String, StockMarketData> = HashMap::new();
    for task in market_data_tasks {
        if let Ok((ticker, data)) = task.await {
            if data.price > 0.0 {
                market_data.insert(ticker, data);
            }
        }
    }

    if !market_data.is_empty() {
        for h in inventory.holdings.iter_mut() {
            if let Some(md) = market_data.get(&h.ticker) {
                if md.price > 0.0 {
                    h.current_price = md.price;
                }
            }
        }

        if !uses_request_inventory {
            let mut holdings = state.inventory.write().await;
            for h in holdings.iter_mut() {
                if let Some(md) = market_data.get(&h.ticker) {
                    if md.price > 0.0 {
                        h.current_price = md.price;
                    }
                }
            }
        }
    }

    let available_cash = req.available_cash.unwrap_or(f64::INFINITY);
    let min_dte = req.dte_min.unwrap_or(0);
    let max_dte = req.dte_max.unwrap_or(u32::MAX).max(min_dte + 1);
    let earnings = req.earnings_calendar.unwrap_or_default();
    let analyst = req.analyst_trends.unwrap_or_default();

    let filter_params = crate::strategy::wheel::FilterParams {
        min_open_interest: req.min_open_interest,
        cc_delta_min: req.cc_delta_min,
        cc_delta_max: req.cc_delta_max,
        csp_delta_min: req.csp_delta_min,
        csp_delta_max: req.csp_delta_max,
        min_annualised_roc: req.min_annualised_roc,
        max_annualised_roc: req.max_annualised_roc,
    };

    // Run the wheel strategy engine to get pre-computed, validated trades.
    let recommendations = evaluate_wheel(
        &inventory.holdings,
        &chains,
        available_cash,
        min_dte,
        max_dte,
        &earnings,
        &filter_params,
    );

    // Build an LLM prompt that asks the model to rank these pre-computed trades.
    let llm_prompt = build_ranking_prompt(
        &recommendations,
        &inventory,
        available_cash,
        min_dte,
        max_dte,
        &earnings,
        &analyst,
    );

    Json(RecommendationResponse {
        market_data,
        recommendations,
        llm_prompt,
        data_source,
        tickers_without_options,
    })
    .into_response()
}
