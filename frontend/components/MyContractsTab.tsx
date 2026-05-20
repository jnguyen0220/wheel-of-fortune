"use client";

import { Fragment, useCallback, useState } from "react";
import type { OptionsOrder } from "@/lib/types";
import { useLocalStorageState } from "@/lib/hooks";
import CloseContractModal from "./CloseContractModal";
import TickerLink from "./TickerLink";

export default function MyContractsTab() {
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
                  className="flex-1 rounded bg-[#238636] hover:bg-[#2ea043] text-[10px] text-white font-semibold px-3 py-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[#238636] inline-flex items-center justify-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add
                </button>
                <button
                  onClick={resetForm}
                  className="rounded border border-[#30363d] bg-transparent hover:bg-[#21262d] text-[10px] text-[#8b949e] font-medium px-2.5 py-1.5 transition-colors focus:outline-none inline-flex items-center justify-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
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
                          <TickerLink ticker={ticker} className="text-[12px] font-bold text-[#58a6ff] hover:underline tracking-wide cursor-pointer" />
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
