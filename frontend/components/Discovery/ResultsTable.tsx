"use client";

import React from "react";
import type { DiscoveryItem, FinancialHealth, AnalystTrend } from "@/lib/types";
import { healthScoreColor, analystConsensus } from "@/lib/format";
import TickerLink from "../TickerLink";
import type { SortField, SortDir } from "./constants";

interface ResultsTableProps {
  items: DiscoveryItem[];
  healthData: Record<string, FinancialHealth>;
  analystData: Record<string, AnalystTrend[]>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showRank: boolean;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  watchlist: string[];
  setWatchlist: (fn: (prev: string[]) => string[]) => void;
  removeFromWatchlist: (ticker: string) => void;
  setSelectedWatch: (ticker: string | null) => void;
  setWatchDetailTab: (tab: "position" | "option" | "order" | "technicals") => void;
}

function renderRatingCell(item: DiscoveryItem, currentAnalystData: Record<string, AnalystTrend[]>) {
  const trends = currentAnalystData[item.ticker];
  const cur = trends?.find(t => t.period === "0m") || trends?.[0];
  const ac = analystConsensus(cur);
  if (ac.total === 0) return <span className="text-[10px] text-[#484f58]">—</span>;
  const bgColor = ac.score >= 4.5 ? "bg-[#3fb95010]"
    : ac.score >= 3.5 ? "bg-[#58a6ff10]"
    : ac.score >= 2.5 ? "bg-[#d2992210]"
    : "bg-[#f8514910]";
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${ac.color} ${bgColor}`} title={`${ac.score.toFixed(1)} - ${ac.label}`}>
      {ac.label}
    </span>
  );
}

export default function ResultsTable({
  items,
  healthData,
  analystData,
  scrollRef,
  showRank,
  sortField,
  sortDir,
  toggleSort,
  watchlist,
  setWatchlist,
  removeFromWatchlist,
  setSelectedWatch,
  setWatchDetailTab,
}: ResultsTableProps) {
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-[#161b22] z-10">
          <tr className="border-b border-[#30363d]">
            <th className="px-3 py-2.5 w-9">
              <svg className="w-3.5 h-3.5 text-[#d29922] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </th>
            {showRank && (
              <th
                className="px-2 py-2.5 text-center th w-10 cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                onClick={() => toggleSort("rank")}
              >
                <span className="inline-flex items-center gap-0.5">
                  #
                  {sortField === "rank" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </span>
              </th>
            )}
            <th
              className="px-3 py-2.5 text-left th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
              onClick={() => toggleSort("ticker")}
            >
              <span className="inline-flex items-center gap-0.5">
                Ticker
                {sortField === "ticker" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </span>
            </th>
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
            <th
              className="px-3 py-2.5 text-center th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
              onClick={() => toggleSort("rating")}
            >
              <span className="inline-flex items-center justify-center gap-0.5">
                Rating
                {sortField === "rating" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </span>
            </th>
            <th className="px-2 py-2.5 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            const rowBorder = isLast ? "" : "border-b border-[#21262d]/60";
            const health = healthData[item.ticker];
            const inWatchlist = watchlist.includes(item.ticker.toUpperCase());
            return (
              <tr key={`${item.ticker}-${item.rank}`} className={`group transition-colors duration-100 ${inWatchlist ? "bg-[#d2992208]" : "hover:bg-[#161b22]"}`}>
                <td className={`px-3 py-2.5 text-center ${rowBorder}`}>
                  <input
                    type="checkbox"
                    checked={inWatchlist}
                    onChange={() => {
                      if (inWatchlist) {
                        removeFromWatchlist(item.ticker.toUpperCase());
                      } else {
                        const t = item.ticker.trim().toUpperCase();
                        if (t) setWatchlist((prev) => prev.includes(t) ? prev : [...prev, t]);
                      }
                    }}
                    className="rounded border-[#30363d] bg-[#0d1117] text-[#d29922] focus:ring-[#d29922] focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                  />
                </td>
                {showRank && (
                  <td className={`px-2 py-2.5 text-center tabular-nums text-[#484f58] text-[10px] ${rowBorder}`}>
                    {item.rank}
                  </td>
                )}
                <td className={`px-3 py-2.5 ${rowBorder}`}>
                  <TickerLink ticker={item.ticker} className="font-bold text-[11px] text-[#58a6ff] tracking-wide uppercase hover:underline cursor-pointer" />
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
                <td className={`px-3 py-2.5 text-center ${rowBorder}`}>
                  {renderRatingCell(item, analystData)}
                </td>
                <td className={`px-2 py-2.5 text-center ${rowBorder}`}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedWatch(item.ticker); setWatchDetailTab("position"); }}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold text-[#58a6ff] bg-[#58a6ff]/10 hover:bg-[#58a6ff]/20 rounded transition-colors"
                    title={`Trade ${item.ticker}`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 3 3 4-4" />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
