mod adapters;
mod cache;
mod llm;
mod models;
mod routes;
mod strategy;

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use adapters::OptionsDataProvider;
use adapters::yahoo_finance::{YahooFinanceAdapter, YahooSession};
use cache::TtlCache;
use models::{AnalystTrend, EarningsCalendar, EarningsResult, FinancialHealth, ScreenerCandidate, StockHolding, StockMarketData};
use routes::news::NewsItem;

// ── Application state ─────────────────────────────────────────────────────────

pub struct AppState {
    /// In-memory portfolio inventory (shared, RW-locked).
    pub inventory: RwLock<Vec<StockHolding>>,
    /// Options data provider (JSON mock or live web API).
    pub options_provider: Arc<dyn OptionsDataProvider>,
    /// Centralized Yahoo Finance session (crumb + cookie client, auto-refreshed).
    pub yahoo: Arc<YahooSession>,
    /// Cache for financial health lookups — TTL 12 hours, max 50 items.
    pub financials_cache: RwLock<TtlCache<FinancialHealth>>,
    /// Cache for earnings calendar — TTL 24 hours, max 50 items.
    pub earnings_calendar_cache: RwLock<TtlCache<Vec<EarningsCalendar>>>,
    /// Cache for earnings history — TTL 24 hours, max 50 items.
    pub earnings_history_cache: RwLock<TtlCache<Vec<EarningsResult>>>,
    /// Cache for analyst trends — TTL 6 hours, max 50 items.
    pub analyst_trends_cache: RwLock<TtlCache<Vec<AnalystTrend>>>,
    /// Cache for screener data — TTL 3 hours, max 50 items.
    pub screener_cache: RwLock<TtlCache<ScreenerCandidate>>,
    /// Cache for news — TTL 15 minutes, max 50 items.
    pub news_cache: RwLock<TtlCache<Vec<NewsItem>>>,
    /// Cache for market data — TTL 2 minutes, max 50 items.
    pub market_data_cache: RwLock<TtlCache<StockMarketData>>,
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

    info!("Using YahooFinanceAdapter (live market data via Yahoo Finance)");
    let yahoo = Arc::new(YahooSession::new());
    let options_provider: Arc<dyn OptionsDataProvider> = Arc::new(YahooFinanceAdapter::new(yahoo.clone()));

    let state = Arc::new(AppState {
        inventory: RwLock::new(Vec::new()),
        options_provider,
        yahoo,
        financials_cache: RwLock::new(TtlCache::new(50, Duration::from_secs(12 * 3600))),
        earnings_calendar_cache: RwLock::new(TtlCache::new(50, Duration::from_secs(24 * 3600))),
        earnings_history_cache: RwLock::new(TtlCache::new(50, Duration::from_secs(24 * 3600))),
        analyst_trends_cache: RwLock::new(TtlCache::new(50, Duration::from_secs(6 * 3600))),
        screener_cache: RwLock::new(TtlCache::new(50, Duration::from_secs(3 * 3600))),
        news_cache: RwLock::new(TtlCache::new(50, Duration::from_secs(15 * 60))),
        market_data_cache: RwLock::new(TtlCache::new(50, Duration::from_secs(2 * 60))),
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
