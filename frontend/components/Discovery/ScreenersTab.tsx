"use client";

import React, { useMemo, useState } from "react";
import type { DiscoveryItem, FinancialHealth, AnalystTrend } from "@/lib/types";
import { SCREENER_CATEGORIES, SCREENERS } from "./constants";
import type { SortField, SortDir } from "./constants";
import ResultsTable from "./ResultsTable";
import { useNotification } from "../NotificationContext";

interface ScreenersTabProps {
  activeScreener: string | null;
  loading: boolean;
  error: string | null;
  items: DiscoveryItem[];
  healthData: Record<string, FinancialHealth>;
  analystData: Record<string, AnalystTrend[]>;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  sortedItems: DiscoveryItem[];
  loadScreener: (screenerId: string) => void;
  watchlist: string[];
  setWatchlist: (fn: (prev: string[]) => string[]) => void;
  removeFromWatchlist: (ticker: string) => void;
  setSelectedWatch: (ticker: string | null) => void;
  setWatchDetailTab: (tab: "position" | "option" | "order" | "iv") => void;
  resultsRef: React.RefObject<HTMLDivElement | null>;
  tableScrollRef: React.RefObject<HTMLDivElement | null>;
}

export default function ScreenersTab({
  activeScreener,
  loading,
  error,
  items,
  healthData,
  analystData,
  sortField,
  sortDir,
  toggleSort,
  sortedItems,
  loadScreener,
  watchlist,
  setWatchlist,
  removeFromWatchlist,
  setSelectedWatch,
  setWatchDetailTab,
  resultsRef,
  tableScrollRef,
}: ScreenersTabProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set(SCREENER_CATEGORIES.map(c => c.label)));

  function toggleCategory(label: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const activeScreenerDef = SCREENERS.find((s) => s.id === activeScreener);

  const [searchFilter, setSearchFilter] = useState("");
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const { notify } = useNotification();
  const [prevScreener, setPrevScreener] = useState(activeScreener);
  if (activeScreener !== prevScreener) {
    setPrevScreener(activeScreener);
    setSearchFilter("");
    setSelectedTickers(new Set());
  }

  const filteredItems = useMemo(() => {
    if (!searchFilter) return sortedItems;
    const q = searchFilter.toLowerCase();
    return sortedItems.filter((item) =>
      item.ticker.toLowerCase().includes(q) ||
      (item.name ?? "").toLowerCase().includes(q) ||
      (healthData[item.ticker]?.name ?? "").toLowerCase().includes(q)
    );
  }, [sortedItems, searchFilter, healthData]);

  return (
    <div className="flex gap-4 flex-1 min-h-0">
      {/* Screener sidebar */}
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
          {SCREENER_CATEGORIES.map((cat) => {
            const isExpanded = expandedCategories.has(cat.label);
            return (
              <div key={cat.label}>
                <button
                  onClick={() => toggleCategory(cat.label)}
                  className="flex items-center justify-between w-full px-4 py-2 bg-[#161b22]/50 border-b border-[#21262d]/60 hover:bg-[#161b22] transition-colors"
                >
                  <span className="text-[9px] font-bold text-[#8b949e] uppercase tracking-widest">{cat.label}</span>
                  <svg className={`w-3 h-3 text-[#484f58] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                {isExpanded && cat.screeners.map((s) => {
                  const isActive = activeScreener === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => loadScreener(s.id)}
                      className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-all duration-150 border-b border-[#21262d]/40 last:border-b-0 ${
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
            );
          })}
        </div>
      </div>

      {/* Screener results */}
      <div ref={resultsRef} className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm">
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
                  <div className="flex items-center gap-2">
                    <h4 className="text-[11px] font-bold text-[#c9d1d9]">{activeScreenerDef?.label}</h4>
                    <span className="text-[10px] font-medium text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded-full tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  <p className="text-[9px] text-[#484f58]">{activeScreenerDef?.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filter ticker or name…"
                    className="w-44 text-[11px] pl-7 pr-2.5 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
                  />
                </div>
                <button
                  disabled={selectedTickers.size === 0}
                  onClick={() => {
                    const itemsToExport = filteredItems.filter((item) => selectedTickers.has(item.ticker));
                    const headers = ["Ticker", "Name", "Sector", "Price", "Change %", "Health Score"];
                    const rows = itemsToExport.map((item) => {
                      const health = healthData[item.ticker];
                      return [
                        item.ticker,
                        `"${(health?.name || item.name || "").replace(/"/g, '""')}"`,
                        health?.sector || "",
                        item.price.toFixed(2),
                        item.change_percent.toFixed(2),
                        health?.health_score?.toString() || "",
                      ].join(",");
                    });
                    const csv = [headers.join(","), ...rows].join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${activeScreenerDef?.label || "screener"}-export.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    notify(`Exported ${itemsToExport.length} ticker${itemsToExport.length > 1 ? "s" : ""} to CSV`, "success");
                  }}
                  className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:bg-[#30363d] hover:border-[#484f58] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title={selectedTickers.size > 0 ? `Export ${selectedTickers.size} selected` : "Select items to export"}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export
                  <span className={`min-w-4 h-4 inline-flex items-center justify-center rounded-full text-[9px] font-bold px-1 ${selectedTickers.size > 0 ? "bg-[#58a6ff] text-[#0d1117]" : "bg-[#21262d] text-[#484f58]"}`}>
                    {selectedTickers.size}
                  </span>
                </button>
              </div>
            </div>

            <ResultsTable
              items={filteredItems}
              healthData={healthData}
              analystData={analystData}
              scrollRef={tableScrollRef}
              showRank={true}
              sortField={sortField}
              sortDir={sortDir}
              toggleSort={toggleSort}
              watchlist={watchlist}
              setWatchlist={setWatchlist}
              removeFromWatchlist={removeFromWatchlist}
              setSelectedWatch={setSelectedWatch}
              setWatchDetailTab={setWatchDetailTab}
              selectedTickers={selectedTickers}
              setSelectedTickers={setSelectedTickers}
            />
          </>
        )}
      </div>
    </div>
  );
}
