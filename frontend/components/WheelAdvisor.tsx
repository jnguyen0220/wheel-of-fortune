"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { StockHolding, PositionTransaction, OptionsOrder } from "@/lib/types";
import { getInventory, getMarketData, addHolding, deleteHolding } from "@/lib/api";
import { useLocalStorageState } from "@/lib/hooks";
import { useContractExpiration } from "@/lib/useContractExpiration";
import Discovery from "./Discovery";
import CloseContractModal from "./CloseContractModal";
import { HealthPopupProvider } from "./HealthPopupContext";

function DisclaimerPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#161b22] border-b border-[#30363d] px-6 py-4 flex items-center gap-2 z-10">
          <svg className="w-5 h-5 text-[#d29922] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <h2 className="text-sm font-bold text-[#d29922] uppercase tracking-widest">Important Legal Disclaimer</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-[11px] text-[#8b949e] leading-relaxed">
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest mb-1.5">No Financial Advice</h4>
                <p>
                  This application is provided strictly for educational and informational purposes only. Nothing contained herein constitutes financial, investment, tax, or trading advice, nor any other form of professional advice. The data, analyses, options strategies, and recommendations presented should not be construed as a recommendation or solicitation to buy, sell, or hold any security, financial product, or instrument.
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest mb-1.5">Risk Disclosure</h4>
                <p>
                  Trading options and other financial instruments involves <strong className="text-[#f85149]">substantial risk of loss</strong> and is not suitable for all investors. Options are complex financial instruments and can result in the loss of your entire investment. Past performance is not indicative of future results. Consult with a qualified financial advisor before making any investment decisions.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest mb-1.5">No Warranty</h4>
                <p>
                  The creators, developers, and operators of this application make no representations or warranties, express or implied, regarding the accuracy, completeness, reliability, or timeliness of any information provided. Market data may be delayed or inaccurate. All information is provided &ldquo;as is&rdquo; without warranty of any kind.
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest mb-1.5">Limitation of Liability</h4>
                <p>
                  By using this application, you acknowledge that: (a) you are solely responsible for your own investment decisions and any resulting gains or losses; (b) the creators and operators shall not be liable for any direct, indirect, incidental, consequential, or punitive damages; and (c) you use this application entirely at your own risk.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#21262d] text-[10px] text-[#6e7681] text-center space-y-1">
            <p>&copy; {new Date().getFullYear()} Wheel Advisor. For educational use only. Not a registered investment advisor.</p>
            <p className="text-[9px] uppercase tracking-wider">This application does not provide personalized investment advice</p>
          </div>
        </div>

        {/* Footer button */}
        <div className="sticky bottom-0 bg-[#161b22] border-t border-[#30363d] px-6 py-4 flex justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 text-xs font-semibold text-[#0d1117] bg-[#d29922] hover:bg-[#e3b341] rounded-lg transition-colors"
          >
            I Understand &amp; Accept
          </button>
        </div>
      </div>
    </div>
  );
}

