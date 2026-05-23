"use client";

import React, { useMemo } from "react";
import type { FinancialHealth, AnalystTrend, PositionTransaction, IvSignal } from "@/lib/types";
import { healthScoreColor, analystConsensus } from "@/lib/format";
import TickerLink from "../TickerLink";
import type { SortDir } from "./constants";

// Module-level helpers (no allocations per render)
const regimeLabel = (r: string) => r === "range_bound" ? "Range" : r === "volatile" ? "Volatile" : "Trend";
const regimeColor = (r: string) => r === "range_bound" ? "text-[#3fb950]" : r === "volatile" ? "text-[#f85149]" : "text-[#d29922]";
const actionLabel = (sig: IvSignal) => {
  if (sig.premium_score < 35) return "Wait";
  if (sig.premium_score < 55) return "Hold";
  return sig.favored_leg === "csp" ? "Sell Put" : sig.favored_leg === "cc" ? "Sell Call" : "Sell Either";
};
const actionColor = (sig: IvSignal) => {
  if (sig.premium_score < 35) return "bg-[#f85149]/8 border-[#f85149]/25 text-[#f85149]";
  if (sig.premium_score < 55) return "bg-[#d29922]/8 border-[#d29922]/25 text-[#d29922]";
  return sig.favored_leg === "csp" ? "bg-[#d29922]/8 border-[#d29922]/25 text-[#d29922]" : sig.favored_leg === "cc" ? "bg-[#58a6ff]/8 border-[#58a6ff]/25 text-[#58a6ff]" : "bg-[#3fb950]/8 border-[#3fb950]/25 text-[#3fb950]";
};
const actionDot = (sig: IvSignal) => {
  if (sig.premium_score < 35) return "bg-[#f85149]";
  if (sig.premium_score < 55) return "bg-[#d29922]";
  return sig.favored_leg === "csp" ? "bg-[#d29922]" : sig.favored_leg === "cc" ? "bg-[#58a6ff]" : "bg-[#3fb950]";
};

interface SignalsTabProps {
  signalResults: IvSignal[];
  signalLoading: boolean;
  signalSort: { field: "ticker" | "price" | "health" | "chains" | "analyst" | "sector" | "score" | "ivRank" | "regime"; dir: SortDir };
  setSignalSort: React.Dispatch<React.SetStateAction<{ field: "ticker" | "price" | "health" | "chains" | "analyst" | "sector" | "score" | "ivRank" | "regime"; dir: SortDir }>>;
  signalHealth: Record<string, FinancialHealth>;
  signalChains: Record<string, number>;
  signalAnalyst: Record<string, AnalystTrend>;
  positions: Record<string, PositionTransaction[]>;
  watchlist: string[];
  setWatchlist: (fn: (prev: string[]) => string[]) => void;
  removeFromWatchlist: (ticker: string) => void;
  setSelectedWatch: (ticker: string | null) => void;
  setWatchDetailTab: (tab: "position" | "option" | "order" | "iv") => void;
  scanSignals: () => void;
}

