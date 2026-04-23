"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { StockHolding, StockHoldingInput, StockMarketData } from "@/lib/types";
import { addHolding, deleteHolding, getMarketData } from "@/lib/api";

interface Props {
  holdings: StockHolding[];
  onChanged: () => void;
  availableCash?: number;
  onCashChanged?: (amount: number) => void;
  minPremiumAbs?: number;
  minPremiumPct?: number;
  onMinPremiumAbsChanged?: (amount: number) => void;
  onMinPremiumPctChanged?: (pctDecimal: number) => void;
  watchlist?: { ticker: string; price: number | null }[];
  watchlistInput?: string;
  onWatchlistInputChange?: (val: string) => void;
  onAddWatchlistTicker?: (e: React.FormEvent) => void;
  onRemoveWatchlistTicker?: (t: string) => void;
}

interface FormFields {
  ticker: string;
  shares: string;
  cost_basis: string;
}

const EMPTY_FORM: FormFields = {
  ticker: "",
  shares: "",
  cost_basis: "",
};

export default function InventoryForm({
  holdings,
  onChanged,
  onCashChanged,
  minPremiumAbs,
  minPremiumPct,
  onMinPremiumAbsChanged,
  onMinPremiumPctChanged,
  watchlist = [],
  watchlistInput = "",
  onWatchlistInputChange,
  onAddWatchlistTicker,
  onRemoveWatchlistTicker,
}: Props) {
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [cashInput, setCashInput] = useState<string>("");
  const [minPremiumAbsInput, setMinPremiumAbsInput] = useState<string>(
    (minPremiumAbs ?? 0.25).toFixed(2),
  );
  const [minPremiumPctInput, setMinPremiumPctInput] = useState<string>(
    ((minPremiumPct ?? 0.0015) * 100).toFixed(2),
  );
  const [cashEditing, setCashEditing] = useState(false);
  const cashRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<Record<string, StockMarketData>>({});
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const refreshMarketData = useCallback(async () => {
    if (holdings.length === 0) return;
    const tickers = [...new Set(holdings.map((h) => h.ticker))];
    setLoadingMarket(true);
    try {
      const data = await getMarketData(tickers);
      setMarketData(data);
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

  function formatLive(raw: string): string {
    if (!raw) return "";
    const num = parseInt(raw, 10);
    return isNaN(num) ? "" : num.toLocaleString();
  }

  function handleCashChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const oldFormatted = input.value;
    const cursorPos = input.selectionStart ?? oldFormatted.length;
    const commasBefore = (oldFormatted.slice(0, cursorPos).match(/,/g) || []).length;

    const raw = oldFormatted.replace(/[^0-9]/g, "");
    setCashInput(raw);
    onCashChanged?.(parseInt(raw, 10) || 0);

    requestAnimationFrame(() => {
      const el = cashRef.current;
      if (!el) return;
      const newCommasBefore = (el.value.slice(0, cursorPos).match(/,/g) || []).length;
      const newPos = Math.max(0, cursorPos + (newCommasBefore - commasBefore));
      el.setSelectionRange(newPos, newPos);
    });
  }

  function handleMinPremiumAbsChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setMinPremiumAbsInput(value);
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onMinPremiumAbsChanged?.(parsed);
    }
  }

  function handleMinPremiumPctChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setMinPremiumPctInput(value);
    const parsedPercent = parseFloat(value);
    if (!Number.isNaN(parsedPercent) && parsedPercent >= 0) {
      onMinPremiumPctChanged?.(parsedPercent / 100);
    }
  }

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

    const shares = parseInt(form.shares, 10) || 0;
    const payload: StockHoldingInput = {
      ticker: form.ticker,
      shares,
      cost_basis: parseFloat(form.cost_basis) || 0,
      current_price: 0,
    };

    setSaving(true);
    setError(null);
    try {
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
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-8">
        {/* Available Cash + Watchlist */}
        <div className="flex items-start gap-4 mb-8 p-5 rounded-2xl border border-slate-200 bg-slate-50">
          {/* Icon block */}
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-100 text-emerald-600 shrink-0">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>

          {/* Label + editable amount */}
          <div className="flex flex-col min-w-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
              Available Cash for CSP
            </p>
            {cashEditing ? (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold select-none">$</span>
                <input
                  ref={cashRef}
                  type="text"
                  inputMode="numeric"
                  value={formatLive(cashInput)}
                  onChange={handleCashChange}
                  onBlur={() => setCashEditing(false)}
                  onKeyDown={e => e.key === "Enter" && setCashEditing(false)}
                  autoFocus
                  placeholder="0"
                  className="w-40 border border-emerald-400 rounded-lg pl-7 pr-3 py-2 text-sm font-bold tabular-nums text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setCashEditing(true); setTimeout(() => cashRef.current?.select(), 0); }}
                className="group flex items-center gap-2 text-left"
              >
                <span className="text-2xl font-extrabold tabular-nums text-slate-900 leading-none">
                  ${cashInput ? parseInt(cashInput, 10).toLocaleString() : "0"}
                </span>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.1 2.1 0 112.97 2.97L8.5 18.81l-4 1 1-4 11.362-11.323z" />
                </svg>
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-slate-200 self-stretch mx-2" />

          {/* Watchlist */}
          <div className="flex items-start gap-6 flex-1 min-w-0">
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Watchlist</p>
              <form onSubmit={onAddWatchlistTicker} className="flex gap-2">
                <input
                  type="text"
                  value={watchlistInput}
                  onChange={e => onWatchlistInputChange?.(e.target.value.toUpperCase())}
                  placeholder="e.g. NVDA, TSLA"
                  className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-bold uppercase placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm transition shrink-0"
                >
                  Add
                </button>
              </form>
              {watchlist.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {watchlist.map(({ ticker: t, price }) => (
                    <span key={t} className="flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-300 text-sm font-bold px-3 py-1.5 rounded-full">
                      <span>{t}</span>
                      {price !== null
                        ? <span className="font-normal text-amber-700">${price.toFixed(2)}</span>
                        : <span className="font-normal text-amber-500 italic text-xs">…</span>}
                      <button type="button" onClick={() => onRemoveWatchlistTicker?.(t)} className="hover:opacity-70 text-lg leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <label className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Min $/share</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={minPremiumAbsInput}
                    onChange={handleMinPremiumAbsChange}
                    className="w-full text-sm font-semibold text-right bg-transparent outline-none"
                  />
                </label>
                <label className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Min % strike</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={minPremiumPctInput}
                    onChange={handleMinPremiumPctChange}
                    className="w-full text-sm font-semibold text-right bg-transparent outline-none"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Add form */}
        <div className="mb-8">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            Add New Holding
          </p>
          {importError && (
            <div className="flex items-center gap-2 text-red-600 text-xs font-medium bg-red-50 px-3 py-2 rounded-lg border border-red-200 mb-3">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {importError}
            </div>
          )}
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[110px]">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Ticker</label>
              <input
                name="ticker"
                value={form.ticker}
                onChange={handleChange}
                placeholder="AAPL"
                maxLength={6}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-bold uppercase placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition"
              />
            </div>
            <div className="flex-1 min-w-[130px]">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Shares</label>
              <input
                name="shares"
                type="number"
                min={1}
                step={1}
                value={form.shares}
                onChange={handleChange}
                placeholder="100"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition"
              />
            </div>
            <div className="flex-1 min-w-[130px]">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Avg Cost ($)</label>
              <input
                name="cost_basis"
                type="number"
                min={0}
                step={0.01}
                value={form.cost_basis}
                onChange={handleChange}
                placeholder="0.00"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg transition text-sm shadow-sm hover:shadow-md flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Adding…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-300 hover:border-slate-400 bg-white px-3 py-2.5 rounded-lg transition"
              title="Download CSV template"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              Template
            </button>
            <label className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-300 hover:border-slate-400 bg-white px-3 py-2.5 rounded-lg transition cursor-pointer" title="Import CSV">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
          </form>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm font-medium bg-red-50 px-4 py-3 rounded-lg border border-red-200 mb-6">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Holdings table */}
        {holdings.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Positions</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshMarketData}
                disabled={loadingMarket}
                title="Refresh market prices"
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition"
              >
                <svg
                  className={`w-3.5 h-3.5 ${loadingMarket ? "animate-spin" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {loadingMarket ? "Refreshing…" : "Refresh Prices"}
              </button>
            </div>
          </div>
        )}
        {/* end positions header */}
        {holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm font-semibold">No holdings yet</p>
            <p className="text-slate-400 text-xs mt-1">Add a position above to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 rounded-tl-lg border-y border-l border-slate-200">Ticker</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-y border-slate-200">Shares</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-y border-slate-200">Avg Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-y border-slate-200 whitespace-nowrap">
                    Current Price
                    {loadingMarket && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse align-middle" />}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-y border-slate-200 whitespace-nowrap">P&amp;L</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-y border-slate-200 whitespace-nowrap">Low</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-y border-slate-200 whitespace-nowrap">High</th>
                  <th className="px-4 py-3 bg-slate-50 rounded-tr-lg border-y border-r border-slate-200 w-10" />
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, idx) => {
                  const md = marketData[h.ticker];
                  const price = md?.price ?? h.current_price;
                  const pnlPct =
                    h.cost_basis > 0
                      ? ((price - h.cost_basis) / h.cost_basis) * 100
                      : 0;
                  const pnlAbs = (price - h.cost_basis) * h.shares;
                  const isLast = idx === holdings.length - 1;
                  const rowBorder = isLast ? "border-b border-slate-200" : "border-b border-slate-100";
                  return (
                    <tr key={h.id} className="group hover:bg-indigo-50/40 transition-colors">
                      <td className={`px-4 py-4 border-l border-slate-200 ${rowBorder}`}>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-extrabold tracking-widest uppercase w-fit">
                            {h.ticker}
                          </span>
                      </td>
                      <td className={`px-4 py-4 text-right tabular-nums text-slate-700 font-medium ${rowBorder}`}>
                        {h.shares.toLocaleString()}
                      </td>
                      <td className={`px-4 py-4 text-right tabular-nums text-slate-600 ${rowBorder}`}>
                        ${h.cost_basis.toFixed(2)}
                      </td>
                      <td className={`px-4 py-4 text-right ${rowBorder}`}>
                        {md ? (
                          <span className="font-bold text-slate-900 tabular-nums">${md.price.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right ${rowBorder}`}>
                        {md ? (
                          <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md whitespace-nowrap ${pnlPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                            <span className="ml-1 opacity-70">{pnlAbs >= 0 ? "+" : ""}${Math.abs(pnlAbs).toFixed(0)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right ${rowBorder}`}>
                        {md ? (
                          <div className="flex flex-col items-end gap-0.5 tabular-nums text-xs font-medium">
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">52W</span>
                              ${md.week52_low.toFixed(2)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-orange-500">
                              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">Day</span>
                              ${md.daily_low.toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right border-r border-slate-200 ${rowBorder}`}>
                        {md ? (
                          <div className="flex flex-col items-end gap-0.5 tabular-nums text-xs font-medium">
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">52W</span>
                              ${md.week52_high.toFixed(2)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">Day</span>
                              ${md.daily_high.toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-center border-r border-slate-200 ${rowBorder}`}>
                        <button
                          onClick={() => handleDelete(h.id)}
                          className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                          title="Remove holding"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
    </section>
  );
}
