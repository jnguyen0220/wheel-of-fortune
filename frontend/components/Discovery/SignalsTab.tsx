"use client";

import React from "react";
import type { FinancialHealth, AnalystTrend, EmaPullbackSignal, PositionTransaction } from "@/lib/types";
import { healthScoreColor, analystConsensus } from "@/lib/format";
import TickerLink from "../TickerLink";
import type { SortDir } from "./constants";

interface SignalsTabProps {
  signalResults: EmaPullbackSignal[];
  signalLoading: boolean;
  signalSort: { field: "ticker" | "price" | "health" | "chains" | "analyst" | "sector" | "strength" | "volume" | "candle"; dir: SortDir };
  setSignalSort: React.Dispatch<React.SetStateAction<{ field: "ticker" | "price" | "health" | "chains" | "analyst" | "sector" | "strength" | "volume" | "candle"; dir: SortDir }>>;
  signalHealth: Record<string, FinancialHealth>;
  signalChains: Record<string, number>;
  signalAnalyst: Record<string, AnalystTrend>;
  positions: Record<string, PositionTransaction[]>;
  watchlist: string[];
  setWatchlist: (fn: (prev: string[]) => string[]) => void;
  removeFromWatchlist: (ticker: string) => void;
  setSelectedWatch: (ticker: string | null) => void;
  setWatchDetailTab: (tab: "position" | "option" | "order" | "technicals") => void;
  scanSignals: () => void;
}

