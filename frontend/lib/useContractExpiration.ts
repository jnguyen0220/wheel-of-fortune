"use client";

import { useEffect, useRef, useCallback } from "react";
import type { OptionsOrder, PositionTransaction } from "./types";
import { getMarketData } from "./api";
import { useLocalStorageState } from "./hooks";

/**
 * Top-level hook that monitors open contracts for expiration and auto-closes
 * or auto-assigns them based on current market data.
 *
 * Runs:
 * - Immediately on mount
 * - Every 5 minutes via setInterval
 * - On window focus / visibility change (user returns to tab)
 *
 * This ensures contracts are processed even if the user navigates away from
 * the Discovery tab or closes the browser and comes back later.
 */
export function useContractExpiration() {
  const [orders, setOrders] = useLocalStorageState<OptionsOrder[]>("wof-orders", []);
  const [, setPositions] = useLocalStorageState<Record<string, PositionTransaction[]>>("wof-positions", {});
  const isRunning = useRef(false);

  const processExpiredOrders = useCallback(async () => {
    // Prevent concurrent runs
    if (isRunning.current) return;

    const now = Date.now();
    const openOrders = orders.filter(o => o.status === "open");
    if (openOrders.length === 0) return;

    // Find expired orders (expiration date + market close at 16:00 ET has passed)
    const expiredOrders = openOrders.filter(o => {
      const expiry = new Date(o.expiration + "T16:00:00").getTime();
      return expiry <= now;
    });

    if (expiredOrders.length === 0) return;

    isRunning.current = true;

    try {
      // Fetch current market data for all tickers with expired orders
      const tickers = [...new Set(expiredOrders.map(o => o.ticker))];
      const marketData = await getMarketData(tickers);

      const newPositions: Record<string, PositionTransaction[]> = {};
      const updatedOrderIds = new Set<string>();
      const closedOrders: Record<string, "closed"> = {};

      for (const order of expiredOrders) {
        const md = marketData[order.ticker];
        if (!md || md.price <= 0) continue; // Skip if no market data

        const price = md.price;
        const itm = order.option_type === "CALL"
          ? price > order.strike
          : price < order.strike;

        updatedOrderIds.add(order.id);
        closedOrders[order.id] = "closed";

        if (itm) {
          // ITM assignment: CSP → buy shares at strike, CC → sell shares at strike
          const txn: PositionTransaction = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            type: order.option_type === "PUT" ? "buy" : "sell",
            date: order.expiration,
            quantity: order.contracts * 100,
            price: order.strike,
          };
          if (!newPositions[order.ticker]) {
            newPositions[order.ticker] = [];
          }
          newPositions[order.ticker].push(txn);
        }
        // OTM: just mark as closed (no assignment)
      }

      if (updatedOrderIds.size === 0) return;

      // Update orders
      setOrders(prev =>
        prev.map(o =>
          updatedOrderIds.has(o.id)
            ? { ...o, status: "closed" as const }
            : o
        )
      );

      // Update positions for ITM assignments
      if (Object.keys(newPositions).length > 0) {
        setPositions(prev => {
          const next = { ...prev };
          for (const [ticker, txns] of Object.entries(newPositions)) {
            next[ticker] = [...(next[ticker] || []), ...txns];
          }
          return next;
        });
      }
    } catch (err) {
      // Silently handle errors — will retry on next cycle
      console.warn("[ContractExpiration] Failed to process expired orders:", err);
    } finally {
      isRunning.current = false;
    }
  }, [orders, setOrders, setPositions]);

  // Use ref pattern to always have the latest callback without recreating timers
  const processRef = useRef(processExpiredOrders);
  processRef.current = processExpiredOrders;

  useEffect(() => {
    // Run immediately on mount
    processRef.current();

    // Run every 5 minutes
    const interval = setInterval(() => processRef.current(), 5 * 60 * 1000);

    // Run on visibility change (user returns to tab) and window focus
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        processRef.current();
      }
    };
    const onFocus = () => processRef.current();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
}
