"use client";

import { useCallback, useRef, useMemo, useSyncExternalStore } from "react";

/**
 * Custom hook for state synced to localStorage.
 * Uses useSyncExternalStore for reliable cross-instance synchronization.
 * - localStorage is the single source of truth
 * - All hook instances sharing a key stay in sync automatically
 * - Works across tabs (native storage event) and within the same tab (custom event)
 */
export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
): [T, (valueOrUpdater: T | ((prev: T) => T)) => void] {
  const initialRef = useRef(initialValue);
  const fallback = useMemo(() => JSON.stringify(initialRef.current), []);

  const getSnapshot = useCallback(
    () => localStorage.getItem(key) ?? fallback,
    [key, fallback],
  );

  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // Cross-tab: native storage event
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) onStoreChange();
      };
      // Same-tab: custom event dispatched by setState below
      const onLocal = (e: Event) => {
        if ((e as CustomEvent).detail?.key === key) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener("local-storage-update", onLocal);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("local-storage-update", onLocal);
      };
    },
    [key],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const state: T = useMemo(() => JSON.parse(snapshot), [snapshot]);

  const setState = useCallback(
    (valueOrUpdater: T | ((prev: T) => T)) => {
      const currentStr = localStorage.getItem(key);
      const current: T = currentStr ? JSON.parse(currentStr) : initialRef.current;
      const next =
        typeof valueOrUpdater === "function"
          ? (valueOrUpdater as (prev: T) => T)(current)
          : valueOrUpdater;
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent("local-storage-update", { detail: { key } }),
      );
    },
    [key],
  );

  return [state, setState];
}
