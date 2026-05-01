"use client";

import { useState } from "react";
import type { ScreenerCandidate } from "@/lib/types";
import { getScreenerCandidates } from "@/lib/api";

interface Props {
  onAddTicker: (ticker: string) => void;
}

export default function Screener({ onAddTicker }: Props) {
  const [candidates, setCandidates] = useState<ScreenerCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customTickers, setCustomTickers] = useState("");
  const [hasRun, setHasRun] = useState(false);

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
    <div className="bg-[#161b22] rounded border border-[#30363d] overflow-hidden">
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
          className="flex items-center gap-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded text-[10px] transition"
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
            className="flex-1 border border-[#30363d] rounded px-3 py-1.5 text-xs placeholder:text-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] bg-[#0d1117] text-[#c9d1d9] transition"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[#f85149] text-xs font-medium bg-[#f8514915] px-3 py-2 rounded border border-[#f8514930] mb-3">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        {!hasRun && !loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded bg-[#1c2128] flex items-center justify-center mb-3">
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
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Ticker</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Price</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Target</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Upside</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Fwd P/E</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">PEG</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">P/B</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Score</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Why</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, idx) => {
                  const isLast = idx === candidates.length - 1;
                  const rowBorder = isLast ? "" : "border-b border-[#21262d]";
                  const scoreColor = c.value_score >= 70 ? "text-[#3fb950]" : c.value_score >= 45 ? "text-[#d29922]" : "text-[#8b949e]";
                  return (
                    <tr key={c.ticker} className="group hover:bg-[#1c2128] transition-colors">
                      <td className={`px-2 py-2 ${rowBorder}`}>
                        <span className="font-bold text-[#c9d1d9] tracking-wider uppercase">{c.ticker}</span>
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
                      <td className={`px-2 py-2 ${rowBorder}`}>
                        <button
                          type="button"
                          onClick={() => onAddTicker(c.ticker)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#58a6ff] hover:text-[#79c0ff] text-[10px] font-medium"
                          title={`Add ${c.ticker} to portfolio`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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
    </div>
  );
}
