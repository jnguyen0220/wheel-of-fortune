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

use crate::llm::prompt::{build_llm_prompt, build_valid_strikes};
use crate::models::{Inventory, StockMarketData};
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
    /// Minimum premium per share (absolute dollars). Optional; defaults applied server-side.
    pub min_premium_abs: Option<f64>,
    /// Minimum premium per share (percent of strike, e.g. 0.0015 = 0.15%). Optional; defaults applied server-side.
    pub min_premium_pct: Option<f64>,
    /// Preferred data source: "json" for mock data, "api" for live market data.
    /// Optional; if omitted, uses the configured default.
    pub data_source: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RecommendationResponse {
    pub market_data: HashMap<String, StockMarketData>,
    /// The LLM prompt ready to send to the AI for analysis.
    pub llm_prompt: crate::llm::prompt::LlmPrompt,
    /// Adapter used to fetch options data.
    pub data_source: String,
    /// Valid strikes for each ticker and type ("CC"/"CSP").
    /// Frontend uses this to validate and snap LLM-hallucinated strikes.
    pub valid_strikes: HashMap<String, HashMap<String, Vec<f64>>>,
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

    // Fetch options chains via the configured adapter.
    let chains = match state
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
    };

    let data_source = state.options_provider.adapter_name().to_string();

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
    let min_premium_abs = req.min_premium_abs.unwrap_or(0.25).max(0.0);
    let min_premium_pct = req.min_premium_pct.unwrap_or(0.0015).max(0.0);

    // Build LLM prompt directly from the raw options chains.
    // The LLM is the recommendation engine — no mechanical pre-filter.
    let llm_prompt = build_llm_prompt(
        &inventory,
        &chains,
        available_cash,
        min_premium_abs,
        min_premium_pct,
    );
    let valid_strikes = build_valid_strikes(&inventory, &chains, min_premium_abs, min_premium_pct);

    Json(RecommendationResponse {
        market_data,
        llm_prompt,
        data_source,
        valid_strikes,
    })
    .into_response()
}
