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
use crate::strategy::wheel::{evaluate_wheel, IvContext, PortfolioContext, WheelRecommendation};
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
    /// Tickers to fetch options data for.
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
    /// Max assignment probability (delta) for covered calls.
    pub cc_max_assignment_pct: Option<f64>,
    /// Max assignment probability (delta) for cash-secured puts.
    pub csp_max_assignment_pct: Option<f64>,
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

    // Identify tickers that had no options chain returned.
    let tickers_with_chains: std::collections::HashSet<String> =
        chains.iter().map(|c| c.ticker.to_uppercase()).collect();
    let tickers_without_options: Vec<String> = merged_tickers
        .iter()
        .filter(|t| !tickers_with_chains.contains(t.as_str()))
        .cloned()
        .collect();

    // Build market data from options chains (underlying_price) + cached market data.
    // Avoids redundant HTTP calls since chains already carry the current price.
    let mut market_data: HashMap<String, StockMarketData> = HashMap::new();
    {
        let cache = state.market_data_cache.read().await;
        for chain in &chains {
            if let Some(cached_md) = cache.peek(&chain.ticker) {
                market_data.insert(chain.ticker.clone(), cached_md);
            } else {
                // Construct minimal market data from the chain's underlying price
                let price = chain.underlying_price;
                if price > 0.0 {
                    market_data.insert(
                        chain.ticker.clone(),
                        StockMarketData {
                            ticker: chain.ticker.clone(),
                            price,
                            daily_low: price * 0.98,
                            daily_high: price * 1.02,
                            week52_low: price * 0.75,
                            week52_high: price * 1.30,
                            has_pre_post_market_data: false,
                            market_state: "REGULAR".to_string(),
                            pre_market_price: None,
                            pre_market_change_percent: None,
                            post_market_price: None,
                            post_market_change_percent: None,
                        },
                    );
                }
            }
        }
    }

    // Fetch market data only for tickers NOT already resolved
    let missing_tickers: Vec<String> = chains
        .iter()
        .map(|c| c.ticker.clone())
        .filter(|t| !market_data.contains_key(t))
        .collect();

    if !missing_tickers.is_empty() {
        let market_data_tasks: Vec<_> = missing_tickers
            .iter()
            .map(|ticker| {
                let provider = Arc::clone(&state.options_provider);
                let t = ticker.clone();
                tokio::spawn(async move {
                    match provider.fetch_stock_market_data(&t).await {
                        Ok(data) => Some((t, data)),
                        Err(_) => None,
                    }
                })
            })
            .collect();

        for task in market_data_tasks {
            if let Ok(Some((ticker, data))) = task.await {
                if data.price > 0.0 {
                    market_data.insert(ticker, data);
                }
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
        cc_max_assignment_pct: req.cc_max_assignment_pct,
        csp_max_assignment_pct: req.csp_max_assignment_pct,
        min_annualised_roc: req.min_annualised_roc,
        max_annualised_roc: req.max_annualised_roc,
    };

    // Build portfolio context for CSP optimization scoring.
    // Sector data comes from the financial health cache if available.
    let ticker_sectors: HashMap<String, String> = {
        let cache = state.financials_cache.read().await;
        cache.entries()
            .into_iter()
            .filter_map(|(t, h)| h.sector.map(|s| (t, s)))
            .collect()
    };
    let portfolio_ctx = PortfolioContext::from_holdings(
        &inventory.holdings,
        &ticker_sectors,
        &chains,
    );

    // Build IV context from candle data + options chains.
    let iv_ctx = IvContext::from_data(
        &{
            // Re-read chart cache to get candle data for IV analysis
            let cache = state.chart_cache.read().await;
            let mut map = std::collections::HashMap::new();
            for chain in &chains {
                if let Some(candles) = cache.peek(&chain.ticker) {
                    map.insert(chain.ticker.to_uppercase(), candles);
                }
            }
            map
        },
        &chains,
    );

    // Run the wheel strategy engine to get pre-computed, validated trades.
    let recommendations = evaluate_wheel(
        &inventory.holdings,
        &chains,
        available_cash,
        min_dte,
        max_dte,
        &earnings,
        &filter_params,
        Some(&portfolio_ctx),
        Some(&iv_ctx),
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
        tickers_without_options,
    })
    .into_response()
}
