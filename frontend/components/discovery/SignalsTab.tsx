"use client";

import React from "react";
import type { FinancialHealth, AnalystTrend, EmaPullbackSignal, PositionTransaction } from "@/lib/types";
import { healthScoreColor } from "@/lib/format";
import TickerLink from "../TickerLink";
import type { SortDir } from "./constants";

interface SignalsTabProps {
  signalResults: EmaPullbackSignal[];
  signalLoading: boolean;
  signalSort: { field: "ticker" | "price" | "health" | "chains" | "analyst"; dir: SortDir };
  setSignalSort: React.Dispatch<React.SetStateAction<{ field: "ticker" | "price" | "health" | "chains" | "analyst"; dir: SortDir }>>;
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
    <div className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm min-h-0">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#3fb950]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
          <div>
            <h3 className="text-[11px] font-bold text-[#c9d1d9] uppercase tracking-wide">Wheel Signals</h3>
            <p className="text-[9px] text-[#484f58]">Screener tickers with 5/6+ EMA pullback criteria</p>
          </div>
        </div>
        <button
          onClick={() => scanSignals()}
          disabled={signalLoading}
          className="text-[10px] px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:bg-[#30363d] disabled:opacity-50 transition font-medium"
        >
          {signalLoading ? "Scanning…" : "Rescan"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {signalLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#30363d] border-t-[#3fb950] animate-spin" />
            <p className="text-[10px] text-[#8b949e]">Scanning screeners for strong EMA pullback setups…</p>
            <p className="text-[9px] text-[#484f58]">This may take a moment (analyzing ~200 tickers)</p>
          </div>
        ) : signalResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <svg className="w-8 h-8 text-[#30363d] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
            <p className="text-[10px] text-[#8b949e]">No strong signals found</p>
            <p className="text-[9px] text-[#484f58] mt-0.5">No screener tickers currently meet 5/6 EMA pullback criteria</p>
          </div>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[9px] text-[#8b949e] uppercase tracking-widest border-b border-[#21262d]">
                <th className="text-center py-2 px-1.5 font-medium w-8">
                  <svg className="w-3 h-3 text-[#8b949e] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </th>
                <th className="text-left py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "ticker", dir: prev.field === "ticker" && prev.dir === "asc" ? "desc" : "asc" }))}>
                  Ticker {signalSort.field === "ticker" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="text-left py-2 px-2 font-medium">Signal</th>
                <th className="text-right py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "price", dir: prev.field === "price" && prev.dir === "asc" ? "desc" : "asc" }))}>
                  Price {signalSort.field === "price" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="text-center py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "health", dir: prev.field === "health" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  Health {signalSort.field === "health" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="text-center py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "chains", dir: prev.field === "chains" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  Activity {signalSort.field === "chains" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="text-center py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "analyst", dir: prev.field === "analyst" && prev.dir === "desc" ? "asc" : "desc" }))}>
                  Analyst {signalSort.field === "analyst" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="text-right py-2 px-2 font-medium">RSI</th>
                <th className="text-center py-2 px-2 font-medium">Strength</th>
                <th className="text-center py-2 px-2 font-medium">Volume</th>
                <th className="text-center py-2 px-2 font-medium">Candle</th>
                <th className="text-center py-2 px-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {[...signalResults].sort((a, b) => {
                const dir = signalSort.dir === "asc" ? 1 : -1;
                if (signalSort.field === "ticker") return dir * a.ticker.localeCompare(b.ticker);
                if (signalSort.field === "health") return dir * ((signalHealth[a.ticker]?.health_score ?? 0) - (signalHealth[b.ticker]?.health_score ?? 0));
                if (signalSort.field === "chains") return dir * ((signalChains[a.ticker] ?? 0) - (signalChains[b.ticker] ?? 0));
                if (signalSort.field === "analyst") {
                  const aBuys = signalAnalyst[a.ticker] ? signalAnalyst[a.ticker].strong_buy + signalAnalyst[a.ticker].buy : 0;
                  const bBuys = signalAnalyst[b.ticker] ? signalAnalyst[b.ticker].strong_buy + signalAnalyst[b.ticker].buy : 0;
                  return dir * (aBuys - bBuys);
                }
                return dir * (a.price - b.price);
              }).map((sig) => {
                const isCsp = sig.direction === "call";
                const hasShares = (positions[sig.ticker] || []).reduce((s, tx) => s + (tx.type === "buy" ? tx.quantity : -tx.quantity), 0) > 0;
                const ccDisabled = !isCsp && !hasShares;
                const isWatched = watchlist.includes(sig.ticker.toUpperCase());
                return (
                  <tr key={sig.ticker} className="border-b border-[#161b22] hover:bg-[#161b22]/60 transition-colors">
                    <td className="py-2.5 px-1.5 text-center w-8">
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
                    <td className="py-2.5 px-2">
                      <TickerLink ticker={sig.ticker} />
                    </td>
                    <td className="py-2.5 px-2">
                      {ccDisabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-[#161b22] border border-[#30363d] text-[#6e7681]">
                          CC — Not actionable
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold ${isCsp ? "bg-[#d29922]/10 text-[#d29922]" : "bg-[#58a6ff]/10 text-[#58a6ff]"}`}>
                          {isCsp ? "Sell CSP" : "Sell CC"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right text-[#c9d1d9] tabular-nums font-medium">${sig.price.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-center">
                      {signalHealth[sig.ticker] ? (
                        <span className={`text-[10px] font-bold tabular-nums ${healthScoreColor(signalHealth[sig.ticker].health_score)}`}>
                          {signalHealth[sig.ticker].health_score}
                        </span>
                      ) : (
                        <span className="text-[#484f58]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {signalChains[sig.ticker] != null ? (
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${signalChains[sig.ticker] >= 50 ? "bg-[#3fb950]" : signalChains[sig.ticker] >= 20 ? "bg-[#d29922]" : "bg-[#f85149]"}`}
                          title={`${signalChains[sig.ticker]} contracts`}
                        />
                      ) : (
                        <span className="text-[#484f58]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {signalAnalyst[sig.ticker] ? (() => {
                        const a = signalAnalyst[sig.ticker];
                        const total = a.strong_buy + a.buy + a.hold + a.sell + a.strong_sell;
                        let label = "Hold";
                        let color = "text-[#d29922]";
                        if (total > 0) {
                          const max = Math.max(a.strong_buy, a.buy, a.hold, a.sell, a.strong_sell);
                          if (max === a.strong_buy) { label = "Strong Buy"; color = "text-[#3fb950]"; }
                          else if (max === a.buy) { label = "Buy"; color = "text-[#56d364]"; }
                          else if (max === a.hold) { label = "Hold"; color = "text-[#d29922]"; }
                          else if (max === a.sell) { label = "Sell"; color = "text-[#f85149]"; }
                          else if (max === a.strong_sell) { label = "Strong Sell"; color = "text-[#f85149]"; }
                        }
                        return (
                          <span className={`text-[10px] font-bold ${color}`} title={`${a.strong_buy} Strong Buy, ${a.buy} Buy, ${a.hold} Hold, ${a.sell} Sell, ${a.strong_sell} Strong Sell`}>
                            {label}
                          </span>
                        );
                      })() : (
                        <span className="text-[#484f58]">—</span>
                      )}
                    </td>
                    <td className={`py-2.5 px-2 text-right tabular-nums font-medium ${sig.rsi > 70 ? "text-[#f85149]" : sig.rsi < 30 ? "text-[#3fb950]" : "text-[#c9d1d9]"}`}>{sig.rsi.toFixed(1)}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${sig.criteria_met >= 6 ? "bg-[#3fb950]/15 text-[#3fb950]" : "bg-[#d29922]/15 text-[#d29922]"}`}>
                        {sig.criteria_met}/6
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {sig.volume_increasing ? (
                        <span className="text-[#3fb950]">▲</span>
                      ) : (
                        <span className="text-[#484f58]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {sig.candle_confirmed ? (
                        <span className="text-[#3fb950]">✓</span>
                      ) : (
                        <span className="text-[#484f58]">✗</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedWatch(sig.ticker); setWatchDetailTab("position"); }}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold text-[#58a6ff] bg-[#58a6ff]/10 hover:bg-[#58a6ff]/20 rounded transition-colors"
                        title={`Trade ${sig.ticker}`}
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
        )}
      </div>
    </div>
  );
}
