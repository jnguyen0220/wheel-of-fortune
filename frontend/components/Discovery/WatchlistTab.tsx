"use client";

import React, { useMemo } from "react";
import type { FinancialHealth, AnalystTrend, StockMarketData, EarningsCalendar, EarningsResult, PositionTransaction, OptionsOrder } from "@/lib/types";
import { healthScoreColor, analystConsensus } from "@/lib/format";
import { useHealthPopup } from "../HealthPopupContext";
import type { WatchSortField, SortDir } from "./constants";

interface WatchlistTabProps {
  watchlist: string[];
  setWatchlist: (fn: (prev: string[]) => string[]) => void;
  watchInput: string;
  setWatchInput: (v: string) => void;
  addToWatchlist: (ticker: string) => void;
  removeFromWatchlist: (ticker: string) => void;
  selectedWatch: string | null;
  setSelectedWatch: (t: string | null) => void;
  setWatchDetailTab: (tab: "position" | "option" | "order" | "iv") => void;
  watchSortField: WatchSortField;
  setWatchSortField: (f: WatchSortField) => void;
  watchSortDir: SortDir;
  setWatchSortDir: (fn: (prev: SortDir) => SortDir) => void;
  setWatchRefreshKey: (fn: (prev: number) => number) => void;
  watchBatch: {
    financials: Record<string, FinancialHealth>;
    analyst_trends: Record<string, AnalystTrend[]>;
    market_data: Record<string, StockMarketData>;
    earnings_calendar: Record<string, EarningsCalendar[]>;
    earnings_history: Record<string, EarningsResult[]>;
  };
  positions: Record<string, PositionTransaction[]>;
  orders: OptionsOrder[];
}

