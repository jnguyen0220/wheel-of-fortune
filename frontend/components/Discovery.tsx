"use client";

import { useState, useEffect, useRef } from "react";
import type { DiscoveryItem, FinancialHealth } from "@/lib/types";
import { getDiscovery, getBatchData, prefetchDiscovery } from "@/lib/api";
import { healthScoreColor } from "@/lib/format";
import TickerLink from "./TickerLink";

type SortField = "rank" | "ticker" | "price" | "health";
type SortDir = "asc" | "desc";

interface DiscoveryProps {
  existingTickers?: string[];
  onAddTicker?: (ticker: string) => void;
  onRemoveTicker?: (ticker: string) => void;
}

interface ScreenerDef {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const SCREENERS: ScreenerDef[] = [
  { id: "most_actives", label: "Most Active", description: "Highest volume today", icon: "📊" },
  { id: "day_gainers", label: "Day Gainers", description: "Biggest gains today", icon: "📈" },
  { id: "day_losers", label: "Day Losers", description: "Biggest losses today", icon: "📉" },
  { id: "most_shorted_stocks", label: "Most Shorted", description: "Highest short interest", icon: "🎯" },
  { id: "undervalued_large_caps", label: "Undervalued Large Caps", description: "Below intrinsic value", icon: "💎" },
  { id: "undervalued_growth_stocks", label: "Undervalued Growth", description: "Growth at a discount", icon: "🌱" },
  { id: "growth_technology_stocks", label: "Growth Tech", description: "Strong tech growth", icon: "🚀" },
  { id: "aggressive_small_caps", label: "Aggressive Small Caps", description: "High growth potential", icon: "⚡" },
  { id: "small_cap_gainers", label: "Small Cap Gainers", description: "Small caps gaining", icon: "🔥" },
  { id: "conservative_foreign_funds", label: "Conservative Foreign", description: "Low-risk international", icon: "🌍" },
  { id: "high_yield_bond", label: "High Yield Bonds", description: "Above-average yields", icon: "💰" },
  { id: "portfolio_anchors", label: "Portfolio Anchors", description: "Stable foundation", icon: "⚓" },
  { id: "solid_large_growth_funds", label: "Large Growth Funds", description: "Top-rated large growth", icon: "🏦" },
  { id: "solid_midcap_growth_funds", label: "Midcap Growth Funds", description: "Top-rated midcap", icon: "📦" },
  { id: "top_mutual_funds", label: "Top Mutual Funds", description: "Highest-rated overall", icon: "🏆" },
];

export default function Discovery({ existingTickers = [], onAddTicker, onRemoveTicker }: DiscoveryProps) {
  const [activeScreener, setActiveScreener] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<Record<string, FinancialHealth>>({});
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const prefetched = useRef(false);

  // Prefetch all screeners on first mount
  useEffect(() => {
    if (prefetched.current) return;
    prefetched.current = true;
    prefetchDiscovery().catch(() => { /* best effort */ });
  }, []);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  }

  async function loadScreener(screenerId: string) {
    setActiveScreener(screenerId);
    setLoading(true);
    setError(null);
    setItems([]);
    setHealthData({});
    setSortField("rank");
    setSortDir("asc");
    setPage(0);
    try {
      const results = await getDiscovery(screenerId);
      setItems(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load screener");
    } finally {
      setLoading(false);
    }
  }

  // Fetch health data when items change
  useEffect(() => {
    if (items.length === 0) return;
    const tickers = items.map((i) => i.ticker);
    getBatchData(tickers)
      .then((batch) => setHealthData(batch.financials))
      .catch(() => { /* supplementary */ });
  }, [items]);

  const sortedItems = [...items].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "rank":
        cmp = a.rank - b.rank;
        break;
      case "ticker":
        cmp = a.ticker.localeCompare(b.ticker);
        break;
      case "price":
        cmp = a.price - b.price;
        break;
      case "health":
        cmp = (healthData[a.ticker]?.health_score ?? -1) - (healthData[b.ticker]?.health_score ?? -1);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sortedItems.length / PAGE_SIZE);
  const paginatedItems = sortedItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const activeScreenerDef = SCREENERS.find((s) => s.id === activeScreener);
  const existingSet = new Set(existingTickers.map(t => t.toUpperCase()));

