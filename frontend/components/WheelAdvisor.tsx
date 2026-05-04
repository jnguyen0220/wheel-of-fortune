"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AnalystTrend,
  EarningsCalendar,
  EarningsResult,
  OptionsChain,
  StockHolding,
  WheelRecommendation,
} from "@/lib/types";
import {
  getInventory,
  getOptionsChains,
  getRecommendations,
} from "@/lib/api";
import InventoryForm from "./InventoryForm";
import Recommendations from "./Recommendations";
import OptionsTab from "./OptionsTab";
import { HealthPopupProvider } from "./HealthPopupContext";
import type { StrategyFilters } from "./OptionsTab";

export default function WheelAdvisor() {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [recommendations, setRecommendations] = useState<WheelRecommendation[]>([]);
  const [earningsCalendar, setEarningsCalendar] = useState<Record<string, EarningsCalendar[]>>({});
  const [earningsHistory, setEarningsHistory] = useState<Record<string, EarningsResult[]>>({});
  const [analystTrends, setAnalystTrends] = useState<Record<string, AnalystTrend[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickersWithoutOptions, setTickersWithoutOptions] = useState<string[]>([]);
  const [optionsChains, setOptionsChains] = useState<OptionsChain[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"inventory" | "options">(
    "inventory",
  );
  const [optionsSubTab, setOptionsSubTab] = useState<"chains" | "recommendations">("chains");

  const refreshInventory = useCallback(async () => {
    try {
      const inv = await getInventory();
      setHoldings(inv.holdings);
    } catch (err) {
      console.error("Failed to refresh inventory:", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshInventory();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshInventory]);

  async function fetchOptionChains() {
    const tickers = [...new Set(holdings.map((h) => h.ticker))].sort();
    if (tickers.length === 0) {
      setError("Add tickers first.");
      return;
    }
    setOptionsLoading(true);
    setError(null);
    try {
      const chains = await getOptionsChains(tickers);
      setOptionsChains(chains);
      setOptionsLoaded(true);
      setActiveTab("options");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch option chains",
      );
    } finally {
      setOptionsLoading(false);
    }
  }

  async function runRecommendations(availableCash: number, filters: StrategyFilters) {
    const tickers = [...new Set(holdings.map((h) => h.ticker))].sort();
    if (tickers.length === 0) {
      setError("Add tickers first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getRecommendations({
        inventory: { holdings },
        tickers,
        available_cash: availableCash > 0 ? availableCash : undefined,
        chains: optionsChains.length > 0 ? optionsChains : undefined,
        dte_min: filters.dte_min,
        dte_max: filters.dte_max,
        // Flatten earnings calendar and analyst trends
        earnings_calendar: Object.values(earningsCalendar).flat().length > 0
          ? Object.values(earningsCalendar).flat()
          : undefined,
        analyst_trends: Object.values(analystTrends).flat().length > 0
          ? Object.values(analystTrends).flat()
          : undefined,
        // Strategy filters
        min_open_interest: filters.min_open_interest,
        cc_max_assignment_pct: filters.cc_max_assignment_pct / 100,
        csp_max_assignment_pct: filters.csp_max_assignment_pct / 100,
        min_annualised_roc: filters.min_annualised_roc,
        max_annualised_roc: filters.max_annualised_roc,
      });
      setRecommendations(result.recommendations ?? []);
      setTickersWithoutOptions(result.tickers_without_options ?? []);
      setActiveTab("options");
      setOptionsSubTab("recommendations");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch recommendations",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <HealthPopupProvider>
    <div className="min-h-screen bg-[#0d1117]">
      {/* Header */}
      <header className="bg-[#161b22] border-b border-[#30363d] sticky top-0 z-20 shadow-sm shadow-black/20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-[#3fb950] rounded flex items-center justify-center">
            <svg className="w-4 h-4 text-[#0d1117]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#c9d1d9]">Wheel Advisor</h1>
            <p className="text-[10px] text-[#8b949e]">Options income strategy</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 pt-4">
        {/* Tab nav */}
        <div className="flex items-center gap-3 mb-4">
          <div className="tab-group">
            {(
              [
                { key: "inventory", label: "Portfolio" },
                { key: "options", label: "Trade Desk" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                disabled={key === "options" && !optionsLoaded}
                className={`tab-btn ${
                  activeTab === key
                    ? "bg-[#30363d] text-[#c9d1d9]"
                    : "text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 disabled:cursor-not-allowed"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {key === "inventory" ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                    </svg>
                  )}
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="pb-12">
          <div className={activeTab === "inventory" ? "" : "hidden"}>
            {error && (
              <p className="mb-4 text-[#f85149] text-xs font-medium bg-[#f8514915] px-3 py-1.5 rounded border border-[#f8514930]">{error}</p>
            )}

            <InventoryForm
              holdings={holdings}
              onChanged={refreshInventory}
              onGenerate={fetchOptionChains}
              generating={optionsLoading}
              onEarningsLoaded={(cal, hist) => { setEarningsCalendar(cal); setEarningsHistory(hist); }}
              onAnalystTrendsLoaded={setAnalystTrends}
            />
          </div>

          <div className={activeTab === "options" ? "" : "hidden"}>
            {/* Sub-tab navigation */}
            <div className="flex items-center gap-3 mb-4">
              <div className="tab-group">
                {([
                  { key: "chains" as const, label: "Option Chains" },
                  { key: "recommendations" as const, label: "Recommendations" },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setOptionsSubTab(key)}
                    className={`tab-btn ${
                      optionsSubTab === key
                        ? "bg-[#30363d] text-[#c9d1d9]"
                        : "text-[#8b949e] hover:text-[#c9d1d9]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {optionsSubTab === "recommendations" && tickersWithoutOptions.length > 0 && (
                <div className="ml-auto flex items-center gap-1.5 text-[#d29922] text-[10px] font-medium">
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <span>No options chain:</span>
                  <span className="flex flex-wrap gap-1">
                    {tickersWithoutOptions.map((t) => (
                      <span key={t} className="bg-[#d2992215] border border-[#d2992240] px-1.5 py-0.5 rounded font-bold">{t}</span>
                    ))}
                  </span>
                </div>
              )}
            </div>

            {/* Sub-tab content */}
            <div className={optionsSubTab === "chains" ? "" : "hidden"}>
              <OptionsTab
                chains={optionsChains}
                earningsCalendar={earningsCalendar}
              />
            </div>
            <div className={optionsSubTab === "recommendations" ? "" : "hidden"}>
              <Recommendations
                recommendations={recommendations}
                earningsCalendar={earningsCalendar}
                earningsHistory={earningsHistory}
                analystTrends={analystTrends}
                onRecommendations={runRecommendations}
                recommendationsLoading={loading}
                hasShares={holdings.reduce((sum, h) => sum + h.shares, 0) > 0}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    </HealthPopupProvider>
  );
}