export default function SignalsTab({
  signalResults,
  signalLoading,
  signalSort,
  setSignalSort,
  signalHealth,
  signalChains,
  signalAnalyst,
  positions,
  watchlist,
  setWatchlist,
  removeFromWatchlist,
  setSelectedWatch,
  setWatchDetailTab,
  scanSignals,
}: SignalsTabProps) {

  return (
    <div className="flex-1 rounded-xl border border-[#21262d] bg-[#0d1117] overflow-hidden flex flex-col min-h-0">
      {/* Header */}
      <div className="px-5 py-4 bg-[#161b22] border-b border-[#21262d]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#3fb950]/10 border border-[#3fb950]/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#3fb950]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#f0f6fc]">Wheel Signals</h3>
              <p className="text-[10px] text-[#8b949e] mt-0.5">EMA pullback setups meeting 5/6+ criteria</p>
            </div>
          </div>
          <button
            onClick={() => scanSignals()}
            disabled={signalLoading}
            className="inline-flex items-center gap-1.5 text-[11px] px-3.5 py-2 rounded-lg bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:bg-[#30363d] hover:border-[#484f58] disabled:opacity-50 transition-all font-medium shadow-sm"
          >
            <svg className={`w-3.5 h-3.5 ${signalLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {signalLoading ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {signalLoading ? (
          <div className="flex flex-col items-center justify-center h-52 gap-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-[#21262d] border-t-[#3fb950] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border border-[#21262d] border-b-[#3fb950]/50 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
              </div>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-[#c9d1d9] font-medium">Scanning for pullback setups…</p>
              <p className="text-[10px] text-[#484f58] mt-1">Analyzing screener tickers against EMA criteria</p>
            </div>
          </div>
        ) : signalResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#21262d] flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-[#30363d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
            <p className="text-[11px] text-[#8b949e] font-medium">No signals detected</p>
            <p className="text-[10px] text-[#484f58] mt-1 max-w-[260px]">No screener tickers currently meet the 5/6 EMA pullback criteria. Try rescanning later.</p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-[#0d1117]">
              <tr className="text-[9px] text-[#484f58] uppercase tracking-wider border-b border-[#21262d]">
                <th className="text-center py-2.5 px-2 font-semibold w-9">
                  <svg className="w-3 h-3 text-[#484f58] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </th>
                <th className="text-left py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "ticker", dir: prev.field === "ticker" && prev.dir === "asc" ? "desc" : "asc" }))}>
                  <span className="inline-flex items-center gap-1">Ticker {signalSort.field === "ticker" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-left py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "sector", dir: prev.field === "sector" && prev.dir === "asc" ? "desc" : "asc" }))}>
                  <span className="inline-flex items-center gap-1">Sector {signalSort.field === "sector" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-left py-2.5 px-2.5 font-semibold">Signal</th>
                <th className="text-right py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "price", dir: prev.field === "price" && prev.dir === "asc" ? "desc" : "asc" }))}>
                  <span className="inline-flex items-center gap-1 justify-end">Price {signalSort.field === "price" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "health", dir: prev.field === "health" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Health {signalSort.field === "health" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "chains", dir: prev.field === "chains" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Activity {signalSort.field === "chains" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "analyst", dir: prev.field === "analyst" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Analyst {signalSort.field === "analyst" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-right py-2.5 px-2.5 font-semibold">RSI</th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "strength", dir: prev.field === "strength" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Strength {signalSort.field === "strength" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "volume", dir: prev.field === "volume" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Vol {signalSort.field === "volume" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "candle", dir: prev.field === "candle" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Candle {signalSort.field === "candle" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161b22]">
              {[...signalResults].sort((a, b) => {
                const dir = signalSort.dir === "asc" ? 1 : -1;
                if (signalSort.field === "ticker") return dir * a.ticker.localeCompare(b.ticker);
                if (signalSort.field === "sector") return dir * ((signalHealth[a.ticker]?.sector ?? "").localeCompare(signalHealth[b.ticker]?.sector ?? ""));
                if (signalSort.field === "health") return dir * ((signalHealth[a.ticker]?.health_score ?? 0) - (signalHealth[b.ticker]?.health_score ?? 0));
                if (signalSort.field === "chains") return dir * ((signalChains[a.ticker] ?? 0) - (signalChains[b.ticker] ?? 0));
                if (signalSort.field === "analyst") {
                  return dir * (analystConsensus(signalAnalyst[a.ticker]).score - analystConsensus(signalAnalyst[b.ticker]).score);
                }
                if (signalSort.field === "strength") return dir * (a.criteria_met - b.criteria_met);
                if (signalSort.field === "volume") return dir * ((a.volume_increasing ? 1 : 0) - (b.volume_increasing ? 1 : 0));
                if (signalSort.field === "candle") return dir * ((a.candle_confirmed ? 1 : 0) - (b.candle_confirmed ? 1 : 0));
                return dir * (a.price - b.price);
              }).map((sig) => {
                const isCsp = sig.direction === "call";
                const hasShares = (positions[sig.ticker] || []).reduce((s, tx) => s + (tx.type === "buy" ? tx.quantity : -tx.quantity), 0) > 0;
                const ccDisabled = !isCsp && !hasShares;
                const isWatched = watchlist.includes(sig.ticker.toUpperCase());
                return (
                  <tr key={sig.ticker} className="group hover:bg-[#161b22]/80 transition-colors">
                    <td className="py-3 px-2 text-center w-9">
                      <input
                        type="checkbox"
                        checked={isWatched}
                        onChange={() => {
                          if (isWatched) {
                            removeFromWatchlist(sig.ticker);
                          } else {
                            const t = sig.ticker.trim().toUpperCase();
                            if (t) setWatchlist((prev) => prev.includes(t) ? prev : [...prev, t]);
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#58a6ff] focus:ring-offset-0 cursor-pointer accent-[#58a6ff]"
                      />
                    </td>
                    <td className="py-3 px-2.5">
                      <div className="flex items-center gap-2">
                        <div>
                          <TickerLink ticker={sig.ticker} />
                          {signalHealth[sig.ticker]?.name && (
                            <div className="text-[9px] text-[#8b949e] truncate max-w-[140px] mt-0.5">{signalHealth[sig.ticker].name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2.5">
                      {signalHealth[sig.ticker]?.sector ? (
                        <span className="text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded">{signalHealth[sig.ticker].sector}</span>
                      ) : (
                        <span className="text-[#30363d]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2.5">
                      {ccDisabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-medium bg-[#21262d] border border-[#30363d] text-[#6e7681]">
                          CC — No shares
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold border ${isCsp ? "bg-[#d29922]/8 border-[#d29922]/25 text-[#d29922]" : "bg-[#58a6ff]/8 border-[#58a6ff]/25 text-[#58a6ff]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isCsp ? "bg-[#d29922]" : "bg-[#58a6ff]"}`} />
                          {isCsp ? "Sell CSP" : "Sell CC"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2.5 text-right">
                      <span className="text-[#f0f6fc] tabular-nums font-semibold">${sig.price.toFixed(2)}</span>
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      {signalHealth[sig.ticker] ? (
                        <span className={`inline-flex items-center justify-center w-8 h-5 rounded text-[10px] font-bold tabular-nums ${healthScoreColor(signalHealth[sig.ticker].health_score)} bg-current/8`}>
                          <span className={healthScoreColor(signalHealth[sig.ticker].health_score)}>{signalHealth[sig.ticker].health_score}</span>
                        </span>
                      ) : (
                        <span className="text-[#30363d]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      {signalChains[sig.ticker] != null ? (
                        <div className="flex items-center justify-center gap-1">
                          <span
                            className={`w-2 h-2 rounded-full ${signalChains[sig.ticker] >= 50 ? "bg-[#3fb950]" : signalChains[sig.ticker] >= 20 ? "bg-[#d29922]" : "bg-[#f85149]"}`}
                          />
                          <span className="text-[10px] text-[#8b949e] tabular-nums">{signalChains[sig.ticker]}</span>
                        </div>
                      ) : (
                        <span className="text-[#30363d]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      {(() => {
                        const c = analystConsensus(signalAnalyst[sig.ticker]);
                        const a = signalAnalyst[sig.ticker];
                        return c.total > 0 ? (
                          <span className={`text-[10px] font-semibold ${c.color}`} title={`${a.strong_buy} Strong Buy, ${a.buy} Buy, ${a.hold} Hold, ${a.sell} Sell, ${a.strong_sell} Strong Sell`}>
                            {c.label}
                          </span>
                        ) : (
                          <span className="text-[#30363d]">—</span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-2.5 text-right">
                      <span className={`tabular-nums font-semibold ${sig.rsi > 70 ? "text-[#f85149]" : sig.rsi < 30 ? "text-[#3fb950]" : "text-[#c9d1d9]"}`}>{sig.rsi.toFixed(1)}</span>
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        <div className="flex gap-px">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className={`w-1 h-3 rounded-sm ${i < sig.criteria_met ? (sig.criteria_met >= 6 ? "bg-[#3fb950]" : "bg-[#d29922]") : "bg-[#21262d]"}`} />
                          ))}
                        </div>
                        <span className={`text-[9px] font-bold tabular-nums ml-0.5 ${sig.criteria_met >= 6 ? "text-[#3fb950]" : "text-[#d29922]"}`}>{sig.criteria_met}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      {sig.volume_increasing ? (
                        <svg className="w-3.5 h-3.5 text-[#3fb950] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                        </svg>
                      ) : (
                        <span className="text-[#30363d]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      {sig.candle_confirmed ? (
                        <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-[#3fb950]/15">
                          <svg className="w-3 h-3 text-[#3fb950]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-[#21262d]">
                          <svg className="w-3 h-3 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center w-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedWatch(sig.ticker); setWatchDetailTab("position"); }}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#58a6ff] bg-[#58a6ff]/8 hover:bg-[#58a6ff]/15 border border-transparent hover:border-[#58a6ff]/25 transition-all opacity-60 group-hover:opacity-100"
                        title={`Trade ${sig.ticker}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 3 3 4-4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