function MyPositionsTab() {
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
    // Reset only qty and price, keep ticker/date/type
    (form.elements.namedItem("quantity") as HTMLInputElement).value = "";
    (form.elements.namedItem("price") as HTMLInputElement).value = "";
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
      const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      const lastActive = sorted.length > 0 ? sorted[0].date : "";
      return { ticker, txns: sorted, netShares, avgCost, txnCount: txns.length, lots: Math.floor(netShares / 100), realizedPnl, costBasis: netShares * avgCost, lastActive };
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
  const totalRealized = filteredTickers.reduce((s, t) => s + t.realizedPnl, 0);
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
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Realized P&L</div>
          <div className={`text-lg font-bold tabular-nums leading-tight ${totalRealized >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
            {totalRealized >= 0 ? "+" : ""}${totalRealized.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                className="flex-1 rounded bg-[#238636] hover:bg-[#2ea043] text-[10px] text-white font-semibold px-3 py-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[#238636]"
              >
                Add
              </button>
              <button
                type="reset"
                className="rounded border border-[#30363d] bg-transparent hover:bg-[#21262d] text-[10px] text-[#8b949e] font-medium px-2.5 py-1.5 transition-colors focus:outline-none"
              >
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
                <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${totalRealized >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{totalRealized >= 0 ? "+" : ""}${totalRealized.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          {filteredTickers.map(({ ticker, txns, netShares, avgCost, txnCount, lots, realizedPnl, costBasis, lastActive }) => {
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
                          <span className="text-[12px] font-bold text-[#c9d1d9] tracking-wide">{ticker}</span>
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
                        <span className={`font-bold ${realizedPnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{realizedPnl >= 0 ? "+" : ""}${realizedPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
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
                          <td className="px-3 py-2 text-right text-[#c9d1d9] tabular-nums font-medium">${(row.quantity * row.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
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
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-[10px]">
                          <span className={realizedPnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>{realizedPnl >= 0 ? "+" : ""}${realizedPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
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

function MyContractsTab() {
  const [orders, setOrders] = useLocalStorageState<OptionsOrder[]>("wof-orders", []);

  // ── Close Order Modal State ──
  const [closingOrder, setClosingOrder] = useState<OptionsOrder | null>(null);

  const openCloseModal = useCallback((orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (order) setClosingOrder(order);
  }, [orders]);

  const confirmCloseOrder = useCallback((closePremium: number, closeDate: string) => {
    if (!closingOrder) return;
    setOrders(prev => prev.map(o =>
      o.id === closingOrder.id
        ? { ...o, status: "closed" as const, close_premium: closePremium, closed_at: closeDate }
        : o
    ));
    setClosingOrder(null);
  }, [closingOrder, setOrders]);

  // ── Entry form state ──
  const [formTicker, setFormTicker] = useState("");
  const [formLeg, setFormLeg] = useState<"CSP" | "CC">("CSP");
  const [formStrike, setFormStrike] = useState("");
  const [formExpiration, setFormExpiration] = useState("");
  const [formContracts, setFormContracts] = useState("1");
  const [formPremium, setFormPremium] = useState("");

  const resetForm = useCallback(() => {
    setFormTicker(""); setFormStrike(""); setFormExpiration(""); setFormContracts("1"); setFormPremium("");
  }, []);

  const addOrder = useCallback(() => {
    const ticker = formTicker.trim().toUpperCase();
    const strike = parseFloat(formStrike);
    const premium = parseFloat(formPremium);
    const contracts = parseInt(formContracts, 10);
    if (!ticker || isNaN(strike) || strike <= 0 || isNaN(premium) || premium < 0 || isNaN(contracts) || contracts <= 0 || !formExpiration) return;

    const newOrder: OptionsOrder = {
      id: crypto.randomUUID(),
      ticker,
      option_type: formLeg === "CC" ? "CALL" : "PUT",
      leg: formLeg,
      strike,
      expiration: formExpiration,
      contracts,
      premium,
      status: "open",
      created_at: new Date().toISOString().slice(0, 10),
    };
    setOrders(prev => [...prev, newOrder]);
    resetForm();
  }, [formTicker, formLeg, formStrike, formExpiration, formContracts, formPremium, setOrders, resetForm]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);

  const [showOpenOnly, setShowOpenOnly] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const openOrders = orders.filter(o => o.status === "open");
  const closedOrders = orders.filter(o => o.status !== "open");

  // Group orders by ticker
  const grouped = orders.reduce<Record<string, OptionsOrder[]>>((acc, o) => {
    (acc[o.ticker] ??= []).push(o);
    return acc;
  }, {});
  const tickerKeys = Object.keys(grouped).sort((a, b) => {
    const aOpen = grouped[a].some(o => o.status === "open") ? 0 : 1;
    const bOpen = grouped[b].some(o => o.status === "open") ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return a.localeCompare(b);
  });
  const filteredTickerKeys = showOpenOnly ? tickerKeys.filter(t => grouped[t].some(o => o.status === "open")) : tickerKeys;

  // Per-ticker summaries
  const tickerSummary = (list: OptionsOrder[]) => {
    const open = list.filter(o => o.status === "open");
    const closed = list.filter(o => o.status !== "open");
    const collected = list.reduce((s, o) => s + o.premium * o.contracts * 100, 0);
    const buyback = closed.reduce((s, o) => s + (o.close_premium ?? 0) * o.contracts * 100, 0);
    const dates = list.map(o => (o.closed_at || o.created_at || "").slice(0, 10)).filter(Boolean).sort().reverse();
    const lastActive = dates[0] || "";
    return { open: open.length, closed: closed.length, total: list.length, collected, buyback, net: collected - buyback, lastActive };
  };

  const sortContracts = (list: OptionsOrder[]) =>
    [...list].sort((a, b) => {
      if (a.status === "open" && b.status !== "open") return -1;
      if (a.status !== "open" && b.status === "open") return 1;
      return new Date(a.expiration).getTime() - new Date(b.expiration).getTime();
    });

  const daysUntilExpiry = (exp: string) => {
    const diff = new Date(exp).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  };

  const visibleOrders = filteredTickerKeys.flatMap(t => grouped[t]);
  const visibleOpen = visibleOrders.filter(o => o.status === "open");
  const visibleClosed = visibleOrders.filter(o => o.status !== "open");
  const openPremium = visibleOpen.reduce((s, o) => s + o.premium * o.contracts * 100, 0);
  const closedBuyBack = visibleClosed.reduce((s, o) => s + (o.close_premium ?? 0) * o.contracts * 100, 0);
  const closedPremium = visibleClosed.reduce((s, o) => s + (o.premium - (o.close_premium ?? 0)) * o.contracts * 100, 0);
  const totalPremium = openPremium + closedPremium;
  const totalSold = visibleOrders.reduce((s, o) => s + o.premium * o.contracts * 100, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-1">

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-4 gap-3 mb-5 shrink-0">
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3">
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Open Contracts</div>
          <div className="text-lg font-bold text-[#c9d1d9] tabular-nums leading-tight">{visibleOpen.length}</div>
          <div className="text-[9px] text-[#3fb950] tabular-nums mt-0.5">${openPremium.toLocaleString()}</div>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3">
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Closed Contracts</div>
          <div className="text-lg font-bold text-[#c9d1d9] tabular-nums leading-tight">{visibleClosed.length}</div>
          <div className="text-[9px] text-[#8b949e] tabular-nums mt-0.5">${closedPremium.toLocaleString()} net</div>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3">
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Total Collected</div>
          <div className="text-lg font-bold text-[#3fb950] tabular-nums leading-tight">${totalSold.toLocaleString()}</div>
          <div className="text-[9px] text-[#484f58] tabular-nums mt-0.5">{visibleOrders.length} contracts</div>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3">
          <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Net P&L</div>
          <div className={`text-lg font-bold tabular-nums leading-tight ${totalPremium >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
            {totalPremium >= 0 ? "+" : ""}${totalPremium.toLocaleString()}
          </div>
          <div className="text-[9px] text-[#f85149] tabular-nums mt-0.5">${closedBuyBack.toLocaleString()} buy-back</div>
        </div>
      </div>

      {/* ── Add Contract Button / Form ── */}
      <div className="border border-[#21262d] rounded-lg overflow-hidden bg-[#0d1117] mb-5 shrink-0">
        <div
          className="bg-[#161b22] px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-[#1c2129] transition-colors"
          onClick={() => setShowForm(f => !f)}
        >
          <svg className={`w-3 h-3 text-[#8b949e] transition-transform duration-150 ${showForm ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[10px] font-semibold text-[#c9d1d9] uppercase tracking-wider">Add Contract</span>
        </div>
        {showForm && (
        <div className="border-t border-[#21262d] px-4 py-3">
            <div className="grid grid-cols-7 gap-3 items-end">
              <div>
                <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Ticker</label>
                <input
                  type="text"
                  value={formTicker}
                  onChange={e => setFormTicker(e.target.value)}
                  placeholder="AAPL"
                  className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff] placeholder:text-[#30363d]"
                />
              </div>
              <div>
                <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Type</label>
                <select
                  value={formLeg}
                  onChange={e => setFormLeg(e.target.value as "CSP" | "CC")}
                  className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="CSP">CSP (Put)</option>
                  <option value="CC">CC (Call)</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Strike</label>
                <input
                  type="number"
                  value={formStrike}
                  onChange={e => setFormStrike(e.target.value)}
                  placeholder="150.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff] placeholder:text-[#30363d] tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Expiration</label>
                <input
                  type="date"
                  value={formExpiration}
                  onChange={e => setFormExpiration(e.target.value)}
                  className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff] tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Qty</label>
                <input
                  type="number"
                  value={formContracts}
                  onChange={e => setFormContracts(e.target.value)}
                  min="1"
                  step="1"
                  className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff] tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">Premium / share</label>
                <input
                  type="number"
                  value={formPremium}
                  onChange={e => setFormPremium(e.target.value)}
                  placeholder="1.50"
                  min="0"
                  step="0.01"
                  className="w-full rounded border border-[#30363d] bg-[#0d1117] text-[11px] text-[#c9d1d9] px-2.5 py-1.5 focus:outline-none focus:border-[#58a6ff] placeholder:text-[#30363d] tabular-nums"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addOrder}
                  className="flex-1 rounded bg-[#238636] hover:bg-[#2ea043] text-[10px] text-white font-semibold px-3 py-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[#238636]"
                >
                  Add
                </button>
                <button
                  onClick={resetForm}
                  className="rounded border border-[#30363d] bg-transparent hover:bg-[#21262d] text-[10px] text-[#8b949e] font-medium px-2.5 py-1.5 transition-colors focus:outline-none"
                >
                  Reset
                </button>
              </div>
            </div>
            {formTicker && formStrike && formPremium && formContracts && (
              <div className="mt-2 text-[9px] text-[#484f58]">
                Total collected: <span className="text-[#3fb950] font-bold">${(parseFloat(formPremium || "0") * parseInt(formContracts || "0", 10) * 100).toLocaleString()}</span>
              </div>
            )}
          </div>
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
          <span className="text-[9px] text-[#8b949e]">Open contracts only</span>
        </label>
        <span className="text-[9px] text-[#484f58]">{filteredTickerKeys.length} of {tickerKeys.length} tickers</span>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#21262d] flex items-center justify-center">
            <svg className="w-6 h-6 text-[#30363d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] text-[#8b949e] font-medium">No contracts yet</p>
            <p className="text-[9px] text-[#484f58] mt-1">Sell options from the Explore tab to get started</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
          {/* Grand totals bar */}
          <table className="w-full table-fixed text-[11px] border border-[#21262d] rounded-lg overflow-hidden bg-[#161b22] sticky top-0 z-10">
            <colgroup>
              <col style={{width: "28px"}} />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={9} className="px-3 py-2.5 text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Grand Total</td>
                <td className="px-3 py-2.5 text-right text-[#3fb950] tabular-nums font-bold">${totalSold.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold">{closedBuyBack > 0 ? <span className="text-[#f85149]">${closedBuyBack.toLocaleString()}</span> : <span className="text-[#30363d]">&mdash;</span>}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${totalPremium >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{totalPremium >= 0 ? "+" : ""}${totalPremium.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          {filteredTickerKeys.map(ticker => {
            const contractsList = grouped[ticker];
            const summary = tickerSummary(contractsList);
            const isTickerExpanded = expanded.has(`ticker:${ticker}`);
            return (
              <div key={ticker} className="border border-[#21262d] rounded-lg overflow-hidden bg-[#0d1117]">
                <table className="w-full table-fixed text-[11px]">
                  <colgroup>
                    <col style={{width: "28px"}} />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    {/* Ticker header row */}
                    <tr
                      className="bg-[#161b22] border-b border-[#21262d] cursor-pointer hover:bg-[#1c2129] transition-colors"
                      onClick={() => toggleExpand(`ticker:${ticker}`)}
                    >
                      <td className="pl-3 pr-0 py-2">
                        <svg className={`w-3.5 h-3.5 text-[#8b949e] transition-transform duration-150 ${isTickerExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                      <td colSpan={8} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {summary.open > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#3fb950]"></div>}
                          <span className="text-[12px] font-bold text-[#c9d1d9] tracking-wide">{ticker}</span>
                          <span className="text-[9px] text-[#484f58]">{summary.total} contract{summary.total !== 1 ? "s" : ""}</span>
                          {summary.open > 0 && <span className="text-[9px] text-[#3fb950] font-semibold">{summary.open} open</span>}
                          {summary.closed > 0 && <span className="text-[9px] text-[#484f58]">{summary.closed} closed</span>}
                          <span className="ml-auto text-[10px] text-[#8b949e] tabular-nums">{summary.lastActive || "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] tabular-nums">
                        <span className="text-[#3fb950] font-bold">${summary.collected.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] tabular-nums">
                        {summary.buyback > 0 ? <span className="text-[#f85149] font-bold">${summary.buyback.toLocaleString()}</span> : <span className="text-[#30363d] font-bold">&mdash;</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] tabular-nums">
                        <span className={`font-bold ${summary.net >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{summary.net >= 0 ? "+" : ""}${summary.net.toLocaleString()}</span>
                      </td>
                    </tr>
                    {/* Column headers */}
                    {isTickerExpanded && (
                      <tr className="bg-[#161b22]/40 border-b border-[#21262d]/60">
                        <th></th>
                        <th className="px-3 py-1.5 text-left text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Type</th>
                        <th className="px-3 py-1.5 text-center text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Status</th>
                        <th className="px-3 py-1.5 text-center text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider"></th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Strike</th>
                        <th className="px-3 py-1.5 text-left text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Expiration</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">DTE</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Qty</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Premium</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Collected</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Buy Back</th>
                        <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider">Net P&L</th>
                      </tr>
                    )}
                  </thead>
                  {isTickerExpanded && (
                    <tbody>
                      {sortContracts(contractsList).map(o => {
                        const dte = daysUntilExpiry(o.expiration);
                        const isClosed = o.status !== "open";
                        const isDetailExpanded = expanded.has(o.id);
                        const sold = o.premium * o.contracts * 100;
                        const bought = (o.close_premium ?? 0) * o.contracts * 100;
                        const net = sold - bought;
                        return (
                          <Fragment key={o.id}>
                            <tr
                              className={`
                                border-b border-[#21262d]/20 transition-colors
                                ${isClosed ? "cursor-pointer hover:bg-[#161b22]/80 opacity-60" : "hover:bg-[#161b22]/50"}
                                ${isDetailExpanded ? "bg-[#161b22]/60" : ""}
                              `}
                              onClick={isClosed ? () => toggleExpand(o.id) : undefined}
                            >
                              <td className="pl-3 pr-0 py-2 text-[#484f58]">
                                {isClosed ? (
                                  <svg className={`w-3 h-3 transition-transform duration-150 ${isDetailExpanded ? "rotate-90 text-[#8b949e]" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                ) : (
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#3fb950] ml-0.5"></div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  o.leg === "CC"
                                    ? "bg-[#58a6ff]/10 text-[#58a6ff] border border-[#58a6ff]/20"
                                    : "bg-[#d2a8ff]/10 text-[#d2a8ff] border border-[#d2a8ff]/20"
                                }`}>{o.leg === "CC" ? "Call" : "Put"}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {isClosed ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#21262d] text-[#8b949e] border border-[#30363d]">Closed</span>
                                ) : (
                                  <select
                                    value="open"
                                    onChange={(e) => { if (e.target.value === "closed") openCloseModal(o.id); }}
                                    className="rounded-full border border-[#238636]/40 bg-[#238636]/10 text-[9px] text-[#3fb950] px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#238636] cursor-pointer font-semibold appearance-none text-center"
                                    style={{ minWidth: "56px" }}
                                  >
                                    <option value="open">Open</option>
                                    <option value="closed">Close</option>
                                  </select>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setOrders(prev => prev.filter(x => x.id !== o.id)); }}
                                  className="rounded p-0.5 text-[#484f58] hover:text-[#f85149] hover:bg-[#f85149]/10 transition-colors focus:outline-none"
                                  title="Delete contract"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right text-[#c9d1d9] tabular-nums font-medium">${o.strike.toFixed(2)}</td>
                              <td className="px-3 py-2 text-[#8b949e] tabular-nums">{o.expiration}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {isClosed ? (
                                  <span className="text-[#30363d]">—</span>
                                ) : (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    dte <= 7 ? "bg-[#f85149]/10 text-[#f85149]" : dte <= 21 ? "bg-[#d29922]/10 text-[#d29922]" : "text-[#8b949e]"
                                  }`}>{dte}d</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-[#c9d1d9] tabular-nums">{o.contracts}</td>
                              <td className="px-3 py-2 text-right text-[#c9d1d9] tabular-nums">${o.premium.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right text-[#3fb950] tabular-nums font-medium">${sold.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {isClosed && bought > 0
                                  ? <span className="text-[#f85149]">${bought.toLocaleString()}</span>
                                  : <span className="text-[#30363d]">&mdash;</span>
                                }
                              </td>
                              <td className={`px-3 py-2 text-right tabular-nums font-bold ${net >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                                {isClosed ? `${net >= 0 ? "+" : ""}$${net.toLocaleString()}` : `+$${sold.toLocaleString()}`}
                              </td>
                            </tr>

                            {/* Expanded close-out details */}
                            {isClosed && isDetailExpanded && (
                              <tr className="bg-[#161b22]/40 border-b border-[#21262d]/20">
                                <td></td>
                                <td colSpan={11} className="px-3 py-3">
                                  <div className="flex items-center gap-8 text-[10px]">
                                    <div>
                                      <span className="text-[#484f58] text-[9px] uppercase tracking-wider">Closed On</span>
                                      <div className="text-[#c9d1d9] tabular-nums mt-0.5 font-medium">{o.closed_at ?? "—"}</div>
                                    </div>
                                    <div>
                                      <span className="text-[#484f58] text-[9px] uppercase tracking-wider">Premium Sold</span>
                                      <div className="text-[#3fb950] tabular-nums mt-0.5 font-medium">${sold.toLocaleString()}</div>
                                    </div>
                                    <div>
                                      <span className="text-[#484f58] text-[9px] uppercase tracking-wider">Buy-Back Cost</span>
                                      <div className="text-[#f85149] tabular-nums mt-0.5 font-medium">{bought > 0 ? `$${bought.toLocaleString()}` : "$0"}</div>
                                    </div>
                                    <div>
                                      <span className="text-[#484f58] text-[9px] uppercase tracking-wider">Realized P&L</span>
                                      <div className={`tabular-nums mt-0.5 font-bold ${net >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{net >= 0 ? "+" : ""}${net.toLocaleString()}</div>
                                    </div>
                                    {o.close_premium !== undefined && (
                                      <div>
                                        <span className="text-[#484f58] text-[9px] uppercase tracking-wider">Buy-Back / Share</span>
                                        <div className="text-[#8b949e] tabular-nums mt-0.5 font-medium">${o.close_premium.toFixed(2)}</div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  )}
                  {isTickerExpanded && (
                    <tfoot>
                      <tr className="bg-[#161b22]/30 border-t border-[#21262d]/40">
                        <td colSpan={9} className="px-3 py-2 text-right text-[9px] font-semibold text-[#484f58] uppercase tracking-wider">Subtotal</td>
                        <td className="px-3 py-2 text-right text-[#3fb950] tabular-nums font-bold text-[10px]">${summary.collected.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-[10px]">{summary.buyback > 0 ? <span className="text-[#f85149]">${summary.buyback.toLocaleString()}</span> : <span className="text-[#30363d]">&mdash;</span>}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-bold text-[10px] ${summary.net >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{summary.net >= 0 ? "+" : ""}${summary.net.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Close Order Modal ── */}
      {closingOrder && (
        <CloseContractModal
          order={closingOrder}
          onConfirm={confirmCloseOrder}
          onCancel={() => setClosingOrder(null)}
        />
      )}
    </div>
  );
}

export default function WheelAdvisor() {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  type TopTab = "explore" | "positions" | "contracts";
  const validTabs: TopTab[] = ["explore", "positions", "contracts"];
  const [activeTab, setActiveTab] = useState<TopTab>("explore");

  // Auto-close/assign expired contracts at the top level (always active)
  useContractExpiration();

  // Read positions & orders for badge counts
  const [badgePositions] = useLocalStorageState<Record<string, PositionTransaction[]>>("wof-positions", {});
  const [badgeOrders] = useLocalStorageState<OptionsOrder[]>("wof-orders", []);
  const openPositionCount = Object.values(badgePositions).filter(txns => {
    const buys = txns.filter(t => t.type === "buy").reduce((s, t) => s + t.quantity, 0);
    const sells = txns.filter(t => t.type === "sell").reduce((s, t) => s + t.quantity, 0);
    return buys - sells > 0;
  }).length;
  const openOrderCount = badgeOrders.filter(o => o.status === "open").length;

  const switchTab = useCallback((tab: TopTab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  }, []);

  // Sync tab from hash on mount and on popstate (back/forward)
  useEffect(() => {
    const syncHash = () => {
      const h = window.location.hash.replace("#", "") as TopTab;
      if (validTabs.includes(h)) setActiveTab(h);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("disclaimer_accepted");
    if (!accepted) {
      setDisclaimerOpen(true);
    }
  }, []);

  const handleDisclaimerClose = useCallback(() => {
    localStorage.setItem("disclaimer_accepted", "1");
    setDisclaimerOpen(false);
  }, []);

  const refreshInventory = useCallback(async () => {
    try {
      const inv = await getInventory();
      setHoldings(inv.holdings);
    } catch (err) {
      console.error("Failed to refresh inventory:", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshInventory();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshInventory]);

  return (
    <HealthPopupProvider>
    <div className="h-screen flex flex-col bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <header className="bg-[#161b22] border-b border-[#30363d] sticky top-0 z-20 shadow-sm shadow-black/20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-linear-to-br from-[#3fb950] to-[#2ea043] rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-4.5 h-4.5 text-[#0d1117]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#c9d1d9] tracking-tight">Wheel Advisor</h1>
              <p className="text-[10px] text-[#8b949e]">Options Income Strategy</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[9px] font-medium text-[#d29922] bg-[#d299220a] border border-[#d2992230] px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            Not financial advice. For educational and informational purposes only. <button onClick={() => setDisclaimerOpen(true)} className="underline underline-offset-2 hover:text-[#e3b341] transition-colors cursor-pointer">Read full disclaimer</button>
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col max-w-7xl w-full mx-auto px-6 pt-4">
        {/* Tab nav */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="tab-group">
            {([
                { key: "explore", label: "Explore", badge: 0, badgeColor: "" },
                { key: "positions", label: "My Positions", badge: openPositionCount, badgeColor: "bg-[#3fb950]/15 text-[#3fb950]" },
                { key: "contracts", label: "My Contracts", badge: openOrderCount, badgeColor: "bg-[#58a6ff]/10 text-[#58a6ff]" },
              ] as const
            ).map(({ key, label, badge, badgeColor }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={`tab-btn ${
                  activeTab === key
                    ? "bg-[#30363d] text-[#c9d1d9]"
                    : "text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {key === "explore" ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  ) : key === "positions" ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                    </svg>
                  )}
                  {label}
                  {badge > 0 && (
                    <span className={`min-w-[16px] h-[16px] inline-flex items-center justify-center rounded-full text-[8px] font-bold tabular-nums px-1.5 leading-none ${badgeColor}`}>
                      {badge}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 pb-2">
          <div className={`${activeTab === "explore" ? "flex flex-col" : "hidden"} h-full min-h-0`}>
            <Discovery
              existingTickers={holdings.map(h => h.ticker)}
              onAddTicker={async (ticker) => {
                try {
                  await addHolding({ ticker, shares: 0, cost_basis: 0, current_price: 0 });
                  refreshInventory();
                } catch { /* ignore duplicates */ }
              }}
              onRemoveTicker={async (ticker) => {
                const holding = holdings.find(h => h.ticker.toUpperCase() === ticker.toUpperCase());
                if (holding) {
                  try {
                    await deleteHolding(holding.id);
                    refreshInventory();
                  } catch { /* ignore */ }
                }
              }}
            />
          </div>

          {/* ── My Positions tab ── */}
          <div className={`${activeTab === "positions" ? "flex flex-col" : "hidden"} h-full min-h-0`}>
            <MyPositionsTab />
          </div>

          {/* ── My Contracts tab ── */}
          <div className={`${activeTab === "contracts" ? "flex flex-col" : "hidden"} h-full min-h-0`}>
            <MyContractsTab />
          </div>
        </div>
      </div>

      {/* Minimal footer */}
      <footer className="mt-auto border-t border-[#21262d] py-3">
        <p className="text-center text-[10px] text-[#6e7681]">
          &copy; {new Date().getFullYear()} Wheel Advisor &middot; For educational use only &middot;{" "}
          <button onClick={() => setDisclaimerOpen(true)} className="underline underline-offset-2 hover:text-[#8b949e] transition-colors cursor-pointer">
            Legal Disclaimer
          </button>
        </p>
      </footer>

      {/* Disclaimer popup */}
      <DisclaimerPopup open={disclaimerOpen} onClose={handleDisclaimerClose} />
    </div>
    </HealthPopupProvider>
  );
}
