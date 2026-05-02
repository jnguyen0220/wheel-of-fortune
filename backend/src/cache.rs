use std::collections::HashMap;
use std::time::{Duration, Instant};

/// A generic fixed-capacity TTL cache.
///
/// - Entries expire after `ttl` and are treated as missing on lookup.
/// - When full, the oldest (least-recently-accessed) entry is evicted.
pub struct TtlCache<V> {
    entries: HashMap<String, CacheEntry<V>>,
    max_capacity: usize,
    ttl: Duration,
}

struct CacheEntry<V> {
    data: V,
    last_accessed: Instant,
    inserted_at: Instant,
}

impl<V: Clone> TtlCache<V> {
    pub fn new(max_capacity: usize, ttl: Duration) -> Self {
        Self {
            entries: HashMap::with_capacity(max_capacity),
            max_capacity,
            ttl,
        }
    }

    /// Look up a key. Returns `None` if missing or expired.
    pub fn get(&mut self, key: &str) -> Option<V> {
        let now = Instant::now();
        if let Some(entry) = self.entries.get_mut(key) {
            if now.duration_since(entry.inserted_at) > self.ttl {
                self.entries.remove(key);
                return None;
            }
            entry.last_accessed = now;
            Some(entry.data.clone())
        } else {
            None
        }
    }

    /// Insert or update an entry. Evicts expired and oldest entries if at capacity.
    pub fn insert(&mut self, key: String, data: V) {
        let now = Instant::now();

        if self.entries.contains_key(&key) {
            let entry = self.entries.get_mut(&key).unwrap();
            entry.data = data;
            entry.last_accessed = now;
            entry.inserted_at = now;
            return;
        }

        // Evict expired entries first.
        self.entries.retain(|_, e| now.duration_since(e.inserted_at) <= self.ttl);

        if self.entries.len() >= self.max_capacity {
            let oldest_key = self
                .entries
                .iter()
                .min_by_key(|(_, e)| e.last_accessed)
                .map(|(k, _)| k.clone());

            if let Some(k) = oldest_key {
                self.entries.remove(&k);
            }
        }

        self.entries.insert(
            key,
            CacheEntry {
                data,
                last_accessed: now,
                inserted_at: now,
            },
        );
    }

    /// Return all non-expired entries as (key, value) pairs.
    pub fn entries(&self) -> Vec<(String, V)> {
        let now = Instant::now();
        self.entries
            .iter()
            .filter(|(_, e)| now.duration_since(e.inserted_at) <= self.ttl)
            .map(|(k, e)| (k.clone(), e.data.clone()))
            .collect()
    }
}
