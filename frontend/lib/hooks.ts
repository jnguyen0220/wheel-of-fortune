"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Custom hook for state synced to localStorage.
 * - Loads initial value from localStorage on mount
 * - Persists changes to localStorage
 * - Syncs across tabs via storage event
 * - Re-reads on window focus / visibility change (for same-tab updates)
 */
export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
): [T, (valueOrUpdater: T | ((prev: T) => T)) => void] {
  const [state, setStateInner] = useState<T>(initialValue);
  const loaded = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const saved = localStorage.getItem(key);
      if (saved) setStateInner(JSON.parse(saved));
    } catch {}
  }, [key]);

  // Listen for cross-tab storage events
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try { setStateInner(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  // Re-read on focus / visibility change (same-tab updates)
  useEffect(() => {
    const onFocus = () => {
      try {
        const saved = localStorage.getItem(key);
        if (saved) setStateInner(JSON.parse(saved));
      } catch {}
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [key]);

  const setState = useCallback(
    (valueOrUpdater: T | ((prev: T) => T)) => {
      setStateInner((prev) => {
        const next = typeof valueOrUpdater === "function"
          ? (valueOrUpdater as (prev: T) => T)(prev)
          : valueOrUpdater;
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key],
  );

  return [state, setState];
}
