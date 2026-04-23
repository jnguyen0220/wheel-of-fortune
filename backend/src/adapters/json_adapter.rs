//! JSON Adapter – loads options data from local JSON files.
//!
//! This adapter is designed for local development and testing.
//! It reads pre-recorded options chain data from the `data/` directory,
//! allowing the full application stack to be exercised without requiring
//! any live market data API keys.
//!
//! # Data format
//! Each ticker's data lives in `<data_dir>/<TICKER>.json` and must conform
//! to the [`OptionsChain`] schema. See `data/mock/` for examples.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use async_trait::async_trait;
use tracing::debug;

use crate::adapters::OptionsDataProvider;
use crate::models::OptionsChain;

pub struct JsonAdapter {
    /// Root directory containing per-ticker JSON files.
    data_dir: PathBuf,
}

impl JsonAdapter {
    /// Create a new `JsonAdapter` pointing at `data_dir`.
    /// The directory must contain files named `<TICKER>.json`.
    pub fn new(data_dir: impl AsRef<Path>) -> Self {
        Self {
            data_dir: data_dir.as_ref().to_path_buf(),
        }
    }
}

#[async_trait]
impl OptionsDataProvider for JsonAdapter {
    fn adapter_name(&self) -> &'static str {
        "JsonAdapter (local mock data)"
    }

    async fn fetch_options_chain(&self, ticker: &str) -> Result<OptionsChain> {
        // Normalise ticker to uppercase so file names are consistent.
        let ticker_upper = ticker.to_uppercase();
        let file_path = self.data_dir.join(format!("{ticker_upper}.json"));

        debug!(
            adapter = self.adapter_name(),
            ticker = %ticker_upper,
            path = %file_path.display(),
            "Loading options chain from JSON file"
        );

        let raw = std::fs::read_to_string(&file_path).with_context(|| {
            format!(
                "JsonAdapter: could not read file '{}'. \
                 Make sure a mock data file exists for ticker '{}'.",
                file_path.display(),
                ticker_upper
            )
        })?;

        let chain: OptionsChain = serde_json::from_str(&raw).with_context(|| {
            format!(
                "JsonAdapter: failed to parse JSON from '{}'",
                file_path.display()
            )
        })?;

        Ok(chain)
    }
}
