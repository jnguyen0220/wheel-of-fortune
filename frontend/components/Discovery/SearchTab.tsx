"use client";

import React from "react";
import type { DiscoveryItem, FinancialHealth, AnalystTrend } from "@/lib/types";
import type { SortField, SortDir } from "./constants";
import ResultsTable from "./ResultsTable";

interface SearchTabProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: { symbol: string; name: string }[];
  searchLoading: boolean;
  searchAsItems: DiscoveryItem[];
  searchHealthData: Record<string, FinancialHealth>;
  searchAnalystData: Record<string, AnalystTrend[]>;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  watchlist: string[];
  setWatchlist: (fn: (prev: string[]) => string[]) => void;
  removeFromWatchlist: (ticker: string) => void;
  setSelectedWatch: (ticker: string | null) => void;
  setWatchDetailTab: (tab: "position" | "option" | "order" | "iv") => void;
  tableScrollRef: React.RefObject<HTMLDivElement | null>;
}

export default function SearchTab({
  searchQuery,
  setSearchQuery,
  searchResults,
  searchLoading,
  searchAsItems,
  searchHealthData,
  searchAnalystData,
  sortField,
  sortDir,
  toggleSort,
  watchlist,
  setWatchlist,
  removeFromWatchlist,
  setSelectedWatch,
  setWatchDetailTab,
  tableScrollRef,
}: SearchTabProps) {
  return (
    <div className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm min-h-0">
      {/* Search input bar */}
      <div className="px-4 py-3 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#30363d] flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <svg className="w-3.5 h-3.5 text-[#484f58] absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticker or company name…"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md pl-9 pr-8 py-1.5 text-[11px] text-[#c9d1d9] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] transition"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#c9d1d9] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <span className="text-[10px] font-medium text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded-full">
            {searchResults.length} results
          </span>
        )}
      </div>

      {/* Search results */}
      {searchLoading ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
          <div className="w-10 h-10 rounded-full border-2 border-[#30363d] border-t-[#58a6ff] animate-spin" />
          <p className="text-xs text-[#8b949e] font-medium">Searching…</p>
        </div>
      ) : !searchQuery.trim() ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
          <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
            <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-[#8b949e]">Search for a stock</p>
            <p className="text-[10px] text-[#484f58] mt-0.5">Enter a ticker symbol or company name</p>
          </div>
        </div>
      ) : searchResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 py-16">
          <p className="text-xs text-[#484f58]">No results found for &ldquo;{searchQuery}&rdquo;</p>
        </div>
      ) : (
        <ResultsTable
          items={searchAsItems}
          healthData={searchHealthData}
          analystData={searchAnalystData}
          scrollRef={tableScrollRef}
          showRank={false}
          sortField={sortField}
          sortDir={sortDir}
          toggleSort={toggleSort}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          removeFromWatchlist={removeFromWatchlist}
          setSelectedWatch={setSelectedWatch}
          setWatchDetailTab={setWatchDetailTab}
        />
      )}
    </div>
  );
}