  return (
    <div className="flex gap-4 min-h-[480px]">
      {/* Left panel: screener list */}
      <div className="w-[260px] shrink-0 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#30363d]">
          <svg className="w-4 h-4 text-[#58a6ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
          <div>
            <h3 className="text-[11px] font-bold text-[#c9d1d9] uppercase tracking-wide">Screeners</h3>
            <p className="text-[9px] text-[#484f58]">{SCREENERS.length} available</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {SCREENERS.map((s) => {
            const isActive = activeScreener === s.id;
            return (
              <div
                key={s.id}
                onClick={() => loadScreener(s.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-all duration-150 border-b border-[#21262d]/60 last:border-b-0 ${
                  isActive
                    ? "bg-[#161b22] border-l-[3px] border-l-[#58a6ff] pl-[13px]"
                    : "hover:bg-[#161b22]/50 border-l-[3px] border-l-transparent"
                }`}
              >
                <span className="text-sm leading-none">{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className={`text-[11px] font-semibold block truncate ${isActive ? "text-[#58a6ff]" : "text-[#c9d1d9]"}`}>
                    {s.label}
                  </span>
                  <span className="text-[9px] text-[#484f58] block truncate">{s.description}</span>
                </div>
                {isActive && (
                  <svg className="w-3 h-3 text-[#58a6ff] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel: screener results */}
      <div className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm">
        {!activeScreener ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-[#8b949e]">Select a screener</p>
              <p className="text-[10px] text-[#484f58] mt-0.5">Choose from the panel on the left to explore stocks</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <div className="w-10 h-10 rounded-full border-2 border-[#30363d] border-t-[#58a6ff] animate-spin" />
            <p className="text-xs text-[#8b949e] font-medium">Loading {activeScreenerDef?.label}…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-16">
            <div className="w-10 h-10 rounded-full bg-[#f8514915] border border-[#f8514930] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#f85149]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <p className="text-xs text-[#f85149] font-medium">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-16">
            <p className="text-xs text-[#484f58]">No results for this screener.</p>
          </div>
        ) : (
          <>
            {/* Results header */}
            <div className="px-4 py-3 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-sm">{activeScreenerDef?.icon}</span>
                <div>
                  <h4 className="text-[11px] font-bold text-[#c9d1d9]">{activeScreenerDef?.label}</h4>
                  <p className="text-[9px] text-[#484f58]">{activeScreenerDef?.description}</p>
                </div>
              </div>
              <span className="text-[10px] font-medium text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded-full">
                {items.length} stocks
              </span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#161b22] z-10">
                  <tr className="border-b border-[#30363d]">
                    <th className="px-3 py-2.5 w-9">
                      <svg className="w-3.5 h-3.5 text-[#484f58] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </th>
                    <th
                      className="px-2 py-2.5 text-center th w-10 cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                      onClick={() => toggleSort("rank")}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        #
                        {sortField === "rank" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </span>
                    </th>
                    <th
                      className="px-3 py-2.5 text-left th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                      onClick={() => toggleSort("ticker")}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        Ticker
                        {sortField === "ticker" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-left th">Company</th>
                    <th className="px-3 py-2.5 text-left th">Sector</th>
                    <th
                      className="px-3 py-2.5 text-right th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                      onClick={() => toggleSort("price")}
                    >
                      <span className="inline-flex items-center justify-end gap-0.5">
                        Price
                        {sortField === "price" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </span>
                    </th>
                    <th
                      className="px-3 py-2.5 text-right th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                      onClick={() => toggleSort("health")}
                    >
                      <span className="inline-flex items-center justify-end gap-0.5">
                        Health
                        {sortField === "health" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right th">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item, idx) => {
                    const isLast = idx === paginatedItems.length - 1;
                    const rowBorder = isLast ? "" : "border-b border-[#21262d]/60";
                    const health = healthData[item.ticker];
                    const inPortfolio = existingSet.has(item.ticker.toUpperCase());
                    return (
                      <tr key={item.ticker} className={`group transition-colors duration-100 ${inPortfolio ? "bg-[#3fb95008]" : "hover:bg-[#161b22]"}`}>
                        <td className={`px-3 py-2.5 text-center ${rowBorder}`}>
                          <input
                            type="checkbox"
                            checked={inPortfolio}
                            onChange={() => {
                              if (inPortfolio) {
                                onRemoveTicker?.(item.ticker);
                              } else {
                                onAddTicker?.(item.ticker);
                              }
                            }}
                            className="rounded border-[#30363d] bg-[#0d1117] text-[#3fb950] focus:ring-[#3fb950] focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                          />
                        </td>
                        <td className={`px-2 py-2.5 text-center tabular-nums text-[#484f58] text-[10px] ${rowBorder}`}>
                          {item.rank}
                        </td>
                        <td className={`px-3 py-2.5 ${rowBorder}`}>
                          <TickerLink ticker={item.ticker} className="font-bold text-[11px] text-[#58a6ff] tracking-wide uppercase hover:underline cursor-pointer" />
                        </td>
                        <td className={`px-3 py-2.5 ${rowBorder}`}>
                          <span className="text-[10px] text-[#8b949e] truncate max-w-[150px] block leading-tight">
                            {health?.name || item.name || "—"}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 ${rowBorder}`}>
                          {health?.sector ? (
                            <span className="text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                              {health.sector}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#484f58]">—</span>
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold text-[#c9d1d9] ${rowBorder}`}>
                          ${item.price.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                          {health ? (
                            <div className="inline-flex items-center gap-1.5">
                              <div className="w-6 h-1 rounded-full bg-[#21262d] overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${health.health_score}%`,
                                    backgroundColor: health.health_score >= 70 ? '#3fb950' : health.health_score >= 40 ? '#d29922' : '#f85149',
                                  }}
                                />
                              </div>
                              <span className={`text-[10px] font-bold tabular-nums ${healthScoreColor(health.health_score)}`}>
                                {health.health_score}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#484f58] text-[10px]">—</span>
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                          <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                            item.change_percent >= 0
                              ? "text-[#3fb950] bg-[#3fb95010]"
                              : "text-[#f85149] bg-[#f8514910]"
                          }`}>
                            {item.change_percent >= 0 ? "+" : ""}{item.change_percent.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#30363d] bg-[#161b22]">
                <span className="text-[10px] text-[#484f58] tabular-nums">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedItems.length)} of {sortedItems.length}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <span className="text-[10px] text-[#8b949e] tabular-nums px-2 font-medium">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
