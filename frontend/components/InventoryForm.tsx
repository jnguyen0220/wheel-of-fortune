"use client";

import { useState, useEffect, useCallback } from "react";
import type { StockHolding, StockHoldingInput, StockMarketData, EarningsCalendar, EarningsResult, AnalystTrend, FinancialHealth } from "@/lib/types";
import { addHolding, deleteHolding, getBatchData } from "@/lib/api";
import Screener from "./Screener";
import StockNews from "./StockNews";
import TickerLink from "./TickerLink";

interface Props {
  holdings: StockHolding[];
  onChanged: () => void;
  onGenerate?: () => void;
  generating?: boolean;
  onEarningsLoaded?: (calendar: Record<string, EarningsCalendar[]>, history: Record<string, EarningsResult[]>) => void;
  onAnalystTrendsLoaded?: (trends: Record<string, AnalystTrend[]>) => void;
}

interface FormFields {
  ticker: string;
  lots: string;
  cost_basis: string;
}

const EMPTY_FORM: FormFields = {
  ticker: "",
  lots: "0",
  cost_basis: "",
};

export default function InventoryForm({
  holdings,
  onChanged,
  onGenerate,
  generating = false,
  onEarningsLoaded,
  onAnalystTrendsLoaded,
}: Props) {
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<Record<string, StockMarketData>>({});
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [earningsData, setEarningsData] = useState<Record<string, { calendar: EarningsCalendar[]; history: EarningsResult[] }>>({});
  const [analystTrends, setAnalystTrends] = useState<Record<string, AnalystTrend[]>>({});
  const [healthData, setHealthData] = useState<Record<string, FinancialHealth>>({});
  const [internalTab, setInternalTab] = useState<"add" | "screener" | "news">("add");

  const refreshMarketData = useCallback(async () => {
    const allTickers = [...new Set(holdings.map((h) => h.ticker))].sort();
    if (allTickers.length === 0) return;
    setLoadingMarket(true);
    try {
      const batch = await getBatchData(allTickers);
      setMarketData(batch.market_data);
      setHealthData(batch.financials);
      const merged: Record<string, { calendar: EarningsCalendar[]; history: EarningsResult[] }> = {};
      for (const t of allTickers) {
        merged[t] = { calendar: batch.earnings_calendar[t] ?? [], history: batch.earnings_history[t] ?? [] };
      }
      setEarningsData(merged);
      setAnalystTrends(batch.analyst_trends);
      onEarningsLoaded?.(batch.earnings_calendar, batch.earnings_history);
      onAnalystTrendsLoaded?.(batch.analyst_trends);
    } catch {
      // silently ignore – market data is supplementary
    } finally {
      setLoadingMarket(false);
    }
  }, [holdings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshMarketData();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshMarketData]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "ticker" ? value.toUpperCase() : value,
    }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker) return;

    const lots = parseInt(form.lots, 10) || 0;
    const shares = lots * 100;

    setSaving(true);
    setError(null);
    try {
      let costBasis = parseFloat(form.cost_basis) || 0;
      if (lots === 0) {
        // CSP: use cached market price if available, otherwise fetch
        costBasis = marketData[form.ticker]?.price ?? 0;
        if (costBasis === 0) {
          const data = await getBatchData([form.ticker]);
          costBasis = data.market_data[form.ticker]?.price ?? 0;
        }
      }
      const payload: StockHoldingInput = {
        ticker: form.ticker,
        shares,
        cost_basis: costBasis,
        current_price: 0,
      };
      await addHolding(payload);
      setForm(EMPTY_FORM);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add holding");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteHolding(id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete holding");
    }
  }

  function handleDownloadTemplate() {
    const csv = "Ticker,Shares,Avg Cost\nAAPL,100,150.00\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "holdings_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportError(null);
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const tickerIdx = header.indexOf("ticker");
      const sharesIdx = header.indexOf("shares");
      const costIdx = header.findIndex((h) => h.includes("avg") || h.includes("cost"));
      if (tickerIdx === -1 || sharesIdx === -1 || costIdx === -1)
        throw new Error("CSV must have columns: Ticker, Shares, Avg Cost");
      const errors: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        const ticker = cols[tickerIdx]?.toUpperCase();
        const shares = parseFloat(cols[sharesIdx]);
        const cost = parseFloat(cols[costIdx]);
        if (!ticker || isNaN(shares) || isNaN(cost)) {
          errors.push(`Row ${i + 1}: invalid data`);
          continue;
        }
        try {
          await addHolding({ ticker, shares, cost_basis: cost, current_price: 0 });
        } catch {
          errors.push(`Row ${i + 1}: failed to add ${ticker}`);
        }
      }
      if (errors.length) setImportError(errors.join(" · "));
      onChanged();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }


  return (
    <section className="card">
      {/* Internal tabs */}
      <div className="flex items-center gap-3 p-4 border-b border-[#30363d]">
        <div className="tab-group">
          {(["add", "screener", "news"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setInternalTab(tab)}
              className={internalTab === tab ? "tab-btn-active" : "tab-btn-inactive"}
            >
              {tab === "add" ? "Add Ticker" : tab === "screener" ? "Undervalued Stocks" : "Stock News"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {/* Add Ticker tab content */}
        <div className={internalTab === "add" ? "" : "hidden"}>
        {/* Toolbar */}
        <div className="toolbar mb-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || holdings.length === 0}
            className="toolbar-btn disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Loading…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                Option Chain
              </>
            )}
          </button>
          <div className="toolbar-divider" />
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="toolbar-btn"
            title="Download CSV template"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 12l4.5 4.5m0 0L16.5 12M12 16.5V3" />
            </svg>
            Template
          </button>
          <div className="toolbar-divider" />
          <label className="toolbar-btn cursor-pointer" title="Import CSV">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            {importing ? "Importing…" : "Import"}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportCsv}
              disabled={importing}
            />
          </label>
        </div>

        {/* Add form */}
        <div className="mb-5">
          {importError && (
            <div className="alert-error mb-3">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {importError}
            </div>
          )}
          <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[110px]">
              <label className="block text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1">Ticker</label>
              <input
                name="ticker"
                value={form.ticker}
                onChange={handleChange}
                placeholder="AAPL"
                maxLength={6}
                required
                className="input font-bold uppercase placeholder:font-normal"
              />
            </div>
            <div className="min-w-[80px] w-20">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1">
                Lots
                {(parseInt(form.lots, 10) || 0) === 0
                  ? <span className="badge-csp px-1 py-0 normal-case tracking-normal">CSP</span>
                  : <span className="badge-cc px-1 py-0 normal-case tracking-normal">CC</span>
                }
              </label>
              <input
                name="lots"
                type="number"
                min={0}
                step={1}
                value={form.lots}
                onChange={handleChange}
                placeholder="0"
                required
                className="input"
              />
            </div>
            <span className="text-[10px] text-[#484f58] font-medium whitespace-nowrap pb-2">× 100 =</span>
            <div className="min-w-[80px] w-24">
              <label className="block text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1">Quantity</label>
              <div className="w-24 border border-[#21262d] rounded px-3 py-2 text-xs text-[#484f58] bg-[#0d1117] cursor-default tabular-nums">
                {(parseInt(form.lots, 10) || 0) * 100}
              </div>
            </div>
            <div className="flex-1 min-w-[130px]">
              <label className="block text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1">Avg Cost ($)</label>
              <input
                name="cost_basis"
                type="number"
                min={0}
                step={0.01}
                value={(parseInt(form.lots, 10) || 0) === 0 ? "" : form.cost_basis}
                onChange={handleChange}
                placeholder={(parseInt(form.lots, 10) || 0) === 0 ? "Market Price" : "0.00"}
                disabled={(parseInt(form.lots, 10) || 0) === 0}
                required={(parseInt(form.lots, 10) || 0) > 0}
                className={`w-full border rounded px-3 py-2 text-xs placeholder:text-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition ${
                  (parseInt(form.lots, 10) || 0) === 0
                    ? "border-[#21262d] text-[#484f58] bg-[#0d1117] cursor-not-allowed"
                    : "border-[#30363d] text-[#c9d1d9] bg-[#0d1117]"
                }`}
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="shrink-0 btn-primary px-4 py-2 flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Adding…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </>
              )}
            </button>
          </form>
        </div>

        {error && (
          <div className="alert-error mb-4">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Holdings table */}
        {holdings.length > 0 && (
          <div className="flex items-center justify-between mb-2">
            <p className="section-label">Positions</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshMarketData}
                disabled={loadingMarket}
                title="Refresh market prices"
                className="flex items-center gap-1.5 text-[10px] font-medium text-[#58a6ff] hover:text-[#79c0ff] disabled:opacity-40 px-2 py-1 rounded transition"
              >
                <svg
                  className={`w-3 h-3 ${loadingMarket ? "animate-spin" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {loadingMarket ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        )}
        {/* end positions header */}
        {holdings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
              </svg>
            </div>
            <p className="text-[#8b949e] text-xs font-medium">No tickers yet</p>
            <p className="text-[#484f58] text-[10px] mt-1">Add a ticker above — set lots to 0 for CSP or &gt; 0 for CC</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="px-3 py-2 text-left th">Ticker</th>
                  <th className="px-3 py-2 text-right th whitespace-nowrap">Health</th>
                  <th className="px-3 py-2 text-center th">Type</th>
                  <th className="px-3 py-2 text-right th">Qty</th>
                  <th className="px-3 py-2 text-right th">Avg Cost</th>
                  <th className="px-3 py-2 text-right th whitespace-nowrap">
                    Price
                    {loadingMarket && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse align-middle" />}
                  </th>
                  <th className="px-3 py-2 text-right th whitespace-nowrap">P&amp;L</th>
                  <th className="px-3 py-2 text-right th whitespace-nowrap">Low</th>
                  <th className="px-3 py-2 text-right th whitespace-nowrap">High</th>
                  <th className="px-3 py-2 text-right th whitespace-nowrap">Earnings</th>
                  <th className="px-3 py-2 text-right th whitespace-nowrap">Analyst</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {[...holdings].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((h, idx) => {
                  const md = marketData[h.ticker];
                  const price = md?.price ?? h.current_price;
                  const pnlPct =
                    h.cost_basis > 0
                      ? ((price - h.cost_basis) / h.cost_basis) * 100
                      : 0;
                  const pnlAbs = (price - h.cost_basis) * h.shares;
                  const isLast = idx === holdings.length - 1;
                  const rowBorder = isLast ? "" : "border-b border-[#21262d]";
                  return (
                    <tr key={h.id} className="group hover:bg-[#1c2128] transition-colors">
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <TickerLink ticker={h.ticker} className="font-bold text-[#58a6ff] tracking-wider uppercase hover:underline cursor-pointer" />
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        {(() => {
                          const health = healthData[h.ticker];
                          if (!health) return <span className="text-[#484f58] text-[10px]">—</span>;
                          const color = health.health_score >= 80 ? "text-[#3fb950]" : health.health_score >= 65 ? "text-[#56d364]" : health.health_score >= 45 ? "text-[#d29922]" : health.health_score >= 25 ? "text-[#db6d28]" : "text-[#f85149]";
                          return (
                            <span className={`text-[10px] font-bold tabular-nums ${color}`}>
                              {health.health_score}
                            </span>
                          );
                        })()}
                      </td>
                      <td className={`px-3 py-2.5 text-center ${rowBorder}`}>
                        {h.shares === 0 ? (
                          <span className="badge-csp">CSP</span>
                        ) : (
                          <span className="badge-cc">CC</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-[#c9d1d9] font-medium ${rowBorder}`}>
                        {h.shares / 100}<span className="text-[8px] text-[#484f58] ml-0.5">×100</span>
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-[#8b949e] ${rowBorder}`}>
                        ${h.cost_basis.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        {md ? (
                          <span className="font-semibold text-[#c9d1d9] tabular-nums">${md.price.toFixed(2)}</span>
                        ) : (
                          <span className="text-[#484f58] text-[10px]">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        {md ? (
                          <span className={`text-[10px] font-semibold tabular-nums whitespace-nowrap ${pnlPct >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                            <span className="ml-1 opacity-60">{pnlAbs >= 0 ? "+" : ""}${Math.abs(pnlAbs).toFixed(0)}</span>
                          </span>
                        ) : (
                          <span className="text-[#484f58] text-[10px]">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        {md ? (
                          <div className="flex flex-col items-end gap-0.5 tabular-nums text-[10px]">
                            <span className="text-[#8b949e]">
                              <span className="text-[#484f58] uppercase mr-1">52W</span>
                              ${md.week52_low.toFixed(2)}
                            </span>
                            <span className="text-[#8b949e]">
                              <span className="text-[#484f58] uppercase mr-1">Day</span>
                              ${md.daily_low.toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#484f58] text-[10px]">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        {md ? (
                          <div className="flex flex-col items-end gap-0.5 tabular-nums text-[10px]">
                            <span className="text-[#8b949e]">
                              <span className="text-[#484f58] uppercase mr-1">52W</span>
                              ${md.week52_high.toFixed(2)}
                            </span>
                            <span className="text-[#8b949e]">
                              <span className="text-[#484f58] uppercase mr-1">Day</span>
                              ${md.daily_high.toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#484f58] text-[10px]">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        {(() => {
                          const ed = earningsData[h.ticker];
                          if (!ed) return <span className="text-[#484f58] text-[10px]">—</span>;
                          const next = ed.calendar.find(e => e.days_until >= 0);
                          const lastResult = ed.history[ed.history.length - 1];
                          return (
                            <div className="flex flex-col items-end gap-0.5 text-[10px]">
                              {next ? (
                                <span className={`font-medium ${next.days_until <= 14 ? "text-[#d29922]" : "text-[#8b949e]"}`}>
                                  {next.days_until}d
                                  <span className="ml-1 text-[#484f58]">{next.earnings_date}</span>
                                </span>
                              ) : (
                                <span className="text-[#484f58]">—</span>
                              )}
                              {lastResult && (
                                <span className={lastResult.beat ? "text-[#3fb950]" : "text-[#f85149]"}>
                                  {lastResult.beat ? "Beat" : "Miss"} {lastResult.fiscal_quarter}
                                  {lastResult.eps_surprise != null && (
                                    <span className="ml-1 text-[#484f58]">{lastResult.eps_surprise >= 0 ? "+" : ""}{lastResult.eps_surprise.toFixed(2)}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        {(() => {
                          const trends = analystTrends[h.ticker];
                          const current = trends?.find(t => t.period === "0m") ?? trends?.[0];
                          if (!current) return <span className="text-[#484f58] text-[10px]">—</span>;
                          const bullish = current.strong_buy + current.buy;
                          const bearish = current.sell + current.strong_sell;
                          const total = bullish + current.hold + bearish;
                          if (total === 0) return <span className="text-[#484f58] text-[10px]">—</span>;
                          const label = bullish > bearish + current.hold ? "Buy" : bearish > bullish ? "Sell" : "Hold";
                          const color = label === "Buy" ? "text-[#3fb950] bg-[#3fb95015] border-[#3fb95040]" : label === "Sell" ? "text-[#f85149] bg-[#f8514915] border-[#f8514940]" : "text-[#8b949e] bg-[#8b949e15] border-[#8b949e40]";
                          return (
                            <span className={`inline-flex items-center text-[10px] font-medium ${color} border px-1.5 py-0.5 rounded`} title={`${current.strong_buy} Strong Buy · ${current.buy} Buy · ${current.hold} Hold · ${current.sell} Sell · ${current.strong_sell} Strong Sell`}>
                              {label} ({bullish}B {current.hold}H {bearish}S)
                            </span>
                          );
                        })()}
                      </td>
                      <td className={`px-3 py-2.5 text-center ${rowBorder}`}>
                        <button
                          onClick={() => handleDelete(h.id)}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-[#484f58] hover:text-[#f85149] transition"
                          title="Remove holding"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
        {/* End Add Ticker tab */}

        {/* Screener tab content */}
        <div className={internalTab === "screener" ? "" : "hidden"}>
          <Screener
            existingTickers={holdings.map(h => h.ticker)}
            onAddTicker={async (ticker) => {
              try {
                await addHolding({ ticker, shares: 0, cost_basis: 0, current_price: 0 });
                onChanged();
              } catch { /* ignore duplicates */ }
            }}
            onRemoveTicker={async (ticker) => {
              const holding = holdings.find(h => h.ticker.toUpperCase() === ticker.toUpperCase());
              if (holding) {
                try {
                  await deleteHolding(holding.id);
                  onChanged();
                } catch { /* ignore */ }
              }
            }}
            onAddTickers={async (tickers) => {
              for (const ticker of tickers) {
                try {
                  await addHolding({ ticker, shares: 0, cost_basis: 0, current_price: 0 });
                } catch { /* ignore duplicates */ }
              }
              onChanged();
              setInternalTab("add");
            }}
          />
        </div>

        {/* News tab content */}
        <div className={internalTab === "news" ? "" : "hidden"}>
          <StockNews
            existingTickers={holdings.map(h => h.ticker)}
            onAddTicker={async (ticker) => {
              try {
                await addHolding({ ticker, shares: 0, cost_basis: 0, current_price: 0 });
                onChanged();
              } catch { /* ignore duplicates */ }
            }}
            onRemoveTicker={async (ticker) => {
              const holding = holdings.find(h => h.ticker.toUpperCase() === ticker.toUpperCase());
              if (holding) {
                try {
                  await deleteHolding(holding.id);
                  onChanged();
                } catch { /* ignore */ }
              }
            }}
            onAddTickers={async (tickers) => {
              for (const ticker of tickers) {
                try {
                  await addHolding({ ticker, shares: 0, cost_basis: 0, current_price: 0 });
                } catch { /* ignore duplicates */ }
              }
              onChanged();
            }}
          />
        </div>
      </div>
    </section>
  );
}
