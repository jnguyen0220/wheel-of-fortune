"use client";

import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { WheelRecommendation, EarningsCalendar, EarningsResult, AnalystTrend, FinancialHealth } from "@/lib/types";
import { getFinancialHealth } from "@/lib/api";
import type { StrategyFilters } from "./OptionsTab";
import { DEFAULT_FILTERS } from "./OptionsTab";

interface Props {
  /** Pre-computed trades from the Rust recommendation engine. */
  recommendations: WheelRecommendation[];
  earningsCalendar?: Record<string, EarningsCalendar[]>;
  earningsHistory?: Record<string, EarningsResult[]>;
  analystTrends?: Record<string, AnalystTrend[]>;
  onRecommendations: (availableCash: number, filters: StrategyFilters) => void;
  recommendationsLoading: boolean;
  hasShares: boolean;
}


interface DisplayTrade {
  num: number;
  rec: WheelRecommendation;
}

function TradesTable({ ccTrades, cspTrades, earningsCalendar, earningsHistory, analystTrends }: {
  ccTrades: DisplayTrade[];
  cspTrades: DisplayTrade[];
  earningsCalendar?: Record<string, EarningsCalendar[]>;
  earningsHistory?: Record<string, EarningsResult[]>;
  analystTrends?: Record<string, AnalystTrend[]>;
}) {
  const [activeTicker, setActiveTicker] = useState<string>("");
  const [activeType, setActiveType] = useState<"cc" | "csp">("cc");
  const [sortCol, setSortCol] = useState<"rank" | "strike" | "dte" | "premium">("dte");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const scoreBtnRef = useRef<HTMLButtonElement>(null);
  const [scorePos, setScorePos] = useState<{ top: number; right: number } | null>(null);
  const [healthData, setHealthData] = useState<Record<string, FinancialHealth>>({});

  // Get all unique tickers across CC and CSP, sorted alphabetically
  const allTickers = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of ccTrades) set.add(t.rec.ticker);
    for (const t of cspTrades) set.add(t.rec.ticker);
    return [...set].sort();
  }, [ccTrades, cspTrades]);

  // Auto-select first ticker
  React.useEffect(() => {
    if (allTickers.length > 0 && !allTickers.includes(activeTicker)) {
      setActiveTicker(allTickers[0]);
    }
  }, [allTickers, activeTicker]);

  // Fetch health data
  React.useEffect(() => {
    if (allTickers.length > 0) {
      getFinancialHealth(allTickers).then(setHealthData).catch(() => {});
    }
  }, [allTickers]);

  // Trades for active ticker
  const tickerCC = React.useMemo(() =>
    ccTrades.filter(t => t.rec.ticker === activeTicker)
      .sort((a, b) => a.rec.contract.dte - b.rec.contract.dte),
    [ccTrades, activeTicker],
  );

  const tickerCSP = React.useMemo(() =>
    cspTrades.filter(t => t.rec.ticker === activeTicker)
      .sort((a, b) => a.rec.contract.dte - b.rec.contract.dte),
    [cspTrades, activeTicker],
  );

  // Auto-select available type when ticker changes
  React.useEffect(() => {
    if (activeType === "cc" && tickerCC.length === 0 && tickerCSP.length > 0) setActiveType("csp");
    if (activeType === "csp" && tickerCSP.length === 0 && tickerCC.length > 0) setActiveType("cc");
  }, [activeTicker, tickerCC.length, tickerCSP.length, activeType]);

  const activeTrades = activeType === "cc" ? tickerCC : tickerCSP;
  const isCSP = activeType === "csp";

  const sortedTrades = React.useMemo(() => {
    const sorted = [...activeTrades].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "rank") cmp = a.num - b.num;
      else if (sortCol === "strike") cmp = a.rec.contract.strike - b.rec.contract.strike;
      else if (sortCol === "dte") cmp = a.rec.contract.dte - b.rec.contract.dte;
      else if (sortCol === "premium") {
        const pA = ((a.rec.contract.bid + a.rec.contract.ask) / 2) * a.rec.contracts_allocated * 100;
        const pB = ((b.rec.contract.bid + b.rec.contract.ask) / 2) * b.rec.contracts_allocated * 100;
        cmp = pA - pB;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [activeTrades, sortCol, sortDir]);

  function toggleSort(col: "rank" | "strike" | "dte" | "premium") {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  // Underlying price from first trade of active ticker
  const underlying = activeTrades[0]?.rec.contract.underlying_price
    ?? tickerCC[0]?.rec.contract.underlying_price
    ?? tickerCSP[0]?.rec.contract.underlying_price
    ?? 0;

  if (allTickers.length === 0) {
    return (
      <div className="rounded-lg border border-[#21262d] bg-[#0d1117] px-5 py-8 text-center">
        <p className="text-xs text-[#484f58]">No trades available</p>
      </div>
    );
  }

  const historyArr = earningsHistory?.[activeTicker] ?? [];
  const lastResult = historyArr[historyArr.length - 1];

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden shadow-sm shadow-black/20">
      {/* ── Ticker tabs + stats ── */}
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-3 border-b border-[#21262d]">
        <div className="flex items-center gap-2">
          {allTickers.map((ticker) => {
              const erDays = (earningsCalendar?.[ticker] ?? []).find(e => e.days_until >= 0)?.days_until;
              const erDot = erDays !== undefined && erDays <= 14;
              const erColor = erDays !== undefined && erDays <= 7 ? "bg-[#f85149]" : "bg-[#d29922]";
              return (
              <button
                key={ticker}
                onClick={() => setActiveTicker(ticker)}
                className={activeTicker === ticker
                    ? "ticker-tab-active"
                    : "ticker-tab-inactive"
                }
                title={erDot ? `Earnings in ${erDays}d` : undefined}
              >
                {ticker}
                {erDot && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse opacity-90 ${erColor}`} />
                )}
              </button>
              );
            })}
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2">
          <div className="stat-pill">
            <span className="stat-pill-label">Last</span>
            <span className="stat-pill-value">${underlying.toFixed(2)}</span>
          </div>
          {(() => {
            const health = healthData[activeTicker];
            if (!health) return null;
            const scoreColor = health.health_score >= 80 ? "text-[#3fb950]" : health.health_score >= 65 ? "text-[#56d364]" : health.health_score >= 45 ? "text-[#d29922]" : health.health_score >= 25 ? "text-[#db6d28]" : "text-[#f85149]";
            return (
              <div className="stat-pill">
                <span className="stat-pill-label">Health</span>
                <span className={`text-xs font-bold tabular-nums ${scoreColor}`}>{health.health_score}</span>
              </div>
            );
          })()}
          {(() => {
            const erDates = earningsCalendar?.[activeTicker] ?? [];
            const next = erDates.find(e => e.days_until >= 0) ?? erDates[0];
            if (!next || next.days_until < 0) return null;
            return (
              <div className="stat-pill">
                <span className="stat-pill-label">ER</span>
                <span className={`text-xs font-bold tabular-nums ${next.days_until <= 7 ? "text-[#f85149]" : next.days_until <= 14 ? "text-[#d29922]" : "text-[#8b949e]"}`}>{next.days_until === 0 ? "TODAY" : `${next.days_until}d`}</span>
              </div>
            );
          })()}
          {lastResult && (
            <div className={`flex items-center gap-1.5 h-[30px] px-2.5 rounded-md border ${lastResult.beat ? "bg-[#3fb95010] border-[#3fb95040]" : "bg-[#f8514910] border-[#f8514940]"}`}>
              <span className={`text-[10px] font-medium ${lastResult.beat ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                {lastResult.beat ? "Beat" : "Miss"} {lastResult.fiscal_quarter}
              </span>
            </div>
          )}
          {(() => {
            const trends = analystTrends?.[activeTicker];
            const current = trends?.find(t => t.period === "0m") ?? trends?.[0];
            if (!current) return null;
            const bullish = current.strong_buy + current.buy;
            const bearish = current.sell + current.strong_sell;
            const total = bullish + current.hold + bearish;
            if (total === 0) return null;
            const label = bullish > bearish + current.hold ? "Buy" : bearish > bullish ? "Sell" : "Hold";
            const color = label === "Buy" ? "text-[#3fb950] bg-[#3fb95010] border-[#3fb95040]" : label === "Sell" ? "text-[#f85149] bg-[#f8514910] border-[#f8514940]" : "text-[#8b949e] bg-[#8b949e10] border-[#8b949e40]";
            return (
              <div className={`flex items-center gap-1.5 h-[30px] px-2.5 rounded-md border ${color}`} title={`${current.strong_buy} Strong Buy · ${current.buy} Buy · ${current.hold} Hold · ${current.sell} Sell · ${current.strong_sell} Strong Sell`}>
                <span className="text-[10px] font-medium">{label} ({bullish}B {current.hold}H {bearish}S)</span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── CC / CSP toggle ── */}
      <div className="px-4 py-2 border-b border-[#21262d] bg-[#0d1117]/60 flex items-center gap-3">
        <div className="flex rounded-md overflow-hidden border border-[#30363d]">
          {([
            { key: "cc" as const, label: "Covered Calls", count: tickerCC.length, color: "bg-[#d29922]" },
            { key: "csp" as const, label: "Cash-Secured Puts", count: tickerCSP.length, color: "bg-[#58a6ff]" },
          ]).map(({ key, label, count, color }) => (
            <button
              key={key}
              onClick={() => setActiveType(key)}
              disabled={count === 0}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[10px] font-semibold transition ${
                activeType === key
                  ? `${color} text-white`
                  : "bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 disabled:cursor-not-allowed"
              }`}
            >
              {label}
              <span className={`min-w-[16px] text-center tabular-nums text-[10px] ${activeType === key ? "text-white/80" : "text-[#484f58]"}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Trades table ── */}
      {activeTrades.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-[#484f58]">
          No {isCSP ? "cash-secured put" : "covered call"} trades for {activeTicker}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#21262d] text-[10px] font-semibold text-[#484f58] uppercase tracking-wider bg-[#0d1117]/80">
              <th className="pl-3 pr-1 py-2 text-center w-9 cursor-pointer select-none hover:text-[#c9d1d9]" onClick={() => toggleSort("rank")}># <span className={sortCol === "rank" ? "text-[#c9d1d9]" : "text-[#30363d]"}>{sortCol === "rank" && sortDir === "desc" ? "▼" : "▲"}</span></th>
              <th className="px-2 py-2 text-left cursor-pointer select-none hover:text-[#c9d1d9]" onClick={() => toggleSort("strike")}>Strike <span className={sortCol === "strike" ? "text-[#c9d1d9]" : "text-[#30363d]"}>{sortCol === "strike" && sortDir === "desc" ? "▼" : "▲"}</span></th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-left">Expiry</th>
              <th className="px-2 py-2 text-right cursor-pointer select-none hover:text-[#c9d1d9]" onClick={() => toggleSort("dte")}>DTE <span className={sortCol === "dte" ? "text-[#c9d1d9]" : "text-[#30363d]"}>{sortCol === "dte" && sortDir === "desc" ? "▼" : "▲"}</span></th>
              <th className="px-2 py-2 text-right" title="Estimated date to close at 50% profit (theta decay curve)">
                <span className="text-[#3fb950]">↗</span> 50%
              </th>
              <th className="px-2 py-2 text-right" title="Estimated date to close at 80% profit (theta decay curve)">
                <span className="text-[#3fb950]">↗</span> 80%
              </th>
              <th className="px-2 py-2 text-right">Mid</th>
              <th className="px-2 py-2 text-right cursor-pointer select-none hover:text-[#c9d1d9]" onClick={() => toggleSort("premium")}>Premium <span className={sortCol === "premium" ? "text-[#c9d1d9]" : "text-[#30363d]"}>{sortCol === "premium" && sortDir === "desc" ? "▼" : "▲"}</span></th>
              <th className="px-2 py-2 text-right">ROC</th>
              {isCSP && <th className="px-2 py-2 text-right">Collateral</th>}
              <th className="px-2 py-2 text-right">OI</th>
              <th className="pr-3 pl-2 py-2 text-right">
                <button
                  ref={scoreBtnRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!showScoreInfo && scoreBtnRef.current) {
                      const rect = scoreBtnRef.current.getBoundingClientRect();
                      setScorePos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                    }
                    setShowScoreInfo(v => !v);
                  }}
                  className="underline decoration-dotted decoration-[#484f58] text-[#58a6ff] hover:text-[#79c0ff] cursor-pointer"
                >
                  Quality
                </button>
                {showScoreInfo && scorePos && createPortal(
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowScoreInfo(false)} />
                    <div
                      className="fixed z-50 w-72 rounded-lg border border-[#30363d] bg-[#161b22] shadow-xl shadow-black/50 p-4 text-left text-[10px]"
                      style={{ top: scorePos.top, right: scorePos.right }}
                    >
                      <p className="font-semibold text-[#c9d1d9] text-[11px] mb-2.5">Quality Score (0–100)</p>
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-[#30363d] text-[#8b949e]">
                            <th className="py-1 text-left font-semibold">Component</th>
                            <th className="py-1 text-right font-semibold">Max</th>
                            <th className="py-1 text-left pl-2 font-semibold">How</th>
                          </tr>
                        </thead>
                        <tbody className="text-[#c9d1d9]">
                          <tr className="border-b border-[#21262d]">
                            <td className="py-1.5">ROC</td>
                            <td className="py-1.5 text-right text-[#3fb950]">50</td>
                            <td className="py-1.5 pl-2 text-[#8b949e]">Annualised return, capped at 60%</td>
                          </tr>
                          <tr className="border-b border-[#21262d]">
                            <td className="py-1.5">Delta</td>
                            <td className="py-1.5 text-right text-[#3fb950]">20</td>
                            <td className="py-1.5 pl-2 text-[#8b949e]">Proximity to 0.275 target</td>
                          </tr>
                          <tr className="border-b border-[#21262d]">
                            <td className="py-1.5">Liquidity</td>
                            <td className="py-1.5 text-right text-[#3fb950]">20</td>
                            <td className="py-1.5 pl-2 text-[#8b949e]">Open interest, full at 5 000+</td>
                          </tr>
                          <tr>
                            <td className="py-1.5">IV</td>
                            <td className="py-1.5 text-right text-[#3fb950]">10</td>
                            <td className="py-1.5 pl-2 text-[#8b949e]">Sweet spot 25–60%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>,
                  document.body
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTrades.map((t) => {
              const { rec } = t;
              const mid = (rec.contract.bid + rec.contract.ask) / 2;
              const contracts = rec.contracts_allocated;
              const totalPremium = mid * contracts * 100;
              const collateral = rec.contract.strike * contracts * 100;

              return (
                <tr
                  key={`${activeTicker}-${activeType}-${t.num}`}
                  className={`transition-colors hover:bg-[#1c2128] border-b border-[#21262d] last:border-b-0 ${t.num % 2 === 0 ? "bg-[#0d1117]/30" : ""}`}
                >
                    <td className="pl-3 pr-1 py-1.5 text-center tabular-nums text-[10px] text-[#484f58]">
                      {t.num}
                    </td>
                    <td className="px-2 py-1.5 font-medium text-[#c9d1d9] tabular-nums">${rec.contract.strike.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[#c9d1d9]">
                      {contracts}<span className="text-[8px] text-[#484f58] ml-0.5">×100</span>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-[#8b949e]">{rec.contract.expiration}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <span className="text-[#8b949e]">{rec.contract.dte}d</span>
                    </td>
                    <td className="px-2 py-1.5 text-right" title="Close at 50% profit">
                      {(() => { const d = Math.round(rec.contract.dte * (1 - Math.pow(1 - 0.5, 2))); const dt = new Date(); dt.setDate(dt.getDate() + d); return (
                        <div className="leading-tight">
                          <span className="text-[#c9d1d9] tabular-nums font-medium text-xs">{dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          <br />
                          <span className="text-[9px] text-[#484f58] tabular-nums">{d}d</span>
                        </div>
                      ); })()}
                    </td>
                    <td className="px-2 py-1.5 text-right" title="Close at 80% profit">
                      {(() => { const d = Math.round(rec.contract.dte * (1 - Math.pow(1 - 0.8, 2))); const dt = new Date(); dt.setDate(dt.getDate() + d); return (
                        <div className="leading-tight">
                          <span className="text-[#c9d1d9] tabular-nums font-medium text-xs">{dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          <br />
                          <span className="text-[9px] text-[#484f58] tabular-nums">{d}d</span>
                        </div>
                      ); })()}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">${mid.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-[#3fb950] tabular-nums" title={`$${mid.toFixed(2)} × ${contracts} × 100`}>
                      ${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold text-[#3fb950] tabular-nums">{rec.annualised_roc.toFixed(1)}%</td>
                    {isCSP && (
                      <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">
                        ${collateral.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{rec.contract.open_interest.toLocaleString()}</td>
                    <td className="pr-3 pl-2 py-1.5 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-10 h-1.5 rounded-full bg-[#21262d] overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${rec.quality_score}%`, backgroundColor: rec.quality_score >= 70 ? '#3fb950' : rec.quality_score >= 40 ? '#d29922' : '#f85149' }} />
                        </div>
                        <span className={`text-[10px] font-medium w-5 text-right ${rec.quality_score >= 70 ? 'text-[#3fb950]' : rec.quality_score >= 40 ? 'text-[#d29922]' : 'text-[#f85149]'}`}>{rec.quality_score.toFixed(0)}</span>
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
  );
}

export default function Recommendations({ recommendations, earningsCalendar = {}, earningsHistory = {}, analystTrends = {}, onRecommendations, recommendationsLoading, hasShares }: Props) {
  // ── Local cash state ──
  const [cashInput, setCashInput] = useState("");
  const [cashEditing, setCashEditing] = useState(false);
  const cashRef = useRef<HTMLInputElement>(null);

  const formatCash = (v: string) => {
    const digits = v.replace(/\D/g, "");
    if (!digits) return "";
    return parseInt(digits, 10).toLocaleString();
  };

  const handleCashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCashInput(e.target.value.replace(/\D/g, ""));
  };

  const startCashEdit = () => { setCashEditing(true); setTimeout(() => cashRef.current?.select(), 0); };
  const endCashEdit = () => setCashEditing(false);

  // ── Local strategy filters ──
  const [filters, setFilters] = useState<StrategyFilters>(DEFAULT_FILTERS);

  const handleRun = () => {
    const cash = cashInput ? parseInt(cashInput, 10) : 0;
    onRecommendations(cash, filters);
  };

  // Build display trades from engine order (no re-ranking).
  const { ccTrades, cspTrades } = React.useMemo(() => {
    const engineCC = recommendations.filter((r) => r.leg === "covered_call");
    const engineCSP = recommendations.filter((r) => r.leg === "cash_secured_put");
    return {
      ccTrades: engineCC.map((rec, i) => ({ num: i + 1, rec })),
      cspTrades: engineCSP.map((rec, i) => ({ num: i + 1, rec })),
    };
  }, [recommendations]);

  return (
    <section className="card-lg">
      {/* ── Strategy Engine ── */}
      <div className="px-4 py-3 bg-[#0d1117] border-b border-[#21262d]">
        <div className="flex items-center flex-wrap gap-x-3 gap-y-2">
          {/* Filter controls */}
          <div className="flex items-center flex-wrap gap-1.5">
            <div className="flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded px-2.5 py-1.5">
              <span className="text-[10px] text-[#8b949e] font-medium">DTE</span>
              <input
                type="number"
                min={0}
                value={filters.dte_min ?? DEFAULT_FILTERS.dte_min}
                onChange={(e) => setFilters({ ...filters, dte_min: parseInt(e.target.value) || 0 })}
                className="w-10 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
              <span className="text-[10px] text-[#484f58]">–</span>
              <input
                type="number"
                min={0}
                value={filters.dte_max ?? DEFAULT_FILTERS.dte_max}
                onChange={(e) => setFilters({ ...filters, dte_max: parseInt(e.target.value) || 0 })}
                className="w-10 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
              <span className="text-[10px] text-[#484f58]">d</span>
            </div>
            <div className="flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded px-2.5 py-1.5">
              <span className="text-[10px] text-[#8b949e] font-medium">ROC</span>
              <input
                type="number"
                min={0}
                step={1}
                value={filters.min_annualised_roc ?? DEFAULT_FILTERS.min_annualised_roc}
                onChange={(e) => setFilters({ ...filters, min_annualised_roc: parseFloat(e.target.value) || 0 })}
                className="w-10 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
              <span className="text-[10px] text-[#484f58]">–</span>
              <input
                type="number"
                min={0}
                step={1}
                value={filters.max_annualised_roc ?? DEFAULT_FILTERS.max_annualised_roc}
                onChange={(e) => setFilters({ ...filters, max_annualised_roc: parseFloat(e.target.value) || 0 })}
                className="w-10 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
              <span className="text-[10px] text-[#484f58]">%</span>
            </div>
            <div className="flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded px-2.5 py-1.5">
              <span className="text-[10px] text-[#8b949e] font-medium">OI ≥</span>
              <input
                type="number"
                min={0}
                value={filters.min_open_interest ?? DEFAULT_FILTERS.min_open_interest}
                onChange={(e) => setFilters({ ...filters, min_open_interest: parseInt(e.target.value) || 0 })}
                className="w-14 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
            </div>

            <span className="w-px h-5 bg-[#21262d] mx-0.5" />

            <div className="flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded px-2.5 py-1.5">
              <span className="text-[10px] text-[#d29922] font-medium">CC Δ</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={filters.cc_delta_min ?? DEFAULT_FILTERS.cc_delta_min}
                onChange={(e) => setFilters({ ...filters, cc_delta_min: parseFloat(e.target.value) || 0 })}
                className="w-10 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
              <span className="text-[10px] text-[#484f58]">–</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={filters.cc_delta_max ?? DEFAULT_FILTERS.cc_delta_max}
                onChange={(e) => setFilters({ ...filters, cc_delta_max: parseFloat(e.target.value) || 0 })}
                className="w-10 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
              <span className="text-[10px] text-[#484f58]">%</span>
            </div>
            <div className="flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded px-2.5 py-1.5">
              <span className="text-[10px] text-[#58a6ff] font-medium">CSP Δ</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={filters.csp_delta_min ?? DEFAULT_FILTERS.csp_delta_min}
                onChange={(e) => setFilters({ ...filters, csp_delta_min: parseFloat(e.target.value) || 0 })}
                className="w-10 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
              <span className="text-[10px] text-[#484f58]">–</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={filters.csp_delta_max ?? DEFAULT_FILTERS.csp_delta_max}
                onChange={(e) => setFilters({ ...filters, csp_delta_max: parseFloat(e.target.value) || 0 })}
                className="w-10 bg-transparent text-xs tabular-nums text-[#c9d1d9] text-center focus:outline-none focus:ring-0 border-b border-[#30363d] focus:border-[#58a6ff]"
              />
              <span className="text-[10px] text-[#484f58]">%</span>
            </div>
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="p-1.5 rounded text-[#484f58] hover:text-[#c9d1d9] hover:bg-[#21262d] transition"
              title="Reset filters"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>

          {/* Cash + Run — pushed right */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#484f58] uppercase tracking-wider font-medium whitespace-nowrap">CSP Cash</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#3fb950] text-[10px] font-bold select-none">$</span>
                {cashEditing ? (
                  <input
                    ref={cashRef}
                    type="text"
                    inputMode="numeric"
                    value={formatCash(cashInput)}
                    onChange={handleCashChange}
                    onBlur={endCashEdit}
                    onKeyDown={e => e.key === "Enter" && endCashEdit()}
                    autoFocus
                    placeholder="0"
                    className="w-24 border border-[#58a6ff] rounded pl-5 pr-2 py-1.5 text-xs font-bold tabular-nums text-[#c9d1d9] bg-[#161b22] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={startCashEdit}
                    className="w-24 text-left border border-[#30363d] rounded pl-5 pr-2 py-1.5 text-xs font-bold tabular-nums text-[#3fb950] bg-[#161b22] hover:border-[#8b949e] transition cursor-text"
                  >
                    {cashInput ? parseInt(cashInput, 10).toLocaleString() : "0"}
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={recommendationsLoading || (parseInt(cashInput || "0", 10) <= 0 && !hasShares)}
              className="shrink-0 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-1.5 rounded-md transition text-xs flex items-center gap-1.5"
            >
              {recommendationsLoading ? (
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
                  Run
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {recommendations.length > 0 ? (
      <div className="p-4">
        {(ccTrades.length > 0 || cspTrades.length > 0) ? (
          <TradesTable
            ccTrades={ccTrades}
            cspTrades={cspTrades}
            earningsCalendar={earningsCalendar}
            earningsHistory={earningsHistory}
            analystTrends={analystTrends}
          />
        ) : (
          <div className="rounded-lg border border-[#21262d] bg-[#0d1117] px-5 py-6 text-center text-xs text-[#484f58]">
            No executable trades found for the current portfolio and market data.
          </div>
        )}
      </div>
      ) : (
      <div className="px-5 py-12 text-center">
        <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-[#21262d] flex items-center justify-center">
          <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </div>
        <p className="text-sm text-[#8b949e] mb-1">No recommendations yet</p>
        <p className="text-xs text-[#484f58]">Set your CSP cash and click <strong className="text-[#c9d1d9]">Run</strong> to generate trade candidates.</p>
      </div>
      )}
    </section>
  );
}
