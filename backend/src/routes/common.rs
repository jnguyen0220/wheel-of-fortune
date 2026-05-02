use serde::Deserialize;

/// Common query parameter struct for routes that accept a comma-separated `tickers` param.
#[derive(Deserialize)]
pub struct TickersQuery {
    pub tickers: String,
}

/// Common query parameter struct for routes where `tickers` is optional (falls back to defaults).
#[derive(Deserialize)]
pub struct OptionalTickersQuery {
    pub tickers: Option<String>,
}

/// Parse a comma-separated tickers string into a Vec of uppercase, trimmed ticker symbols.
pub fn parse_tickers(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|t| t.trim().to_uppercase())
        .filter(|t| !t.is_empty())
        .collect()
}

/// Parse an optional tickers string, falling back to DEFAULT_TICKERS if absent or empty.
pub fn parse_tickers_or_default(raw: Option<&str>) -> Vec<String> {
    match raw {
        Some(t) if !t.trim().is_empty() => parse_tickers(t),
        _ => DEFAULT_TICKERS.iter().map(|s| s.to_string()).collect(),
    }
}

/// A curated list of well-known, liquid stocks suitable for the wheel strategy.
/// These have active options markets and are commonly wheeled.
pub const DEFAULT_TICKERS: &[&str] = &[
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "AMD", "INTC", "NFLX", "DIS", "BA", "JPM", "BAC", "GS",
    "V", "MA", "PFE", "JNJ", "UNH", "XOM", "CVX", "KO", "PEP",
    "WMT", "HD", "MCD", "NKE", "SBUX", "PYPL", "SQ", "SOFI",
    "PLTR", "COIN", "HOOD", "F", "GM", "T", "VZ", "CSCO",
];