export default function WatchlistTab({
  watchlist,
  setWatchlist,
  watchInput,
  setWatchInput,
  addToWatchlist,
  removeFromWatchlist,
  selectedWatch,
  setSelectedWatch,
  setWatchDetailTab,
  watchSortField,
  setWatchSortField,
  watchSortDir,
  setWatchSortDir,
  setWatchRefreshKey,
  watchBatch,
  positions,
  orders,
}: WatchlistTabProps) {
  const { openHealthPopup } = useHealthPopup();

  const handleSort = (field: WatchSortField) => {
    if (watchSortField === field) setWatchSortDir(d => d === "asc" ? "desc" : "asc");
    else { setWatchSortField(field); setWatchSortDir(() => "asc"); }
  };

  const sortArrow = (field: WatchSortField) => (
    watchSortField === field ? (
      <svg className="w-2.5 h-2.5 text-[#58a6ff] inline-block ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        {watchSortDir === "asc"
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />}
      </svg>
    ) : null
  );

  const sortedWatchlist = useMemo(() => {
    return [...watchlist].sort((a, b) => {
      let cmp = 0;
      switch (watchSortField) {
        case "ticker": cmp = a.localeCompare(b); break;
        case "name": cmp = (watchBatch.financials[a]?.name ?? "").localeCompare(watchBatch.financials[b]?.name ?? ""); break;
        case "price": cmp = (watchBatch.market_data[a]?.price ?? 0) - (watchBatch.market_data[b]?.price ?? 0); break;
        case "health": cmp = (watchBatch.financials[a]?.health_score ?? -1) - (watchBatch.financials[b]?.health_score ?? -1); break;
        case "sector": cmp = (watchBatch.financials[a]?.sector ?? "").localeCompare(watchBatch.financials[b]?.sector ?? ""); break;
        case "analyst": {
          const tA = watchBatch.analyst_trends[a];
          const tB = watchBatch.analyst_trends[b];
          const curA = tA?.find((x: { period: string }) => x.period === "0m") || tA?.[0];
          const curB = tB?.find((x: { period: string }) => x.period === "0m") || tB?.[0];
          cmp = analystConsensus(curA).score - analystConsensus(curB).score;
          break;
        }
        case "positions": {
          const netA = (positions[a] || []).reduce((s, tx) => s + (tx.type === "buy" ? tx.quantity : -tx.quantity), 0);
          const netB = (positions[b] || []).reduce((s, tx) => s + (tx.type === "buy" ? tx.quantity : -tx.quantity), 0);
          cmp = netA - netB; break;
        }
      }
      if (cmp === 0) cmp = a.localeCompare(b);
      return watchSortDir === "asc" ? cmp : -cmp;
    });
  }, [watchlist, watchSortField, watchSortDir, watchBatch, positions]);

  return (
    <div className="flex-1 rounded-xl border border-[#21262d] bg-[#0d1117] overflow-hidden flex flex-col min-h-0">
      {/* Add ticker toolbar */}
      <form
        onSubmit={(e) => { e.preventDefault(); watchInput.split(/[\s,]+/).filter(Boolean).forEach(t => addToWatchlist(t)); }}
        className="flex items-center gap-2 px-4 py-2.5 border-b border-[#21262d]"
      >
        <input
          type="text"
          value={watchInput}
          onChange={(e) => setWatchInput(e.target.value.toUpperCase())}
          placeholder="Add tickers (e.g. AAPL, MSFT, NVDA)…"
          className="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-1.5 text-[11px] text-[#c9d1d9] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff]/50 transition-colors"
        />
        <button
          type="submit"
          disabled={!watchInput.trim()}
          className="px-3 py-1.5 rounded-lg bg-[#238636] text-white text-[10px] font-semibold disabled:opacity-30 hover:bg-[#2ea043] transition flex items-center gap-1.5"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add
        </button>
        <div className="h-5 w-px bg-[#21262d]" />
        <label
          className="px-2.5 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] text-[10px] font-medium hover:bg-[#30363d] hover:text-[#c9d1d9] transition cursor-pointer flex items-center gap-1"
          title="Import tickers from CSV file"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
          Import
          <input
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const text = ev.target?.result as string;
                const lines = text.split(/[\n\r]+/).filter(Boolean);
                lines.slice(1).flatMap(l => l.split(/[\s,]+/)).filter(Boolean).forEach(t => addToWatchlist(t.trim().toUpperCase()));
              };
              reader.readAsText(file);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (watchlist.length === 0) return;
            const csv = "ticker\n" + watchlist.join("\n") + "\n";
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "watchlist.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-2.5 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] text-[10px] font-medium hover:bg-[#30363d] hover:text-[#c9d1d9] transition flex items-center gap-1"
          title="Export watchlist as CSV"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          Export
        </button>
        <button
          type="button"
          onClick={() => {
            const csv = "ticker\nAAPL\nMSFT\nAMD\nNVDA\nAMZN\nGOOGL\nMETA\nTSLA\nSPY\nQQQ\nKO\nPLTR\nSOFI\nCOIN\n";
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "watchlist_template.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-2.5 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] text-[10px] font-medium hover:bg-[#30363d] hover:text-[#c9d1d9] transition flex items-center gap-1"
          title="Download CSV template"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
          Template
        </button>
      </form>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#21262d] flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-[#30363d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <p className="text-[11px] text-[#8b949e] font-medium">No tickers in watchlist</p>
            <p className="text-[10px] text-[#484f58] mt-1 max-w-[260px]">Add ticker symbols above or import from a CSV file to start tracking.</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Table toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#21262d] bg-[#0d1117] shrink-0">
              <span className="text-[10px] text-[#484f58] tabular-nums">{watchlist.length} ticker{watchlist.length !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWatchRefreshKey(k => k + 1)}
                  className="text-[10px] text-[#8b949e] hover:text-[#c9d1d9] transition-colors flex items-center gap-1"
                  title="Refresh data"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Refresh
                </button>
                <div className="h-3 w-px bg-[#21262d]" />
                <button
                  onClick={() => { setWatchlist(() => []); setSelectedWatch(null); }}
                  className="text-[10px] text-[#8b949e] hover:text-[#f85149] transition-colors flex items-center gap-1"
                  title="Clear all tickers"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  Clear
                </button>
              </div>
            </div>
            {/* Table */}
            <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-[#0d1117]">
              <tr className="text-[9px] text-[#484f58] uppercase tracking-wider border-b border-[#21262d]">
                <th className="text-left py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => handleSort("ticker")}>
                  <span className={watchSortField === "ticker" ? "text-[#58a6ff]" : ""}>Ticker</span>{sortArrow("ticker")}
                </th>
                <th className="text-left py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => handleSort("sector")}>
                  <span className={watchSortField === "sector" ? "text-[#58a6ff]" : ""}>Sector</span>{sortArrow("sector")}
                </th>
                <th className="text-center py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors w-20" onClick={() => handleSort("health")}>
                  <span className={watchSortField === "health" ? "text-[#58a6ff]" : ""}>Health</span>{sortArrow("health")}
                </th>
                <th className="text-right py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => handleSort("price")}>
                  <span className={watchSortField === "price" ? "text-[#58a6ff]" : ""}>Price</span>{sortArrow("price")}
                </th>
                <th className="text-right py-2.5 px-3 font-semibold">Low</th>
                <th className="text-right py-2.5 px-3 font-semibold">High</th>
                <th className="text-left py-2.5 px-3 font-semibold">Earnings</th>
                <th className="text-left py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => handleSort("analyst")}>
                  <span className={watchSortField === "analyst" ? "text-[#58a6ff]" : ""}>Analyst</span>{sortArrow("analyst")}
                </th>
                <th className="text-center py-2.5 px-2 font-semibold w-12"></th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sortedWatchlist.map((t) => {
                const md = watchBatch.market_data[t];
                const health = watchBatch.financials[t];
                const cal = watchBatch.earnings_calendar[t];
                const hist = watchBatch.earnings_history[t];
                const trends = watchBatch.analyst_trends[t];
                const isActive = selectedWatch === t;
                const openOrders = orders.filter(o => o.ticker === t && o.status === "open");
                const txns = positions[t] || [];
                const buyTxns = txns.filter(tx => tx.type === "buy");
                const totalBuyQty = buyTxns.reduce((s, tx) => s + tx.quantity, 0);
                const totalSellQty = txns.filter(tx => tx.type === "sell").reduce((s, tx) => s + tx.quantity, 0);
                const netShares = totalBuyQty - totalSellQty;

                // Earnings
                const nextEarnings = cal && cal.length > 0 ? cal[0] : null;
                const sortedHist = hist ? [...hist].sort((a, b) => b.report_date.localeCompare(a.report_date)) : [];
                const lastEarnings = sortedHist.length > 0 ? sortedHist[0] : null;

                // Analyst — weighted average consensus
                const latest = trends?.find((x: { period: string }) => x.period === "0m") || trends?.[0];
                const ac = analystConsensus(latest);

                return (
                  <React.Fragment key={t}>
                    <tr
                      className={`group transition-colors duration-100 ${isActive ? "bg-[#161b22] border-l-2 border-l-[#58a6ff]" : "hover:bg-[#161b22]/60 border-l-2 border-l-transparent"}`}
                    >
                      {/* Ticker */}
                      <td className="px-3 py-2.5 border-b border-[#21262d]">
                        <div className="flex items-center gap-1.5">
                          <span
                            onClick={(e) => { e.stopPropagation(); openHealthPopup(t); }}
                            className={`text-[11px] font-bold tracking-wide cursor-pointer hover:underline decoration-dotted underline-offset-2 ${isActive ? "text-[#d29922]" : "text-[#58a6ff]"}`}
                          >{t}</span>
                          {netShares > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#d29922] inline-block shrink-0" title={`${netShares} shares`} />
                          )}
                          {openOrders.length > 0 && (
                            <span className="text-[8px] font-bold text-[#d29922] bg-[#d29922]/15 px-1 py-0.5 rounded leading-none shrink-0" title={`${openOrders.length} open contract${openOrders.length > 1 ? "s" : ""}`}>{openOrders.length}</span>
                          )}
                        </div>
                        <span className="text-[9px] text-[#8b949e] truncate block max-w-[160px]">{health?.name ?? ""}</span>
                      </td>
                      {/* Sector */}
                      <td className="px-3 py-2.5 border-b border-[#21262d] whitespace-nowrap">
                        {health?.sector ? (
                          <span className="text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded">{health.sector}</span>
                        ) : (
                          <span className="text-[10px] text-[#30363d]">—</span>
                        )}
                      </td>
                      {/* Health */}
                      <td className="px-3 py-2.5 text-center border-b border-[#21262d]">
                        {health ? (
                          <div className="inline-flex items-center gap-1.5">
                            <div className="w-10 h-1 rounded-full bg-[#21262d] overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${health.health_score}%`,
                                  backgroundColor: health.health_score >= 70 ? '#3fb950' : health.health_score >= 40 ? '#d29922' : '#f85149',
                                }}
                              />
                            </div>
                            <span className={`text-[10px] font-bold tabular-nums leading-none ${healthScoreColor(health.health_score)}`}>
                              {health.health_score}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#30363d]">—</span>
                        )}
                      </td>
                      {/* Price */}
                      <td className="px-3 py-2.5 text-right border-b border-[#21262d] whitespace-nowrap">
                        <span className="text-[11px] text-[#f0f6fc] font-semibold tabular-nums">{md ? `$${md.price.toFixed(2)}` : "—"}</span>
                      </td>
                      {/* Low (52W + Day) */}
                      <td className="px-3 py-2.5 text-right border-b border-[#21262d] whitespace-nowrap">
                        {md ? (
                          <div className="space-y-0.5">
                            <div className="text-[9px] tabular-nums leading-none"><span className="text-[#484f58] font-medium">52W</span> <span className="text-[#8b949e]">${md.week52_low.toFixed(2)}</span></div>
                            <div className="text-[9px] tabular-nums leading-none"><span className="text-[#484f58] font-medium">Day</span> <span className="text-[#8b949e]">${md.daily_low.toFixed(2)}</span></div>
                          </div>
                        ) : <span className="text-[10px] text-[#30363d]">—</span>}
                      </td>
                      {/* High (52W + Day) */}
                      <td className="px-3 py-2.5 text-right border-b border-[#21262d] whitespace-nowrap">
                        {md ? (
                          <div className="space-y-0.5">
                            <div className="text-[9px] tabular-nums leading-none"><span className="text-[#484f58] font-medium">52W</span> <span className="text-[#8b949e]">${md.week52_high.toFixed(2)}</span></div>
                            <div className="text-[9px] tabular-nums leading-none"><span className="text-[#484f58] font-medium">Day</span> <span className="text-[#8b949e]">${md.daily_high.toFixed(2)}</span></div>
                          </div>
                        ) : <span className="text-[10px] text-[#30363d]">—</span>}
                      </td>
                      {/* Earnings */}
                      <td className="px-3 py-2.5 border-b border-[#21262d] whitespace-nowrap">
                        <div className="space-y-0.5">
                          {nextEarnings ? (
                            <div className="text-[9px] tabular-nums leading-none">
                              <span className={`font-semibold ${nextEarnings.days_until <= 14 ? "text-[#d29922]" : "text-[#c9d1d9]"}`}>{nextEarnings.days_until}d</span>
                              <span className="text-[#484f58] ml-1">{nextEarnings.earnings_date}</span>
                            </div>
                          ) : <span className="text-[9px] text-[#30363d]">—</span>}
                          {lastEarnings && (
                            <div className="text-[9px] tabular-nums leading-none">
                              <span className={lastEarnings.beat === true ? "text-[#3fb950]" : lastEarnings.beat === false ? "text-[#f85149]" : "text-[#484f58]"}>
                                {lastEarnings.beat === true ? "Beat" : lastEarnings.beat === false ? "Miss" : "—"} {lastEarnings.fiscal_quarter}
                              </span>
                              {lastEarnings.eps_surprise != null && (
                                <span className={`ml-1 ${lastEarnings.eps_surprise >= 0 ? "text-[#3fb950]/70" : "text-[#f85149]/70"}`}>
                                  {lastEarnings.eps_surprise >= 0 ? "+" : ""}{lastEarnings.eps_surprise.toFixed(2)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Analyst */}
                      <td className="px-3 py-2.5 border-b border-[#21262d] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-semibold ${ac.color}`}>{ac.label}</span>
                          {ac.total > 0 && (
                            <span className="text-[8px] text-[#484f58] tabular-nums">{ac.total}</span>
                          )}
                        </div>
                      </td>
                      {/* Trade */}
                      <td className="px-2 py-2.5 text-center border-b border-[#21262d]">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedWatch(isActive ? null : t); setWatchDetailTab("position"); }}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold text-[#58a6ff] bg-[#58a6ff]/10 hover:bg-[#58a6ff]/20 rounded transition-colors"
                          title={`Trade ${t}`}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 3 3 4-4" />
                          </svg>
                        </button>
                      </td>
                      {/* Remove */}
                      <td className="px-1 py-2.5 text-center border-b border-[#21262d] w-8">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFromWatchlist(t); }}
                          className="opacity-0 group-hover:opacity-100 text-[#30363d] hover:text-[#f85149] transition-all duration-150 p-0.5 rounded"
                          title="Remove"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
