use std::collections::HashMap;
use std::time::Instant;

use crate::models::FinancialHealth;

const MAX_CAPACITY: usize = 20;

struct CacheEntry {
    data: FinancialHealth,
    last_accessed: Instant,
}

/// A fixed-capacity cache (20 items) for FinancialHealth lookups.
/// When full, the oldest (least-recently-accessed) entry is evicted.
pub struct FinancialHealthCache {
    entries: HashMap<String, CacheEntry>,
}

impl FinancialHealthCache {
    pub fn new() -> Self {
        Self {
            entries: HashMap::with_capacity(MAX_CAPACITY),
        }
    }

    /// Look up a ticker. If found, updates the timestamp and returns a clone.
    pub fn get(&mut self, ticker: &str) -> Option<FinancialHealth> {
        if let Some(entry) = self.entries.get_mut(ticker) {
            entry.last_accessed = Instant::now();
            Some(entry.data.clone())
        } else {
            None
        }
    }

    /// Insert or update an entry. If the ticker already exists, update data and
    /// timestamp. If the cache is full, evict the oldest entry first.
    pub fn insert(&mut self, ticker: String, data: FinancialHealth) {
        if self.entries.contains_key(&ticker) {
            let entry = self.entries.get_mut(&ticker).unwrap();
            entry.data = data;
            entry.last_accessed = Instant::now();
            return;
        }

        if self.entries.len() >= MAX_CAPACITY {
            // Find and remove the oldest entry.
            let oldest_key = self
                .entries
                .iter()
                .min_by_key(|(_, e)| e.last_accessed)
                .map(|(k, _)| k.clone());

            if let Some(key) = oldest_key {
                self.entries.remove(&key);
            }
        }

        self.entries.insert(
            ticker,
            CacheEntry {
                data,
                last_accessed: Instant::now(),
            },
        );
    }
}
