"use client";

import { useMemo, useState } from "react";
import type { ScreenerCandidate } from "@/lib/types";
import { getScreenerCandidates } from "@/lib/api";
import TickerLink from "./TickerLink";

type SortField = "ticker" | "price" | "upside" | "score";
type SortDir = "asc" | "desc";

interface Props {
  onAddTicker: (ticker: string) => void;
  onAddTickers: (tickers: string[]) => void;
  onRemoveTicker?: (ticker: string) => void;
  existingTickers?: string[];
}

export default function Screener({ onAddTicker, onRemoveTicker, existingTickers = [] }: Props) {
  const [candidates, setCandidates] = useState<ScreenerCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customTickers, setCustomTickers] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedCandidates = useMemo(() => {
    const sorted = [...candidates];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      } else if (sortField === "price") {
        cmp = a.current_price - b.current_price;
      } else if (sortField === "upside") {
        cmp = (a.upside_percent ?? 0) - (b.upside_percent ?? 0);
      } else {
        cmp = a.value_score - b.value_score;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [candidates, sortField, sortDir]);

  async function runScreener() {
    setLoading(true);
    setError(null);
    try {
      const tickers = customTickers.trim()
        ? customTickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean)
        : undefined;
      const results = await getScreenerCandidates(tickers);
      setCandidates(results);
      setHasRun(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screener failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#3fb950]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h3 className="text-xs font-bold text-[#c9d1d9] uppercase tracking-wider">Undervalued Stock Screener</h3>
        </div>
        <button
          type="button"
          onClick={runScreener}
          disabled={loading}
          className="flex items-center gap-1.5 btn-primary px-3 py-1.5 text-[10px]"
        >
          {loading ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Scanning…
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              {hasRun ? "Re-scan" : "Scan"}
            </>
          )}
        </button>
      </div>

      <div className="px-4 py-3">
        {/* Custom tickers input */}
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={customTickers}
            onChange={(e) => setCustomTickers(e.target.value.toUpperCase())}
            placeholder="Custom tickers (e.g. AAPL,MSFT) or leave blank for defaults"
            className="input flex-1 py-1.5"
          />
        </div>

        {error && (
          <div className="alert-error mb-3">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        {!hasRun && !loading && (
          <div className="empty-state py-8">
            <div className="empty-state-icon">
              <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <p className="text-[#8b949e] text-xs font-medium">Find undervalued stocks for the wheel</p>
            <p className="text-[#484f58] text-[10px] mt-1">Screens 40 popular stocks by analyst targets, P/E, PEG, P/B</p>
          </div>
        )}

        {/* Results table */}
        {hasRun && candidates.length === 0 && !loading && (
          <p className="text-center text-[#484f58] text-xs py-6">No undervalued candidates found with current criteria.</p>
        )}

        {candidates.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="px-2 py-2 w-8">
                    <svg className="w-3.5 h-3.5 text-[#8b949e] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                    </svg>
                  </th>
                  <th
                    className="px-2 py-2 text-left th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                    onClick={() => toggleSort("ticker")}
                  >
                    Ticker{sortField === "ticker" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th
                    className="px-2 py-2 text-right th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                    onClick={() => toggleSort("price")}
                  >
                    Price{sortField === "price" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="px-2 py-2 text-right th">Target</th>
                  <th
                    className="px-2 py-2 text-right th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                    onClick={() => toggleSort("upside")}
                  >
                    Upside{sortField === "upside" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="px-2 py-2 text-right th">Fwd P/E</th>
                  <th className="px-2 py-2 text-right th">PEG</th>
                  <th className="px-2 py-2 text-right th">P/B</th>
                  <th
                    className="px-2 py-2 text-right th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                    onClick={() => toggleSort("score")}
                  >
                    Score{sortField === "score" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="px-2 py-2 text-left th">Why</th>
                </tr>
              </thead>
              <tbody>
                {sortedCandidates.map((c, idx) => {
                  const isLast = idx === sortedCandidates.length - 1;
                  const rowBorder = isLast ? "" : "border-b border-[#21262d]";
                  const scoreColor = c.value_score >= 70 ? "text-[#3fb950]" : c.value_score >= 45 ? "text-[#d29922]" : "text-[#8b949e]";
                  return (
                    <tr key={c.ticker} className="group hover:bg-[#1c2128] transition-colors">
                      <td className={`px-2 py-2 ${rowBorder}`}>
                        <input
                          type="checkbox"
                          checked={existingTickers.map(t => t.toUpperCase()).includes(c.ticker.toUpperCase())}
                          onChange={() => {
                            const inCart = existingTickers.map(t => t.toUpperCase()).includes(c.ticker.toUpperCase());
                            inCart ? onRemoveTicker?.(c.ticker) : onAddTicker(c.ticker);
                          }}
                          className="rounded border-[#30363d] bg-[#0d1117] text-[#3fb950] focus:ring-[#3fb950] focus:ring-offset-0 w-3.5 h-3.5"
                        />
                      </td>
                      <td className={`px-2 py-2 ${rowBorder}`}>
                        <TickerLink ticker={c.ticker} className="font-bold text-[#58a6ff] tracking-wider uppercase hover:underline cursor-pointer" />
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums text-[#c9d1d9] ${rowBorder}`}>
                        ${c.current_price.toFixed(2)}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums text-[#8b949e] ${rowBorder}`}>
                        {c.target_price ? `$${c.target_price.toFixed(2)}` : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${rowBorder} ${
                        (c.upside_percent ?? 0) >= 20 ? "text-[#3fb950]" : (c.upside_percent ?? 0) >= 10 ? "text-[#56d364]" : "text-[#8b949e]"
                      }`}>
                        {c.upside_percent != null ? `${c.upside_percent.toFixed(1)}%` : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums text-[#8b949e] ${rowBorder}`}>
                        {c.forward_pe != null ? c.forward_pe.toFixed(1) : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${rowBorder} ${
                        c.peg_ratio != null && c.peg_ratio < 1 ? "text-[#3fb950] font-medium" : "text-[#8b949e]"
                      }`}>
                        {c.peg_ratio != null ? c.peg_ratio.toFixed(2) : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${rowBorder} ${
                        c.price_to_book != null && c.price_to_book < 1 ? "text-[#3fb950] font-medium" : "text-[#8b949e]"
                      }`}>
                        {c.price_to_book != null ? c.price_to_book.toFixed(2) : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right ${rowBorder}`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-8 h-1 rounded-full bg-[#21262d] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${c.value_score}%`,
                                backgroundColor: c.value_score >= 70 ? '#3fb950' : c.value_score >= 45 ? '#d29922' : '#484f58',
                              }}
                            />
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums ${scoreColor}`}>{c.value_score}</span>
                        </div>
                      </td>
                      <td className={`px-2 py-2 ${rowBorder}`}>
                        <div className="flex flex-wrap gap-1">
                          {c.reasons.slice(0, 2).map((r, i) => (
                            <span key={i} className="text-[9px] text-[#8b949e] bg-[#0d1117] border border-[#30363d] px-1.5 py-0.5 rounded whitespace-nowrap">
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
