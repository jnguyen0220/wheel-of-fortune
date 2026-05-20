"use client";

import React, { useState } from "react";
import type { DiscoveryItem, FinancialHealth, AnalystTrend } from "@/lib/types";
import { SCREENER_CATEGORIES, SCREENERS } from "./constants";
import type { SortField, SortDir } from "./constants";
import ResultsTable from "./ResultsTable";

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
  paginatedItems: DiscoveryItem[];
  totalPages: number;
  page: number;
  setPage: (p: number | ((prev: number) => number)) => void;
  sortedItemsLength: number;
  PAGE_SIZE: number;
  loadScreener: (screenerId: string) => void;
  watchlist: string[];
  setWatchlist: (fn: (prev: string[]) => string[]) => void;
  removeFromWatchlist: (ticker: string) => void;
  setSelectedWatch: (ticker: string | null) => void;
  setWatchDetailTab: (tab: "position" | "option" | "order" | "technicals") => void;
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
  paginatedItems,
  totalPages,
  page,
  setPage,
  sortedItemsLength,
  PAGE_SIZE,
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
                  <h4 className="text-[11px] font-bold text-[#c9d1d9]">{activeScreenerDef?.label}</h4>
                  <p className="text-[9px] text-[#484f58]">{activeScreenerDef?.description}</p>
                </div>
              </div>
              <span className="text-[10px] font-medium text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded-full">
                {items.length} stocks
              </span>
            </div>

            <ResultsTable
              items={paginatedItems}
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
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#30363d] bg-[#161b22]">
                <span className="text-[10px] text-[#484f58] tabular-nums">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedItemsLength)} of {sortedItemsLength}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => { setPage((p: number) => Math.max(0, p - 1)); tableScrollRef.current?.scrollTo({ top: 0 }); }}
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
                    onClick={() => { setPage((p: number) => Math.min(totalPages - 1, p + 1)); tableScrollRef.current?.scrollTo({ top: 0 }); }}
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
