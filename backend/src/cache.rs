use std::collections::{BTreeMap, HashMap};
use std::time::{Duration, Instant};

/// A generic fixed-capacity TTL cache with O(log n) LRU eviction.
///
/// - Entries expire after `ttl` and are treated as missing on lookup.
/// - When full, the least-recently-accessed entry is evicted in O(log n)
///   using a BTreeMap ordered by access time.
pub struct TtlCache<V> {
    entries: HashMap<String, CacheEntry<V>>,
    /// Maps (last_accessed, key) for O(log n) LRU eviction.
    access_order: BTreeMap<(Instant, String), ()>,
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
            access_order: BTreeMap::new(),
            max_capacity,
            ttl,
        }
    }

    /// Look up a key without mutating the cache. Returns `None` if missing or expired.
    /// Suitable for use under a read lock.
    pub fn peek(&self, key: &str) -> Option<V> {
        let now = Instant::now();
        if let Some(entry) = self.entries.get(key) {
            if now.duration_since(entry.inserted_at) > self.ttl {
                return None;
            }
            Some(entry.data.clone())
        } else {
            None
        }
    }

    /// Look up a key. Returns `None` if missing or expired.
    /// Updates last_accessed for LRU eviction.
    pub fn get(&mut self, key: &str) -> Option<V> {
        let now = Instant::now();
        if let Some(entry) = self.entries.get_mut(key) {
            if now.duration_since(entry.inserted_at) > self.ttl {
                self.access_order.remove(&(entry.last_accessed, key.to_string()));
                self.entries.remove(key);
                return None;
            }
            // Update access order index
            self.access_order.remove(&(entry.last_accessed, key.to_string()));
            entry.last_accessed = now;
            self.access_order.insert((now, key.to_string()), ());
            Some(entry.data.clone())
        } else {
            None
        }
    }

    /// Insert or update an entry. Evicts expired and oldest entries if at capacity.
    pub fn insert(&mut self, key: String, data: V) {
        let now = Instant::now();

        if let Some(entry) = self.entries.get_mut(&key) {
            self.access_order.remove(&(entry.last_accessed, key.clone()));
            entry.data = data;
            entry.last_accessed = now;
            entry.inserted_at = now;
            self.access_order.insert((now, key), ());
            return;
        }

        // Evict expired entries first.
        let expired_keys: Vec<String> = self.entries
            .iter()
            .filter(|(_, e)| now.duration_since(e.inserted_at) > self.ttl)
            .map(|(k, _)| k.clone())
            .collect();
        for k in expired_keys {
            if let Some(e) = self.entries.remove(&k) {
                self.access_order.remove(&(e.last_accessed, k));
            }
        }

        // Evict LRU entry if still at capacity (O(log n) via BTreeMap).
        if self.entries.len() >= self.max_capacity {
            if let Some(((_, oldest_key), _)) = self.access_order.iter().next().map(|(k, v)| (k.clone(), v)) {
                self.entries.remove(&oldest_key);
                self.access_order.remove(&(self.access_order.keys().next().unwrap().0, oldest_key));
            }
        }

        self.access_order.insert((now, key.clone()), ());
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
