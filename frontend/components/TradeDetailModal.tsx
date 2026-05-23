"use client";

import React, { useRef, useEffect } from "react";
import type { FinancialHealth, AnalystTrend, StockMarketData, OptionsChain, EarningsCalendar, WheelRecommendation, PositionTransaction, OptionsOrder, EmaPullbackSignal } from "@/lib/types";
import { getRecommendations } from "@/lib/api";
import { healthScoreBadgeColor, verdictBadgeColor, fmtCurrency, fmtSignedCurrency, fmtShares, fmtPct } from "@/lib/format";
import TechnicalsPanel from "./TechnicalsPanel";

interface TradeDetailModalProps {
  ticker: string;
  onClose: () => void;
  watchBatch: {
    financials: Record<string, FinancialHealth>;
    analyst_trends: Record<string, AnalystTrend[]>;
    market_data: Record<string, StockMarketData>;
    earnings_calendar: Record<string, EarningsCalendar[]>;
  };
  watchDetailTab: "position" | "option" | "order" | "technicals";
  setWatchDetailTab: (tab: "position" | "option" | "order" | "technicals") => void;
  watchOptionsSubTab: "chain" | "recommendation";
  setWatchOptionsSubTab: (tab: "chain" | "recommendation") => void;
  watchOptionsExp: string | null;
  setWatchOptionsExp: (exp: string | null) => void;
  watchOptions: OptionsChain | null;
  watchOptionsLoading: boolean;
  watchRecs: WheelRecommendation[];
  setWatchRecs: (recs: WheelRecommendation[]) => void;
  watchRecsLoading: boolean;
  setWatchRecsLoading: (loading: boolean) => void;
  watchTechnicals: EmaPullbackSignal | null;
  watchTechnicalsLoading: boolean;
  positions: Record<string, PositionTransaction[]>;
  setPositions: React.Dispatch<React.SetStateAction<Record<string, PositionTransaction[]>>>;
  orders: OptionsOrder[];
  setOrders: React.Dispatch<React.SetStateAction<OptionsOrder[]>>;
  addOrder: (order: Omit<OptionsOrder, "id" | "status" | "created_at">) => void;
  openCloseModal: (order: OptionsOrder) => void;
}

