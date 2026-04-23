mod adapters;
mod llm;
mod models;
mod routes;
mod strategy;

use std::sync::Arc;

use anyhow::Result;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use adapters::{json_adapter::JsonAdapter, OptionsDataProvider};
use adapters::yahoo_finance::YahooFinanceAdapter;
use models::StockHolding;

// ── Application state ─────────────────────────────────────────────────────────

pub struct AppState {
    /// In-memory portfolio inventory (shared, RW-locked).
    pub inventory: RwLock<Vec<StockHolding>>,
    /// Options data provider (JSON mock or live web API).
    pub options_provider: Arc<dyn OptionsDataProvider>,
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env if present (dev convenience).
    let _ = dotenvy::dotenv();

    // Initialise tracing.
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "wheel_advisor=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Select adapter based on environment variable.
    //   DATA_SOURCE=yahoo  → YahooFinanceAdapter (default, no API key needed)
    //   DATA_SOURCE=api    → WebApiAdapter (requires OPTIONS_API_KEY)
    //   DATA_SOURCE=json   → JsonAdapter (local mock files)
    let data_source = std::env::var("DATA_SOURCE").unwrap_or_else(|_| "yahoo".to_string());

    let options_provider: Arc<dyn OptionsDataProvider> = match data_source.as_str() {
        "api" => {
            use adapters::web_api_adapter::WebApiAdapter;
            info!("Using WebApiAdapter (live market data via MarketData.app)");
            Arc::new(WebApiAdapter::from_env()?)
        }
        "json" => {
            let data_dir = std::env::var("MOCK_DATA_DIR")
                .unwrap_or_else(|_| "../data/mock".to_string());
            info!("Using JsonAdapter with data dir: {data_dir}");
            Arc::new(JsonAdapter::new(data_dir))
        }
        _ => {
            info!("Using YahooFinanceAdapter (live market data via Yahoo Finance)");
            Arc::new(YahooFinanceAdapter)
        }
    };

    let state = Arc::new(AppState {
        inventory: RwLock::new(Vec::new()),
        options_provider,
    });

    // CORS – allow all origins in development. Tighten for production.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = routes::build_router(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Wheel Advisor API listening on {addr}");

    axum::serve(listener, app).await?;
    Ok(())
}
