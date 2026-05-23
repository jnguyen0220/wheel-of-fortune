"use client";

import { useCallback, useRef, useState } from "react";
import type { PositionTransaction } from "@/lib/types";
import { getMarketData } from "@/lib/api";
import { useLocalStorageState } from "@/lib/hooks";
import TickerLink from "./TickerLink";

export default function MyPositionsTab() {
  const [positions, setPositions] = useLocalStorageState<Record<string, PositionTransaction[]>>("wof-positions", {});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [watchlist] = useLocalStorageState<string[]>("watchlist", []);
  const [tickerMode, setTickerMode] = useState<"select" | "custom">("select");
  const [showOpenOnly, setShowOpenOnly] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);
  const tickerLookupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lookupPrice = useCallback((ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t || t.length > 10) return;
    clearTimeout(tickerLookupTimer.current);
    tickerLookupTimer.current = setTimeout(() => {
      getMarketData([t])
        .then(data => {
          const price = data[t]?.price;
          if (price && priceRef.current) {
            priceRef.current.value = price.toFixed(2);
          }
        })
        .catch(() => {});
    }, 300);
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const addTxn = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const ticker = (fd.get("ticker") as string).trim().toUpperCase();
    if (!ticker) return;
    const txn: PositionTransaction = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: fd.get("type") as "buy" | "sell",
      date: fd.get("date") as string,
      quantity: parseFloat(fd.get("quantity") as string),
      price: parseFloat(fd.get("price") as string),
    };
    if (!txn.quantity || txn.quantity <= 0 || !txn.price || txn.price <= 0) return;
    setPositions(prev => ({ ...prev, [ticker]: [...(prev[ticker] || []), txn] }));
    form.reset();
  }, [setPositions]);

  const deleteTxn = useCallback((ticker: string, id: string) => {
    setPositions(prev => {
      const updated = (prev[ticker] || []).filter(t => t.id !== id);
      const next = { ...prev, [ticker]: updated };
      if (updated.length === 0) delete next[ticker];
      return next;
    });
  }, [setPositions]);

  const toggleTicker = useCallback((ticker: string) => {
    setCollapsed(prev => ({ ...prev, [ticker]: !prev[ticker] }));
  }, []);

  // Compute summaries per ticker
  const tickers = Object.entries(positions)
    .filter(([, txns]) => txns.length > 0)
    .map(([ticker, txns]) => {
      const buyTxns = txns.filter(t => t.type === "buy");
      const sellTxns = txns.filter(t => t.type === "sell");
      const totalBuyQty = buyTxns.reduce((s, t) => s + t.quantity, 0);
      const totalSellQty = sellTxns.reduce((s, t) => s + t.quantity, 0);
      const totalBuyCost = buyTxns.reduce((s, t) => s + t.quantity * t.price, 0);
      const avgCost = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
      const netShares = totalBuyQty - totalSellQty;
      const totalSellProceeds = sellTxns.reduce((s, t) => s + t.quantity * t.price, 0);
      const realizedPnl = totalSellQty > 0 ? totalSellProceeds - totalSellQty * avgCost : 0;
      const netCashFlow = totalSellProceeds - totalBuyCost;
      const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      const lastActive = sorted.length > 0 ? sorted[0].date : "";
      return { ticker, txns: sorted, netShares, avgCost, txnCount: txns.length, lots: Math.floor(netShares / 100), realizedPnl, netCashFlow, costBasis: netShares * avgCost, lastActive };
    })
    .sort((a, b) => {
      const aOpen = a.netShares > 0 ? 0 : 1;
      const bOpen = b.netShares > 0 ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return a.ticker.localeCompare(b.ticker);
    });

  const filteredTickers = showOpenOnly ? tickers.filter(t => t.netShares > 0) : tickers;

  const totalTxns = filteredTickers.reduce((s, t) => s + t.txnCount, 0);

  const totalShares = filteredTickers.reduce((s, t) => s + t.netShares, 0);
  const totalCostBasis = filteredTickers.reduce((s, t) => s + t.costBasis, 0);
  const totalNetCashFlow = filteredTickers.reduce((s, t) => s + t.netCashFlow, 0);
  const totalLots = filteredTickers.reduce((s, t) => s + t.lots, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-1">

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-4 gap-3 mb-5 shrink-0">
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3">
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Tickers</div>
          <div className="text-lg font-bold text-[#c9d1d9] tabular-nums leading-tight">{filteredTickers.length}</div>
          <div className="text-[9px] text-[#484f58] tabular-nums mt-0.5">{totalTxns} transactions</div>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3">
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Total Shares</div>
          <div className="text-lg font-bold text-[#c9d1d9] tabular-nums leading-tight">{totalShares.toLocaleString()}</div>
          <div className="text-[9px] text-[#484f58] tabular-nums mt-0.5">{totalLots} lots</div>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3">
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Cost Basis</div>
          <div className="text-lg font-bold text-[#c9d1d9] tabular-nums leading-tight">${totalCostBasis.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3">
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Net Cash Flow</div>
          <div className={`text-lg font-bold tabular-nums leading-tight ${totalNetCashFlow >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
            {totalNetCashFlow >= 0 ? "+" : "-"}${Math.abs(totalNetCashFlow).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* ── Entry Form ── */}
      <div className="border border-[#21262d] rounded-lg overflow-hidden bg-[#0d1117] mb-5 shrink-0">
        <div
          className="bg-[#161b22] px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-[#1c2129] transition-colors"
          onClick={() => setShowForm(f => !f)}
        >
          <svg className={`w-3 h-3 text-[#8b949e] transition-transform duration-150 ${showForm ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[10px] font-semibold text-[#c9d1d9] uppercase tracking-wider">Add Transaction</span>
        </div>
        {showForm && (
        <form onSubmit={addTxn} className="border-t border-[#21262d] px-4 py-3">
          <div className="grid grid-cols-7 gap-3 items-end">
            <div>
              <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">
                Ticker
                {watchlist.length > 0 && (
                  <label className="inline-flex items-center gap-1 ml-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tickerMode === "select"}
                      onChange={(e) => setTickerMode(e.target.checked ? "select" : "custom")}
                      className="w-2.5 h-2.5 rounded border-[#30363d] bg-[#161b22] accent-[#58a6ff] cursor-pointer"
                    />
                    <span className="text-[8px] text-[#58a6ff] normal-case tracking-normal">watchlist</span>
                  </label>
                )}
              </label>
              {tickerMode === "select" && watchlist.length > 0 ? (
                <select
                  name="ticker"
                  required
                  defaultValue=""
                  onChange={(e) => lookupPrice(e.target.value)}
                  className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 font-bold focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="" disabled>Select…</option>
                  {watchlist.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input
                  name="ticker"
                  type="text"
                  placeholder="AAPL"
                  required
                  autoComplete="off"
                  onChange={(e) => lookupPrice(e.target.value)}
                  onBlur={(e) => lookupPrice(e.target.value)}
                  className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 font-bold uppercase focus:outline-none focus:border-[#58a6ff] placeholder:text-[#30363d]"
                />
              )}
            </div>
            <div>
              <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Type</label>
              <select
                name="type"
                defaultValue=""
                required
                className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff]"
              >
                <option value="" disabled>&mdash;</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Date</label>
              <input
                name="date"
                type="date"
                defaultValue={today}
                className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Qty</label>
              <input
                name="quantity"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0"
                required
                className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff] tabular-nums placeholder:text-[#30363d]"
              />
            </div>
            <div>
              <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Price</label>
              <input
                ref={priceRef}
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="$0.00"
                required
                className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff] tabular-nums placeholder:text-[#30363d]"
              />
            </div>
            <div className="col-span-2 flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded bg-[#238636] hover:bg-[#2ea043] text-[10px] text-white font-semibold px-3 py-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[#238636] inline-flex items-center justify-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add
              </button>
              <button
                type="reset"
                className="rounded border border-[#30363d] bg-transparent hover:bg-[#21262d] text-[10px] text-[#8b949e] font-medium px-2.5 py-1.5 transition-colors focus:outline-none inline-flex items-center justify-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Reset
              </button>
            </div>
          </div>
        </form>
        )}
      </div>

      {/* ── Filter ── */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showOpenOnly}
            onChange={(e) => setShowOpenOnly(e.target.checked)}
            className="w-2.5 h-2.5 rounded border-[#30363d] bg-[#161b22] accent-[#58a6ff] cursor-pointer"
          />
          <span className="text-[9px] text-[#8b949e]">Open positions only</span>
        </label>
        <span className="text-[9px] text-[#484f58]">{filteredTickers.length} of {tickers.length} tickers</span>
      </div>

      {tickers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#21262d] flex items-center justify-center">
            <svg className="w-6 h-6 text-[#30363d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] text-[#8b949e] font-medium">No positions yet</p>
            <p className="text-[9px] text-[#484f58] mt-1">Use the form above or add from the Explore tab watchlist</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
          {/* Grand totals bar */}
          <table className="w-full table-fixed text-[11px] border border-[#21262d] rounded-lg overflow-hidden bg-[#161b22] sticky top-0 z-10">
            <colgroup>
              <col style={{width: "28px"}} />
              <col />
              <col style={{width: "110px"}} />
              <col style={{width: "100px"}} />
              <col style={{width: "110px"}} />
              <col style={{width: "120px"}} />
              <col style={{width: "28px"}} />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={3} className="px-3 py-2.5 text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Grand Total</td>
                <td className="px-3 py-2.5 text-right text-[#c9d1d9] tabular-nums font-bold">{totalShares.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right text-[#8b949e] tabular-nums font-bold">${totalShares > 0 ? (totalCostBasis / totalShares).toFixed(2) : "0.00"}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${totalNetCashFlow >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{totalNetCashFlow >= 0 ? "+" : "-"}${Math.abs(totalNetCashFlow).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          {filteredTickers.map(({ ticker, txns, netShares, avgCost, txnCount, lots, realizedPnl, netCashFlow, lastActive }) => {
            const isCollapsed = collapsed[ticker] ?? true;
            return (
              <div key={ticker} className="border border-[#21262d] rounded-lg overflow-hidden bg-[#0d1117]">
                <table className="w-full table-fixed text-[11px]">
                  <colgroup>
                    <col style={{width: "28px"}} />
                    <col />
                    <col style={{width: "110px"}} />
                    <col style={{width: "100px"}} />
                    <col style={{width: "110px"}} />
                    <col style={{width: "120px"}} />
                    <col style={{width: "28px"}} />
                  </colgroup>
                  <thead>
                    {/* Ticker header row */}
                    <tr
                      className="bg-[#161b22] border-b border-[#21262d] cursor-pointer hover:bg-[#1c2129] transition-colors"
                      onClick={() => toggleTicker(ticker)}
                    >
                      <td className="pl-3 pr-0 py-2">
                        <svg className={`w-3.5 h-3.5 text-[#8b949e] transition-transform duration-150 ${!isCollapsed ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {netShares > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#3fb950]"></div>}
                          <TickerLink ticker={ticker} className="text-[12px] font-bold text-[#58a6ff] hover:underline tracking-wide cursor-pointer" />
                          <span className="text-[9px] text-[#484f58]">{txnCount} txn{txnCount !== 1 ? "s" : ""}</span>
                          {lots > 0 && <span className="text-[9px] text-[#8b949e] font-semibold">{lots} lot{lots !== 1 ? "s" : ""}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-left text-[10px] text-[#8b949e] tabular-nums">{lastActive || "—"}</td>
                      <td className="px-3 py-2 text-right text-[10px] tabular-nums">
                        <span className={`font-bold ${netShares > 0 ? "text-[#c9d1d9]" : netShares < 0 ? "text-[#f85149]" : "text-[#484f58]"}`}>{netShares.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] tabular-nums">
                        <span className="text-[#8b949e] font-bold">${avgCost.toFixed(2)}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] tabular-nums">
                        <span className={`font-bold ${netCashFlow >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{netCashFlow >= 0 ? "+" : "-"}${Math.abs(netCashFlow).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </td>
                      <td></td>
                    </tr>
                    {/* Column headers */}
                    {!isCollapsed && (
                      <tr className="bg-[#161b22]/40 border-b border-[#21262d]/60">
                        <th></th>
                        <th className="px-3 py-1.5 text-left text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Type</th>
                        <th className="px-3 py-1.5 text-left text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Date</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Shares</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Price</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Total</th>
                        <th></th>
                      </tr>
                    )}
                  </thead>
                  {!isCollapsed && (
                    <tbody>
                      {txns.map(row => (
                        <tr key={row.id} className="border-b border-[#21262d]/20 hover:bg-[#161b22]/50 transition-colors group">
                          <td></td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              row.type === "buy"
                                ? "bg-[#3fb950]/10 text-[#3fb950] border border-[#3fb950]/20"
                                : "bg-[#f85149]/10 text-[#f85149] border border-[#f85149]/20"
                            }`}>{row.type === "buy" ? "Buy" : "Sell"}</span>
                          </td>
                          <td className="px-3 py-2 text-[#8b949e] tabular-nums">{row.date}</td>
                          <td className="px-3 py-2 text-right text-[#c9d1d9] tabular-nums">{row.quantity}</td>
                          <td className="px-3 py-2 text-right text-[#c9d1d9] tabular-nums">${row.price.toFixed(2)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.type === "buy" ? "text-[#f85149]" : "text-[#3fb950]"}`}>{row.type === "buy" ? "-" : "+"}${(row.quantity * row.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="px-2 py-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteTxn(ticker, row.id); }}
                              className="opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-[#f85149] transition-all p-0.5"
                              title="Delete"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  )}
                  {!isCollapsed && (
                    <tfoot>
                      <tr className="bg-[#161b22]/30 border-t border-[#21262d]/40">
                        <td colSpan={3} className="px-3 py-2 text-right text-[9px] font-semibold text-[#484f58] uppercase tracking-wider">Subtotal</td>
                        <td className="px-3 py-2 text-right text-[#c9d1d9] tabular-nums font-bold text-[10px]">{netShares.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-[#8b949e] tabular-nums font-bold text-[10px]">${avgCost.toFixed(2)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-bold text-[10px] ${netCashFlow >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                          {netCashFlow >= 0 ? "+" : "-"}${Math.abs(netCashFlow).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