export default function TradeDetailModal({
  ticker,
  onClose,
  watchBatch,
  watchDetailTab,
  setWatchDetailTab,
  watchOptionsSubTab,
  setWatchOptionsSubTab,
  watchOptionsExp,
  setWatchOptionsExp,
  watchOptions,
  watchOptionsLoading,
  watchRecs,
  setWatchRecs,
  watchRecsLoading,
  setWatchRecsLoading,
  watchTechnicals,
  watchTechnicalsLoading,
  positions,
  setPositions,
  orders,
  setOrders,
  addOrder,
  openCloseModal,
}: TradeDetailModalProps) {
  const optionsChainRef = useRef<HTMLDivElement>(null);
  const optionsPriceDividerRef = useRef<HTMLTableRowElement>(null);
  const selectedWatch = ticker;

  // Auto-scroll options chain to current price divider
  useEffect(() => {
    if (watchDetailTab === "option" && !watchOptionsLoading && optionsChainRef.current && optionsPriceDividerRef.current) {
      requestAnimationFrame(() => {
        const container = optionsChainRef.current;
        const divider = optionsPriceDividerRef.current;
        if (container && divider) {
          const containerRect = container.getBoundingClientRect();
          const dividerRect = divider.getBoundingClientRect();
          const offset = dividerRect.top - containerRect.top - containerRect.height / 2;
          container.scrollTop += offset;
        }
      });
    }
  }, [watchOptionsExp, watchDetailTab, watchOptionsLoading]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[90vw] max-w-4xl h-[75vh] bg-[#0d1117] border border-[#30363d] rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal header */}
        <div className="bg-[#161b22] px-6 py-4 border-b border-[#21262d] shrink-0">
          {(() => {
            const md = watchBatch.market_data[selectedWatch];
            const health = watchBatch.financials[selectedWatch];
            return (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center">
                    <span className="text-sm font-bold text-[#c9d1d9]">{selectedWatch.slice(0, 2)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-bold text-[#f0f6fc] tracking-tight">{selectedWatch}</h2>
                      {health && (
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${healthScoreBadgeColor(health.health_score)}`}>
                          <span className="tabular-nums">{health.health_score}</span>
                          <span className="opacity-60">/100</span>
                        </div>
                      )}
                      {health?.verdict && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${verdictBadgeColor(health.verdict)}`}>
                          {health.verdict}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {health?.name && (
                        <span className="text-xs text-[#8b949e]">{health.name}</span>
                      )}
                      {health?.sector && (
                        <><span className="text-[#30363d]">·</span><span className="text-xs text-[#8b949e]">{health.sector}</span></>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {md && (
                    <div className="text-right">
                      <span className="text-lg font-bold text-[#f0f6fc] tabular-nums">${md.price.toFixed(2)}</span>
                      <div className="flex items-center gap-3 mt-0.5">
                        <div className="text-[10px] text-[#8b949e]">
                          <span className="text-[#484f58]">52W </span>
                          <span className="tabular-nums">${md.week52_low.toFixed(0)} – ${md.week52_high.toFixed(0)}</span>
                        </div>
                        {health?.trailing_pe != null && (
                          <>
                            <span className="text-[#30363d]">·</span>
                            <div className="text-[10px] text-[#8b949e]">
                              <span className="text-[#484f58]">P/E </span>
                              <span className="tabular-nums">{health.trailing_pe.toFixed(1)}</span>
                            </div>
                          </>
                        )}
                        {health?.revenue_growth != null && (
                          <>
                            <span className="text-[#30363d]">·</span>
                            <div className="text-[10px] text-[#8b949e]">
                              <span className="text-[#484f58]">Rev </span>
                              <span className={`tabular-nums ${health.revenue_growth >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                                {health.revenue_growth >= 0 ? "+" : ""}{(health.revenue_growth * 100).toFixed(1)}%
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="h-5 w-px bg-[#21262d]" />
                  <button onClick={onClose} className="p-2 rounded-lg text-[#484f58] hover:text-[#f0f6fc] hover:bg-[#21262d] transition-all" title="Close">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
        {/* Detail sub-tabs — underline style */}
        <div className="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-[#21262d] bg-[#161b22]/50 overflow-x-auto shrink-0">
          {(["position", "option", "order", "technicals"] as const).map((tab) => {
            const label = { position: "Position", option: "Options", order: "Contracts", technicals: "Technicals" }[tab];
            const icon = {
              position: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>,
              option: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>,
              order: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>,
              technicals: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
            }[tab];
            const isTabActive = watchDetailTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setWatchDetailTab(tab)}
                className={`relative whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-0 ${
                  isTabActive
                    ? "text-[#f0f6fc]"
                    : "text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                {icon}
                {label}
                {tab === "order" && (() => { const oc = orders.filter(o => o.ticker === selectedWatch && o.status === "open").length; return oc > 0 ? <span className="text-[8px] font-bold tabular-nums text-[#58a6ff] bg-[#58a6ff]/10 rounded-full px-1.5 py-0.5 leading-none">{oc}</span> : null; })()}
                {isTabActive && <span className="absolute bottom-0 inset-x-1.5 h-[2px] rounded-full bg-[#d29922]" />}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-4 bg-[#0d1117] flex-1 min-h-0 flex flex-col overflow-y-auto">

          {/* ── Position tab ── */}
          {watchDetailTab === "position" && (() => {
            const md = watchBatch.market_data[selectedWatch];
            const txns = positions[selectedWatch] || [];
            const today = new Date().toISOString().slice(0, 10);
            const defaultPrice = md ? md.price : 0;

            const addTxn = (e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              const txn: PositionTransaction = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                type: fd.get("type") as "buy" | "sell",
                date: fd.get("date") as string,
                quantity: parseFloat(fd.get("quantity") as string),
                price: parseFloat(fd.get("price") as string),
              };
              if (!txn.quantity || txn.quantity <= 0 || !txn.price || txn.price <= 0) return;
              setPositions(prev => ({ ...prev, [selectedWatch]: [...(prev[selectedWatch] || []), txn] }));
              form.reset();
              (form.elements.namedItem("type") as HTMLSelectElement).value = "";
              (form.elements.namedItem("date") as HTMLInputElement).value = today;
              (form.elements.namedItem("quantity") as HTMLInputElement).value = "";
              (form.elements.namedItem("price") as HTMLInputElement).value = defaultPrice > 0 ? defaultPrice.toFixed(2) : "";
            };

            const deleteTxn = (id: string) => {
              setPositions(prev => {
                const updated = (prev[selectedWatch] || []).filter(t => t.id !== id);
                return { ...prev, [selectedWatch]: updated };
              });
            };

            const buyTxns = txns.filter(t => t.type === "buy");
            const sellTxns = txns.filter(t => t.type === "sell");
            const totalBuyQty = buyTxns.reduce((s, t) => s + t.quantity, 0);
            const totalSellQty = sellTxns.reduce((s, t) => s + t.quantity, 0);
            const totalBuyCost = buyTxns.reduce((s, t) => s + t.quantity * t.price, 0);
            const totalSellProceeds = sellTxns.reduce((s, t) => s + t.quantity * t.price, 0);
            const avgBuyPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
            const netShares = totalBuyQty - totalSellQty;
            const netCashFlow = totalSellProceeds - totalBuyCost;
            const marketValue = netShares * (md?.price ?? 0);
            const costBasis = netShares * avgBuyPrice;
            const unrealizedPnL = marketValue - costBasis;
            const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

            const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

            return (
              <div className="space-y-3 p-1">
                {/* ── Position Summary Card ── */}
                {netShares > 0 && md && (
                  <div className="border border-[#21262d] rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-[#161b22] px-4 py-2.5 border-b border-[#21262d] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-[#8b949e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 3 3 4-4" /></svg>
                        <span className="text-[10px] text-[#8b949e] uppercase tracking-widest font-semibold">Position Summary</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${unrealizedPnL >= 0 ? "bg-[#238636]/15 text-[#3fb950]" : "bg-[#da3633]/15 text-[#f85149]"}`}>
                        {fmtPct(unrealizedPnLPct)}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 divide-x divide-[#21262d] bg-gradient-to-b from-[#0d1117] to-[#161b22]/30">
                      <div className="px-4 py-3 text-center">
                        <p className="text-[9px] text-[#484f58] uppercase tracking-wide font-medium mb-1">Shares</p>
                        <p className="text-sm font-bold text-[#f0f6fc] tabular-nums">{fmtShares(netShares)}</p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-[9px] text-[#484f58] uppercase tracking-wide font-medium mb-1">Avg Cost</p>
                        <p className="text-sm font-bold text-[#f0f6fc] tabular-nums">{fmtCurrency(avgBuyPrice)}</p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-[9px] text-[#484f58] uppercase tracking-wide font-medium mb-1">Mkt Value</p>
                        <p className="text-sm font-bold text-[#f0f6fc] tabular-nums">{fmtCurrency(marketValue)}</p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-[9px] text-[#484f58] uppercase tracking-wide font-medium mb-1">Unrealized P&L</p>
                        <p className={`text-sm font-bold tabular-nums ${unrealizedPnL >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{fmtSignedCurrency(unrealizedPnL)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Inline Add Form ── */}
                <form onSubmit={addTxn} className="border border-[#21262d] rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-[#161b22] px-4 py-2.5 border-b border-[#21262d] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
                      <span className="text-[10px] text-[#8b949e] uppercase tracking-widest font-semibold">New Transaction</span>
                    </div>
                  </div>
                  <div className="flex items-end gap-2.5 px-4 py-3.5 bg-gradient-to-b from-[#0d1117] to-[#161b22]/30">
                    <div className="flex-none w-[72px]">
                      <label className="text-[9px] text-[#8b949e] font-medium block mb-1">Type</label>
                      <select
                        name="type"
                        defaultValue=""
                        className="w-full rounded-md border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2 py-1.5 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-all"
                        required
                      >
                        <option value="" disabled>Select</option>
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[9px] text-[#8b949e] font-medium block mb-1">Date</label>
                      <input
                        name="date"
                        type="date"
                        defaultValue={today}
                        className="w-full rounded-md border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2 py-1.5 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-all"
                      />
                    </div>
                    <div className="flex-none w-[72px]">
                      <label className="text-[9px] text-[#8b949e] font-medium block mb-1">Shares</label>
                      <input
                        name="quantity"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0"
                        required
                        className="w-full rounded-md border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2 py-1.5 tabular-nums focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-all"
                      />
                    </div>
                    <div className="flex-none w-[88px]">
                      <label className="text-[9px] text-[#8b949e] font-medium block mb-1">Price</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[#484f58]">$</span>
                        <input
                          name="price"
                          type="number"
                          min="0.01"
                          step="0.01"
                          defaultValue={defaultPrice > 0 ? defaultPrice.toFixed(2) : ""}
                          placeholder="0.00"
                          required
                          className="w-full rounded-md border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] pl-5 pr-2 py-1.5 tabular-nums focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-all"
                        />
                      </div>
                    </div>
                    <div className="flex-none flex items-center gap-1.5 pt-5">
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-[11px] font-semibold text-white transition-all shadow-sm hover:shadow-md hover:shadow-[#238636]/20 flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        Add
                      </button>
                      <button
                        type="reset"
                        className="px-2.5 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[11px] font-medium text-[#8b949e] hover:text-[#c9d1d9] transition-all flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        Clear
                      </button>
                    </div>
                  </div>
                </form>

                {/* ── Transactions Ledger ── */}
                {txns.length > 0 ? (
                  <div className="border border-[#21262d] rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-[#161b22] px-4 py-2.5 border-b border-[#21262d] flex items-center justify-between">
                      <span className="text-[10px] text-[#8b949e] uppercase tracking-widest font-semibold">Transaction History</span>
                      <span className="text-[9px] text-[#484f58] bg-[#21262d] px-2 py-0.5 rounded-full tabular-nums">{txns.length} {txns.length === 1 ? "entry" : "entries"}</span>
                    </div>
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="bg-[#0d1117]/60 text-[#484f58]">
                          <th className="px-2.5 py-1.5 text-left font-medium w-12"></th>
                          <th className="px-2.5 py-1.5 text-left font-medium">Date</th>
                          <th className="px-2.5 py-1.5 text-right font-medium">Shares</th>
                          <th className="px-2.5 py-1.5 text-right font-medium">Price</th>
                          <th className="px-2.5 py-1.5 text-right font-medium">Total</th>
                          <th className="w-7 px-1 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((t) => {
                          const isBuy = t.type === "buy";
                          return (
                            <tr key={t.id} className="border-t border-[#21262d]/40 hover:bg-[#161b22]/60 transition-colors group">
                              <td className="px-2.5 py-1.5">
                                <span className={`inline-flex items-center justify-center w-10 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                                  isBuy ? "bg-[#238636]/15 text-[#3fb950]" : "bg-[#da3633]/15 text-[#f85149]"
                                }`}>
                                  {t.type}
                                </span>
                              </td>
                              <td className="px-2.5 py-1.5 text-[#8b949e] tabular-nums">{t.date}</td>
                              <td className={`px-2.5 py-1.5 text-right tabular-nums font-medium ${isBuy ? "text-[#3fb950]" : "text-[#f85149]"}`}>{isBuy ? "+" : "-"}{fmtShares(t.quantity)}</td>
                              <td className="px-2.5 py-1.5 text-right text-[#c9d1d9] tabular-nums">{fmtCurrency(t.price)}</td>
                              <td className={`px-2.5 py-1.5 text-right tabular-nums font-semibold ${isBuy ? "text-[#f85149]" : "text-[#3fb950]"}`}>{isBuy ? "-" : "+"}{fmtCurrency(t.quantity * t.price)}</td>
                              <td className="px-1 py-1.5 text-center">
                                <button
                                  onClick={() => deleteTxn(t.id)}
                                  className="opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-[#f85149] transition-all p-0.5"
                                  title="Delete"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#30363d] bg-[#161b22]/80">
                          <td className="px-2.5 py-2 text-[9px] font-bold text-[#8b949e] uppercase" colSpan={2}>Net Position</td>
                          <td className={`px-2.5 py-2 text-right tabular-nums font-bold ${netShares > 0 ? "text-[#f0f6fc]" : netShares < 0 ? "text-[#f85149]" : "text-[#484f58]"}`}>{fmtShares(netShares)}</td>
                          <td className="px-2.5 py-2 text-right text-[#8b949e] tabular-nums">{avgBuyPrice > 0 ? fmtCurrency(avgBuyPrice) : "—"}</td>
                          <td className={`px-2.5 py-2 text-right tabular-nums font-bold ${netCashFlow >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                            {fmtSignedCurrency(netCashFlow)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 border border-dashed border-[#21262d] rounded-xl bg-[#161b22]/20">
                    <div className="w-10 h-10 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                      </svg>
                    </div>
                    <p className="text-[11px] text-[#8b949e] font-medium">No transactions for {selectedWatch}</p>
                    <p className="text-[10px] text-[#484f58]">Add a buy or sell above to start tracking your position</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Option tab ── */}
          {watchDetailTab === "option" && (() => {
            return (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Sub-tabs */}
                <div className="tab-group mb-3">
                  {([{ key: "chain" as const, label: "Chain" }, { key: "recommendation" as const, label: "Recommendation" }]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setWatchOptionsSubTab(key)}
                      className={`tab-btn ${
                        watchOptionsSubTab === key
                          ? "bg-[#30363d] text-[#c9d1d9]"
                          : "text-[#8b949e] hover:text-[#c9d1d9]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Chain sub-tab */}
                {watchOptionsSubTab === "chain" && (() => {
            if (watchOptionsLoading) {
              return (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                  <div className="w-10 h-10 rounded-full border-2 border-[#30363d] border-t-[#d29922] animate-spin" />
                  <p className="text-xs text-[#8b949e] font-medium">Loading options chain…</p>
                </div>
              );
            }
            if (!watchOptions || watchOptions.contracts.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                  <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-[#8b949e]">No options data</p>
                    <p className="text-[10px] text-[#484f58] mt-0.5">Options chain not available for {selectedWatch}</p>
                  </div>
                </div>
              );
            }
            // Group by expiration
            const byExp: Record<string, typeof watchOptions.contracts> = {};
            for (const c of watchOptions.contracts) {
              (byExp[c.expiration] ??= []).push(c);
            }
            const expirations = Object.keys(byExp).sort();
            const activeExp = watchOptionsExp && expirations.includes(watchOptionsExp) ? watchOptionsExp : expirations[0] ?? null;
            const activeContracts = activeExp ? byExp[activeExp] : [];
            const calls = activeContracts.filter(c => c.option_type === "CALL").sort((a, b) => a.strike - b.strike);
            const puts = activeContracts.filter(c => c.option_type === "PUT").sort((a, b) => a.strike - b.strike);
            return (
              <div className="flex gap-2 flex-1 min-h-0">
                {/* Left: Expiration selector */}
                <div className="w-28 shrink-0 rounded border border-[#21262d] overflow-hidden flex flex-col bg-[#0d1117]">
                  <div className="px-2 py-1.5 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between">
                    <span className="text-[9px] font-semibold text-[#c9d1d9] uppercase tracking-wide">Expirations</span>
                    <span className="text-[8px] text-[#484f58] bg-[#21262d] px-1.5 py-0.5 rounded-full tabular-nums">{expirations.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {expirations.map((exp) => {
                      const dte = byExp[exp][0]?.dte ?? 0;
                      const count = byExp[exp].length;
                      const isActive = exp === activeExp;
                      return (
                        <div
                          key={exp}
                          onClick={() => setWatchOptionsExp(exp)}
                          className={`px-2 py-1.5 cursor-pointer transition-colors border-b border-[#21262d]/30 border-l-2 ${
                            isActive
                              ? "bg-[#161b22] border-l-[#58a6ff]"
                              : "border-l-transparent hover:bg-[#161b22]/50"
                          }`}
                        >
                          <div className={`text-[10px] font-medium tabular-nums ${isActive ? "text-[#f0f6fc]" : "text-[#c9d1d9]"}`}>{exp}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[8px] tabular-nums ${isActive ? "text-[#d29922]" : "text-[#484f58]"}`}>{dte}d</span>
                            <span className="text-[8px] text-[#484f58]">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Option chain */}
                <div className="flex-1 min-w-0 min-h-0 rounded border border-[#21262d] overflow-hidden flex flex-col bg-[#0d1117]">
                  {activeExp ? (
                    <>
                      <div className="px-2 py-1.5 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-[#f0f6fc] tabular-nums">{activeExp}</span>
                          <span className="text-[8px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded font-medium tabular-nums">{activeContracts[0]?.dte ?? "—"} DTE</span>
                        </div>
                        <div className="flex items-center gap-3 text-[9px] text-[#484f58]">
                          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]"></span>{calls.length} calls</span>
                          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#f85149]"></span>{puts.length} puts</span>
                          <span className="text-[#8b949e] font-medium tabular-nums">${watchOptions.underlying_price.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto" ref={optionsChainRef}>
                        {(() => {
                          const price = watchOptions.underlying_price;
                          const callMap = new Map(calls.map(c => [c.strike, c]));
                          const putMap = new Map(puts.map(c => [c.strike, c]));
                          const allStrikes = [...new Set([...calls.map(c => c.strike), ...puts.map(c => c.strike)])].sort((a, b) => a - b);
                          let priceIdx = allStrikes.findIndex(s => s >= price);
                          if (priceIdx === -1) priceIdx = allStrikes.length;
                          return (
                            <table className="w-full text-[9px] border-collapse table-fixed">
                              <colgroup>
                                <col className="w-[3%]" />{/* + Call */}
                                <col className="w-[9%]" />{/* OI */}
                                <col className="w-[7%]" />{/* Vol */}
                                <col className="w-[7%]" />{/* IV */}
                                <col className="w-[9%]" />{/* Bid */}
                                <col className="w-[9%]" />{/* Ask */}
                                <col className="w-[10%]" />{/* Strike */}
                                <col className="w-[9%]" />{/* Bid */}
                                <col className="w-[9%]" />{/* Ask */}
                                <col className="w-[7%]" />{/* IV */}
                                <col className="w-[7%]" />{/* Vol */}
                                <col className="w-[9%]" />{/* OI */}
                                <col className="w-[3%]" />{/* + Put */}
                              </colgroup>
                              <thead className="sticky top-0 z-10">
                                <tr className="bg-[#161b22]">
                                  <th className="px-1 py-1.5 border-b border-[#21262d]"></th>
                                  <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">OI</th>
                                  <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">Vol</th>
                                  <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">IV</th>
                                  <th className="px-2 py-1.5 text-right text-[#3fb950]/70 font-semibold border-b border-[#21262d]">Bid</th>
                                  <th className="px-2 py-1.5 text-right text-[#3fb950]/70 font-semibold border-b border-r border-[#21262d]">Ask</th>
                                  <th className="px-2 py-1.5 text-center text-[#c9d1d9] font-bold border-b border-r border-[#21262d] bg-[#161b22]">Strike</th>
                                  <th className="px-2 py-1.5 text-right text-[#f85149]/70 font-semibold border-b border-[#21262d]">Bid</th>
                                  <th className="px-2 py-1.5 text-right text-[#f85149]/70 font-semibold border-b border-[#21262d]">Ask</th>
                                  <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">IV</th>
                                  <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">Vol</th>
                                  <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">OI</th>
                                  <th className="px-1 py-1.5 border-b border-[#21262d]"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {allStrikes.map((strike, i) => {
                                  const call = callMap.get(strike);
                                  const put = putMap.get(strike);
                                  const callItm = strike < price;
                                  const putItm = strike > price;
                                  const atm = !callItm && !putItm && Math.abs(strike - price) === Math.min(...allStrikes.map(s => Math.abs(s - price)));
                                  const rows: React.ReactNode[] = [];
                                  if (i === priceIdx) {
                                    rows.push(
                                      <tr key="price-divider" ref={optionsPriceDividerRef}>
                                        <td colSpan={10} className="h-0 p-0 relative">
                                          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#d29922]/40"></div>
                                          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0d1117] px-2 py-0.5 rounded-full border border-[#d29922]/30 text-[9px] font-bold text-[#d29922] tabular-nums whitespace-nowrap">
                                            ${price.toFixed(2)}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }
                                  rows.push(
                                    <tr
                                      key={strike}
                                      className={`border-b border-[#21262d]/20 transition-colors hover:bg-[#161b22]/60 ${
                                        atm ? "bg-[#d29922]/[0.03]" : callItm ? "bg-[#3fb950]/[0.03]" : putItm ? "bg-[#f85149]/[0.03]" : ""
                                      }`}
                                    >
                                      {call ? (<>
                                        <td className="px-0.5 py-1 text-center">
                                          <button
                                            onClick={() => addOrder({ ticker: call.ticker, option_type: "CALL", leg: "CC", strike: call.strike, expiration: call.expiration, contracts: 1, premium: (call.bid + call.ask) / 2 })}
                                            className="w-5 h-5 rounded bg-[#3fb950]/10 hover:bg-[#3fb950]/25 text-[#3fb950] text-[10px] font-bold transition-colors" title="Create call contract"
                                          >+</button>
                                        </td>
                                        <td className="px-2 py-1 text-right text-[#484f58] tabular-nums">{call.open_interest.toLocaleString()}</td>
                                        <td className="px-2 py-1 text-right text-[#484f58] tabular-nums">{call.volume?.toLocaleString() ?? "—"}</td>
                                        <td className="px-2 py-1 text-right text-[#6e7681] tabular-nums">{(call.implied_volatility * 100).toFixed(0)}%</td>
                                        <td className={`px-2 py-1 text-right tabular-nums font-medium ${callItm ? "text-[#f0f6fc]" : "text-[#8b949e]"}`}>{call.bid.toFixed(2)}</td>
                                        <td className={`px-2 py-1 text-right tabular-nums font-medium border-r border-[#21262d] ${callItm ? "text-[#f0f6fc]" : "text-[#8b949e]"}`}>{call.ask.toFixed(2)}</td>
                                      </>) : (
                                        <td colSpan={6} className="border-r border-[#21262d]"></td>
                                      )}
                                      <td className={`px-2 py-1 text-center font-bold tabular-nums border-r border-[#21262d] ${atm ? "text-[#d29922]" : "text-[#c9d1d9]"}`}>
                                        {strike.toFixed(1)}
                                      </td>
                                      {put ? (<>
                                        <td className={`px-2 py-1 text-right tabular-nums font-medium ${putItm ? "text-[#f0f6fc]" : "text-[#8b949e]"}`}>{put.bid.toFixed(2)}</td>
                                        <td className={`px-2 py-1 text-right tabular-nums font-medium ${putItm ? "text-[#f0f6fc]" : "text-[#8b949e]"}`}>{put.ask.toFixed(2)}</td>
                                        <td className="px-2 py-1 text-right text-[#6e7681] tabular-nums">{(put.implied_volatility * 100).toFixed(0)}%</td>
                                        <td className="px-2 py-1 text-right text-[#484f58] tabular-nums">{put.volume?.toLocaleString() ?? "—"}</td>
                                        <td className="px-2 py-1 text-right text-[#484f58] tabular-nums">{put.open_interest.toLocaleString()}</td>
                                        <td className="px-0.5 py-1 text-center">
                                          <button
                                            onClick={() => addOrder({ ticker: put.ticker, option_type: "PUT", leg: "CSP", strike: put.strike, expiration: put.expiration, contracts: 1, premium: (put.bid + put.ask) / 2 })}
                                            className="w-5 h-5 rounded bg-[#f85149]/10 hover:bg-[#f85149]/25 text-[#f85149] text-[10px] font-bold transition-colors" title="Create put contract"
                                          >+</button>
                                        </td>
                                      </>) : (
                                        <td colSpan={6}></td>
                                      )}
                                    </tr>
                                  );
                                  return rows;
                                })}
                                {priceIdx === allStrikes.length && (
                                  <tr>
                                    <td colSpan={10} className="h-0 p-0 relative">
                                      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#d29922]/40"></div>
                                      <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0d1117] px-2 py-0.5 rounded-full border border-[#d29922]/30 text-[9px] font-bold text-[#d29922] tabular-nums whitespace-nowrap">
                                        ${watchOptions.underlying_price.toFixed(2)}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[11px] text-[#484f58]">Select an expiration date</div>
                  )}
                </div>
              </div>
            );
          })()}

                {/* Recommendation sub-tab */}
                {watchOptionsSubTab === "recommendation" && (() => {
                  const tickerPositions = positions[ticker] || [];
                  const netShares = tickerPositions.reduce((sum, t) => sum + (t.type === "buy" ? t.quantity : -t.quantity), 0);
                  const avgCost = (() => {
                    let totalQty = 0, totalCost = 0;
                    for (const t of tickerPositions) {
                      if (t.type === "buy") { totalQty += t.quantity; totalCost += t.quantity * t.price; }
                    }
                    return totalQty > 0 ? totalCost / totalQty : 0;
                  })();
                  const positionHoldings = netShares > 0 ? [{
                    id: crypto.randomUUID(),
                    ticker,
                    shares: netShares,
                    cost_basis: avgCost,
                    current_price: watchBatch.market_data[ticker]?.price ?? 0,
                  }] : [];
                  const runRecs = async (dteMin: number, dteMax: number, minOi: number, assignPct: number) => {
                    setWatchRecsLoading(true);
                    try {
                      const result = await getRecommendations({
                        inventory: positionHoldings.length > 0 ? { holdings: positionHoldings } : undefined,
                        tickers: [ticker],
                        available_cash: 100000,
                        dte_min: dteMin,
                        dte_max: dteMax,
                        min_open_interest: minOi,
                        cc_max_assignment_pct: assignPct / 100,
                        csp_max_assignment_pct: assignPct / 100,
                        earnings_calendar: watchBatch.earnings_calendar[ticker] || undefined,
                        analyst_trends: watchBatch.analyst_trends[ticker] ? [watchBatch.analyst_trends[ticker] as unknown as AnalystTrend].flat() : undefined,
                      });
                      setWatchRecs(result.recommendations ?? []);
                    } catch {
                      setWatchRecs([]);
                    } finally {
                      setWatchRecsLoading(false);
                    }
                  };
                  const ccRecs = watchRecs.filter(r => r.leg === "covered_call");
                  const cspRecs = watchRecs.filter(r => r.leg === "cash_secured_put");
                  return (
                    <div className="flex flex-col h-full min-h-0">
                      {/* Filter bar */}
                      <form
                        className="flex items-end gap-3 p-3 border border-[#21262d] rounded-xl bg-[#161b22]/50 mb-4 shrink-0"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          runRecs(
                            parseInt(fd.get("dte_min") as string) || 14,
                            parseInt(fd.get("dte_max") as string) || 45,
                            parseInt(fd.get("min_oi") as string) || 100,
                            parseInt(fd.get("assign_pct") as string) || 30,
                          );
                        }}
                      >
                        <div>
                          <label className="block text-[9px] text-[#8b949e] font-medium uppercase tracking-wider mb-1.5">DTE Min</label>
                          <input name="dte_min" type="number" defaultValue={14} className="w-16 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[11px] text-[#c9d1d9] tabular-nums focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-all" />
                        </div>
                        <div>
                          <label className="block text-[9px] text-[#8b949e] font-medium uppercase tracking-wider mb-1.5">DTE Max</label>
                          <input name="dte_max" type="number" defaultValue={45} className="w-16 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[11px] text-[#c9d1d9] tabular-nums focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-all" />
                        </div>
                        <div>
                          <label className="block text-[9px] text-[#8b949e] font-medium uppercase tracking-wider mb-1.5">Min OI</label>
                          <input name="min_oi" type="number" defaultValue={100} className="w-20 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[11px] text-[#c9d1d9] tabular-nums focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-all" />
                        </div>
                        <div>
                          <label className="block text-[9px] text-[#8b949e] font-medium uppercase tracking-wider mb-1.5">Max Assign %</label>
                          <input name="assign_pct" type="number" defaultValue={30} min={1} max={100} className="w-16 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[11px] text-[#c9d1d9] tabular-nums focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 transition-all" />
                        </div>
                        <button
                          type="submit"
                          disabled={watchRecsLoading}
                          className="px-4 py-1.5 text-[11px] font-semibold rounded-md bg-[#238636] text-white hover:bg-[#2ea043] transition-all shadow-sm hover:shadow-md hover:shadow-[#238636]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {watchRecsLoading ? (
                            <><div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />Running…</>
                          ) : (
                            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>Generate</>
                          )}
                        </button>
                      </form>

                      {/* Results */}
                      <div className="flex-1 overflow-y-auto">
                        {watchRecsLoading ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <div className="w-8 h-8 rounded-full border-2 border-[#30363d] border-t-[#d29922] animate-spin" />
                            <p className="text-[11px] text-[#8b949e]">Analyzing {ticker}…</p>
                          </div>
                        ) : watchRecs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-2">
                            <p className="text-[11px] text-[#484f58]">Click Generate to find optimal trades for {ticker}</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {/* Unified recommendations table */}
                            <div className="border border-[#21262d] rounded overflow-hidden">
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="bg-[#161b22] text-[#484f58]">
                                    <th className="px-2 py-1.5 text-center font-medium">#</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Type</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Contracts</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Strike</th>
                                    <th className="px-2 py-1.5 text-right font-medium">OTM %</th>
                                    <th className="px-2 py-1.5 text-right font-medium">DTE</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Delta</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Bid</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Mid</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Premium</th>
                                    <th className="px-2 py-1.5 text-right font-medium">IV</th>
                                    <th className="px-2 py-1.5 text-right font-medium">ROC</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Quality</th>
                                    <th className="px-2 py-1.5 text-right font-medium">OI</th>
                                    <th className="w-8 px-1 py-1.5"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* CC section */}
                                  {ccRecs.length > 0 && (
                                    <tr className="bg-[#58a6ff]/5">
                                      <td colSpan={15} className="px-2 py-1 text-[9px] font-bold text-[#58a6ff] uppercase tracking-widest">
                                        <span className="inline-flex items-center gap-2">
                                          Covered Calls — {ccRecs.reduce((s, r) => s + (r.contracts_allocated ?? 1), 0)} contracts · {ccRecs.reduce((s, r) => s + (r.contracts_allocated ?? 1), 0) * 100} shares
                                          {ccRecs[0]?.trend_score != null && (
                                            <span className={`inline-block text-[8px] font-bold tabular-nums px-1.5 py-0.5 rounded ${ccRecs[0].trend_score > 2 ? "bg-[#3fb950]/15 text-[#3fb950]" : ccRecs[0].trend_score < -2 ? "bg-[#f85149]/15 text-[#f85149]" : "bg-[#21262d] text-[#8b949e]"}`} title={ccRecs[0].trend_signal || ""}>
                                              Trend {ccRecs[0].trend_score > 0 ? "+" : ""}{ccRecs[0].trend_score.toFixed(1)}
                                            </span>
                                          )}
                                        </span>
                                      </td>
                                    </tr>
                                  )}
                                  {ccRecs.map((r, i) => {
                                    const contracts = r.contracts_allocated ?? 1;
                                    const mid = (r.contract.bid > 0 && r.contract.ask > 0) ? (r.contract.bid + r.contract.ask) / 2 : r.contract.last;
                                    const otm = ((r.contract.strike - r.contract.underlying_price) / r.contract.underlying_price) * 100;
                                    const label = Math.abs(r.contract.delta) <= 0.24 ? "Consrv" : Math.abs(r.contract.delta) >= 0.29 ? "Aggrss" : "Modrt";
                                    return (
                                      <tr key={`cc-${i}`} className="border-t border-[#21262d]/30 hover:bg-[#161b22]/60 transition-colors">
                                        <td className="px-2 py-1.5 text-center text-[#484f58] tabular-nums">{i + 1}</td>
                                        <td className="px-2 py-1.5 font-medium">
                                          <span className="text-[#58a6ff]">CC</span>
                                          {ccRecs.length > 1 && <span className="text-[#484f58] ml-1 text-[9px]">{label}</span>}
                                          {r.earnings_warning && <span className="ml-1 text-[#d29922]" title="Earnings warning">⚠</span>}
                                        </td>
                                        <td className="px-2 py-1.5 text-right text-[#c9d1d9] tabular-nums">{contracts}</td>
                                        <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">${r.contract.strike.toFixed(1)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{otm.toFixed(1)}%</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.dte}d</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.delta.toFixed(2)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.bid.toFixed(2)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">{mid.toFixed(2)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#3fb950] font-semibold tabular-nums">${(mid * contracts * 100).toFixed(0)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{(r.contract.implied_volatility * 100).toFixed(0)}%</td>
                                        <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${r.annualised_roc >= 20 ? "text-[#3fb950]" : r.annualised_roc >= 12 ? "text-[#d29922]" : "text-[#8b949e]"}`}>{r.annualised_roc.toFixed(1)}%</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                          <span className={`inline-block w-10 text-center px-1 py-0.5 rounded text-[9px] font-bold ${r.quality_score >= 70 ? "bg-[#3fb950]/15 text-[#3fb950]" : r.quality_score >= 40 ? "bg-[#d29922]/15 text-[#d29922]" : "bg-[#21262d] text-[#484f58]"}`}>
                                            {r.quality_score.toFixed(0)}
                                          </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-right text-[#484f58] tabular-nums">{r.contract.open_interest.toLocaleString()}</td>
                                        <td className="px-1 py-1.5 text-center">
                                          <button
                                            onClick={() => addOrder({ ticker: r.contract.ticker, option_type: "CALL", leg: "CC", strike: r.contract.strike, expiration: r.contract.expiration, contracts, premium: (r.contract.bid + r.contract.ask) / 2 })}
                                            className="w-5 h-5 rounded bg-[#3fb950]/10 hover:bg-[#3fb950]/25 text-[#3fb950] text-[10px] font-bold transition-colors" title="Create contract"
                                          >+</button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {/* CSP section */}
                                  {cspRecs.length > 0 && (
                                    <tr className={`bg-[#d29922]/5 ${ccRecs.length > 0 ? "border-t-2 border-[#21262d]" : ""}`}>
                                      <td colSpan={15} className="px-2 py-1 text-[9px] font-bold text-[#d29922] uppercase tracking-widest">
                                        <span className="inline-flex items-center gap-2">
                                          Cash-Secured Puts — {cspRecs.length} trades
                                          {cspRecs[0]?.trend_score != null && (
                                            <span className={`inline-block text-[8px] font-bold tabular-nums px-1.5 py-0.5 rounded ${cspRecs[0].trend_score > 2 ? "bg-[#3fb950]/15 text-[#3fb950]" : cspRecs[0].trend_score < -2 ? "bg-[#f85149]/15 text-[#f85149]" : "bg-[#21262d] text-[#8b949e]"}`} title={cspRecs[0].trend_signal || ""}>
                                              Trend {cspRecs[0].trend_score > 0 ? "+" : ""}{cspRecs[0].trend_score.toFixed(1)}
                                            </span>
                                          )}
                                        </span>
                                      </td>
                                    </tr>
                                  )}
                                  {cspRecs.map((r, i) => {
                                    const mid = (r.contract.bid > 0 && r.contract.ask > 0) ? (r.contract.bid + r.contract.ask) / 2 : r.contract.last;
                                    const otm = ((r.contract.underlying_price - r.contract.strike) / r.contract.underlying_price) * 100;
                                    return (
                                      <tr key={`csp-${i}`} className="border-t border-[#21262d]/30 hover:bg-[#161b22]/60 transition-colors">
                                        <td className="px-2 py-1.5 text-center text-[#484f58] tabular-nums">{i + 1}</td>
                                        <td className="px-2 py-1.5 font-medium">
                                          <span className="text-[#d29922]">CSP</span>
                                          {r.earnings_warning && <span className="ml-1 text-[#d29922]" title="Earnings warning">⚠</span>}
                                        </td>
                                        <td className="px-2 py-1.5 text-right text-[#c9d1d9] tabular-nums">1</td>
                                        <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">${r.contract.strike.toFixed(1)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{otm.toFixed(1)}%</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.dte}d</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.delta.toFixed(2)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.bid.toFixed(2)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">{mid.toFixed(2)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#3fb950] font-semibold tabular-nums">${(mid * 100).toFixed(0)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{(r.contract.implied_volatility * 100).toFixed(0)}%</td>
                                        <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${r.annualised_roc >= 20 ? "text-[#3fb950]" : r.annualised_roc >= 12 ? "text-[#d29922]" : "text-[#8b949e]"}`}>{r.annualised_roc.toFixed(1)}%</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                          <span className={`inline-block w-10 text-center px-1 py-0.5 rounded text-[9px] font-bold ${r.quality_score >= 70 ? "bg-[#3fb950]/15 text-[#3fb950]" : r.quality_score >= 40 ? "bg-[#d29922]/15 text-[#d29922]" : "bg-[#21262d] text-[#484f58]"}`}>
                                            {r.quality_score.toFixed(0)}
                                          </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-right text-[#484f58] tabular-nums">{r.contract.open_interest.toLocaleString()}</td>
                                        <td className="px-1 py-1.5 text-center">
                                          <button
                                            onClick={() => addOrder({ ticker: r.contract.ticker, option_type: "PUT", leg: "CSP", strike: r.contract.strike, expiration: r.contract.expiration, contracts: 1, premium: mid })}
                                            className="w-5 h-5 rounded bg-[#d29922]/10 hover:bg-[#d29922]/25 text-[#d29922] text-[10px] font-bold transition-colors" title="Create contract"
                                          >+</button>
                                        </td>
                                      </tr>
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
                })()}
              </div>
            );
          })()}

          {/* ── Order tab ── */}
          {watchDetailTab === "order" && (() => {
            const tickerOrders = orders.filter(o => o.ticker === selectedWatch && o.status !== "closed");
            const currentPrice = watchBatch.market_data[selectedWatch]?.price ?? 0;
            return (
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-[#c9d1d9] uppercase tracking-widest">Active Contracts</span>
                  </div>
                  <span className="text-[9px] text-[#484f58] bg-[#21262d] px-2 py-0.5 rounded-full tabular-nums">{tickerOrders.length} {tickerOrders.length === 1 ? "order" : "orders"}</span>
                </div>
                {tickerOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 border border-dashed border-[#21262d] rounded-xl bg-[#161b22]/20">
                    <div className="w-10 h-10 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                      </svg>
                    </div>
                    <p className="text-[11px] text-[#8b949e] font-medium">No contracts yet</p>
                    <p className="text-[10px] text-[#484f58]">Use + buttons on Chain or Recommendation tabs</p>
                  </div>
                ) : (
                  <div className="border border-[#21262d] rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="bg-[#161b22] text-[#8b949e]">
                          <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider">Type</th>
                          <th className="px-3 py-2 text-right text-[9px] font-semibold uppercase tracking-wider">Strike</th>
                          <th className="px-3 py-2 text-right text-[9px] font-semibold uppercase tracking-wider">Exp</th>
                          <th className="px-3 py-2 text-right text-[9px] font-semibold uppercase tracking-wider">DTE</th>
                          <th className="px-3 py-2 text-right text-[9px] font-semibold uppercase tracking-wider">Qty</th>
                          <th className="px-3 py-2 text-right text-[9px] font-semibold uppercase tracking-wider">Premium</th>
                          <th className="px-3 py-2 text-right text-[9px] font-semibold uppercase tracking-wider">Intrinsic</th>
                          <th className="px-3 py-2 text-center text-[9px] font-semibold uppercase tracking-wider">Status</th>
                          <th className="px-2 py-2 text-center"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tickerOrders.map(o => {
                          const dte = Math.max(0, Math.ceil((new Date(o.expiration + "T00:00:00").getTime() - Date.now()) / 86400000));
                          const intrinsic = o.option_type === "CALL"
                            ? Math.max(0, currentPrice - o.strike)
                            : Math.max(0, o.strike - currentPrice);
                          return (
                            <tr key={o.id} className="border-t border-[#21262d]/30 hover:bg-[#161b22]/60 transition-colors">
                              <td className="px-3 py-2 font-medium">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${o.leg === "CC" ? "bg-[#58a6ff]/10 text-[#58a6ff]" : "bg-[#d29922]/10 text-[#d29922]"}`}>{o.leg}</span>
                                <span className="text-[#484f58] ml-1.5 text-[9px]">{o.option_type}</span>
                              </td>
                              <td className="px-3 py-2 text-right text-[#f0f6fc] font-medium tabular-nums">${o.strike.toFixed(1)}</td>
                              <td className="px-3 py-2 text-right text-[#8b949e] tabular-nums">{o.expiration}</td>
                              <td className={`px-3 py-2 text-right tabular-nums ${dte <= 7 ? "text-[#f85149] font-semibold" : dte <= 14 ? "text-[#d29922]" : "text-[#8b949e]"}`}>{dte}d</td>
                              <td className="px-3 py-1.5 text-right">
                                <input
                                  type="number"
                                  min={1}
                                  value={o.contracts}
                                  onChange={e => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setOrders(prev => prev.map(x => x.id === o.id ? { ...x, contracts: val } : x));
                                  }}
                                  className="w-12 bg-[#0d1117] border border-[#21262d] rounded-md px-1.5 py-1 text-right text-[10px] text-[#c9d1d9] tabular-nums focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 focus:outline-none transition-all"
                                />
                              </td>
                              <td className="px-3 py-2 text-right text-[#3fb950] font-semibold tabular-nums">${(o.premium * o.contracts * 100).toFixed(0)}</td>
                              <td className={`px-3 py-2 text-right tabular-nums ${intrinsic > 0 ? "text-[#f85149] font-semibold" : "text-[#484f58]"}`}>
                                {intrinsic > 0 ? `$${intrinsic.toFixed(2)}` : "OTM"}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <select
                                  value={o.status}
                                  onChange={e => {
                                    if (e.target.value === "closed" && o.status === "open") {
                                      e.target.value = "open";
                                      openCloseModal(o);
                                    }
                                  }}
                                  className={`rounded-md border border-[#21262d] bg-[#0d1117] text-[9px] font-bold px-1.5 py-1 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 cursor-pointer transition-all ${
                                    o.status === "open" ? "text-[#58a6ff]" : "text-[#484f58]"
                                  }`}
                                >
                                  <option value="open">Open</option>
                                  <option value="closed">Closed</option>
                                </select>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  onClick={() => setOrders(prev => prev.filter(x => x.id !== o.id))}
                                  className="rounded p-0.5 text-[#484f58] hover:text-[#f85149] hover:bg-[#f85149]/10 transition-colors focus:outline-none"
                                  title="Delete contract"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Technicals tab ── */}
          {watchDetailTab === "technicals" && (
            <TechnicalsPanel signal={watchTechnicals} loading={watchTechnicalsLoading} />
          )}
        </div>
      </div>
    </div>
  );
}