export default React.memo(function SignalsTab({
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

  const sortedSignals = useMemo(() => {
    return [...signalResults].sort((a, b) => {
      const dir = signalSort.dir === "asc" ? 1 : -1;
      if (signalSort.field === "ticker") return dir * a.ticker.localeCompare(b.ticker);
      if (signalSort.field === "sector") return dir * ((signalHealth[a.ticker]?.sector ?? "").localeCompare(signalHealth[b.ticker]?.sector ?? ""));
      if (signalSort.field === "health") return dir * ((signalHealth[a.ticker]?.health_score ?? 0) - (signalHealth[b.ticker]?.health_score ?? 0));
      if (signalSort.field === "chains") return dir * ((signalChains[a.ticker] ?? 0) - (signalChains[b.ticker] ?? 0));
      if (signalSort.field === "analyst") return dir * (analystConsensus(signalAnalyst[a.ticker]).score - analystConsensus(signalAnalyst[b.ticker]).score);
      if (signalSort.field === "score") return dir * (a.premium_score - b.premium_score);
      if (signalSort.field === "ivRank") return dir * (a.iv_rank - b.iv_rank);
      if (signalSort.field === "regime") return dir * a.regime.localeCompare(b.regime);
      return dir * (a.price - b.price);
    });
  }, [signalResults, signalSort, signalHealth, signalChains, signalAnalyst]);

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
              <h3 className="text-xs font-semibold text-[#f0f6fc]">Premium Signals</h3>
              <p className="text-[10px] text-[#8b949e] mt-0.5">IV-ranked opportunities for selling premium</p>
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
              <p className="text-[11px] text-[#c9d1d9] font-medium">Scanning premium opportunities…</p>
              <p className="text-[10px] text-[#484f58] mt-1">Analyzing IV rank, HV spread, and regime for screener tickers</p>
            </div>
          </div>
        ) : signalResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#21262d] flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-[#30363d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
            <p className="text-[11px] text-[#8b949e] font-medium">No premium signals</p>
            <p className="text-[10px] text-[#484f58] mt-1 max-w-[260px]">Click Rescan to analyze screener tickers for IV-based premium selling opportunities.</p>
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
                <th className="text-left py-2.5 px-2.5 font-semibold">Action</th>
                <th className="text-right py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "price", dir: prev.field === "price" && prev.dir === "asc" ? "desc" : "asc" }))}>
                  <span className="inline-flex items-center gap-1 justify-end">Price {signalSort.field === "price" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "score", dir: prev.field === "score" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Score {signalSort.field === "score" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "ivRank", dir: prev.field === "ivRank" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">IV Rank {signalSort.field === "ivRank" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "regime", dir: prev.field === "regime" && prev.dir === "asc" ? "desc" : "asc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Regime {signalSort.field === "regime" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "health", dir: prev.field === "health" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Health {signalSort.field === "health" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "analyst", dir: prev.field === "analyst" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Analyst {signalSort.field === "analyst" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="text-center py-2.5 px-2.5 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "chains", dir: prev.field === "chains" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  <span className="inline-flex items-center gap-1 justify-center">Activity {signalSort.field === "chains" && <span className="text-[#58a6ff]">{signalSort.dir === "asc" ? "↑" : "↓"}</span>}</span>
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161b22]">
              {sortedSignals.map((sig) => {
                const isWatched = watchlist.includes(sig.ticker.toUpperCase());
                const score = Math.round(sig.premium_score);
                const scoreColor = score >= 70 ? "text-[#3fb950]" : score >= 50 ? "text-[#d29922]" : "text-[#f85149]";
                const hasShares = (positions[sig.ticker] || []).reduce((s, tx) => s + (tx.type === "buy" ? tx.quantity : -tx.quantity), 0) > 0;
                const ccDisabled = sig.favored_leg === "cc" && !hasShares;
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
                          Sell Call — No shares
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold border ${actionColor(sig)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${actionDot(sig)}`} />
                          {actionLabel(sig)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2.5 text-right">
                      <span className="text-[#f0f6fc] tabular-nums font-semibold">${sig.price.toFixed(2)}</span>
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5" title={sig.action}>
                        <div className="flex gap-px">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-1.5 h-3 rounded-sm ${i < sig.criteria_met ? (score >= 70 ? "bg-[#3fb950]" : score >= 50 ? "bg-[#d29922]" : "bg-[#f85149]") : "bg-[#21262d]"}`} />
                          ))}
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums ${scoreColor}`}>{score}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      <span className={`text-[10px] font-bold tabular-nums ${sig.iv_rank >= 60 ? "text-[#3fb950]" : sig.iv_rank >= 40 ? "text-[#d29922]" : "text-[#f85149]"}`} title={`IV/HV ratio: ${sig.iv_hv_ratio.toFixed(2)} | ATM IV: ${(sig.atm_iv * 100).toFixed(0)}% | HV20: ${(sig.hv_20 * 100).toFixed(0)}%`}>
                        {Math.round(sig.iv_rank)}%
                      </span>
                    </td>
                    <td className="py-3 px-2.5 text-center">
                      <span className={`text-[10px] font-semibold ${regimeColor(sig.regime)}`}>
                        {regimeLabel(sig.regime)}
                      </span>
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
});
