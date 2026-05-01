"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { LlmPrompt, ChatMessage, WheelRecommendation, EarningsCalendar, EarningsResult, AnalystTrend, FinancialHealth } from "@/lib/types";
import { getFinancialHealth } from "@/lib/api";
import type { StrategyFilters } from "./OptionsTab";

type Provider = "openai" | "ollama";
const OPENAI_MODELS = ["gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"];

interface Props {
  prompt: LlmPrompt;
  /** Pre-computed trades from the Rust recommendation engine. */
  recommendations: WheelRecommendation[];
  ollamaModels: string[];
  ollamaModelsLoading: boolean;
  earningsCalendar?: Record<string, EarningsCalendar[]>;
  earningsHistory?: Record<string, EarningsResult[]>;
  analystTrends?: Record<string, AnalystTrend[]>;
  tickersWithoutOptions?: string[];
  filters?: StrategyFilters;
}

interface StrategicAnalysis {
  assignment_risk?: string;
  concentration?: string;
  earnings_strategy?: string;
  wheel_cycle?: string;
  key_risks?: string;
  action_items?: string[];
}

/** Try to parse the LLM's strategic analysis response from raw text. */
function parseAnalysis(raw: string): StrategicAnalysis | null {
  // Strip <think> blocks and markdown fences
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) end = cleaned.length;

  let candidate = cleaned.slice(start, end);
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");
  const openB = (candidate.match(/\{/g) ?? []).length;
  const closeB = (candidate.match(/\}/g) ?? []).length;
  if (openB > closeB) candidate += "}".repeat(openB - closeB);
  const openA = (candidate.match(/\[/g) ?? []).length;
  const closeA = (candidate.match(/\]/g) ?? []).length;
  if (openA > closeA) candidate += "]".repeat(openA - closeA);

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const result: StrategicAnalysis = {};
    if (typeof parsed.assignment_risk === "string") result.assignment_risk = parsed.assignment_risk;
    if (typeof parsed.concentration === "string") result.concentration = parsed.concentration;
    if (typeof parsed.earnings_strategy === "string") result.earnings_strategy = parsed.earnings_strategy;
    if (typeof parsed.wheel_cycle === "string") result.wheel_cycle = parsed.wheel_cycle;
    if (typeof parsed.key_risks === "string") result.key_risks = parsed.key_risks;
    if (Array.isArray(parsed.action_items)) {
      result.action_items = parsed.action_items.filter((x): x is string => typeof x === "string");
    }
    // Must have at least one section
    if (Object.keys(result).length === 0) return null;
    return result;
  } catch {
    return null;
  }
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
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const scoreBtnRef = useRef<HTMLButtonElement>(null);
  const [scorePos, setScorePos] = useState<{ top: number; right: number } | null>(null);
  const [healthData, setHealthData] = useState<Record<string, FinancialHealth>>({});
  const [healthPopup, setHealthPopup] = useState<string | null>(null);

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

  // Underlying price from first trade of active ticker
  const underlying = activeTrades[0]?.rec.contract.underlying_price
    ?? tickerCC[0]?.rec.contract.underlying_price
    ?? tickerCSP[0]?.rec.contract.underlying_price
    ?? 0;

  if (allTickers.length === 0) {
    return (
      <div className="rounded border border-[#30363d] bg-[#161b22] px-4 py-6 text-center text-xs text-[#484f58]">
        No trades available
      </div>
    );
  }

  const erDates = earningsCalendar?.[activeTicker] ?? [];
  const nextEarnings = erDates.find(e => e.days_until >= 0) ?? erDates[0];
  const historyArr = earningsHistory?.[activeTicker] ?? [];
  const lastResult = historyArr[historyArr.length - 1];

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
      {/* ── Ticker tabs + stats (like Options page) ── */}
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {allTickers.map((ticker) => {
              const erDays = (earningsCalendar?.[ticker] ?? []).find(e => e.days_until >= 0)?.days_until;
              const erDot = erDays !== undefined && erDays <= 14;
              const erColor = erDays !== undefined && erDays <= 7 ? "bg-[#f85149]" : "bg-[#d29922]";
              return (
              <button
                key={ticker}
                onClick={() => setActiveTicker(ticker)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  activeTicker === ticker
                    ? "bg-[#30363d] text-[#c9d1d9] ring-1 ring-[#484f58]"
                    : "bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d] border border-[#30363d]"
                }`}
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
          <div className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-md bg-[#0d1117] border border-[#30363d]">
            <span className="text-[10px] text-[#8b949e] uppercase font-medium">Last</span>
            <span className="text-xs font-bold text-[#c9d1d9] tabular-nums">${underlying.toFixed(2)}</span>
          </div>
          {(() => {
            const health = healthData[activeTicker];
            if (!health) return null;
            const scoreColor = health.health_score >= 80 ? "text-[#3fb950]" : health.health_score >= 65 ? "text-[#56d364]" : health.health_score >= 45 ? "text-[#d29922]" : health.health_score >= 25 ? "text-[#db6d28]" : "text-[#f85149]";
            return (
              <button
                onClick={() => setHealthPopup(activeTicker)}
                className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-md bg-[#0d1117] border border-[#30363d] hover:border-[#8b949e] transition cursor-pointer"
                title="View strengths & concerns"
              >
                <span className="text-[10px] text-[#8b949e] uppercase font-medium">Health</span>
                <span className={`text-xs font-bold tabular-nums ${scoreColor}`}>{health.health_score}</span>
              </button>
            );
          })()}
          {(() => {
            const erDates = earningsCalendar?.[activeTicker] ?? [];
            const next = erDates.find(e => e.days_until >= 0) ?? erDates[0];
            if (!next || next.days_until < 0) return null;
            return (
              <div className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-md bg-[#0d1117] border border-[#30363d]">
                <span className="text-[10px] text-[#8b949e] uppercase font-medium">ER</span>
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

      {/* ── CC / CSP toggle + counts (like Calls | Puts) ── */}
      <div className="px-4 py-2 border-t border-[#30363d] bg-[#0d1117] flex items-center gap-3">
        <div className="flex bg-[#161b22] border border-[#30363d] rounded p-0.5">
          {([
            { key: "cc" as const, label: "Covered Calls", count: tickerCC.length },
            { key: "csp" as const, label: "Cash-Secured Puts", count: tickerCSP.length },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveType(key)}
              disabled={count === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium rounded transition ${
                activeType === key
                  ? "bg-[#30363d] text-[#c9d1d9]"
                  : "text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 disabled:cursor-not-allowed"
              }`}
            >
              {label}
              <span className={`min-w-[14px] text-center tabular-nums ${activeType === key ? "text-[#c9d1d9]" : "text-[#484f58]"}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Trades table ── */}
      {activeTrades.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[#484f58]">
          No {isCSP ? "cash-secured put" : "covered call"} trades for {activeTicker}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#30363d] text-[10px] font-semibold text-[#484f58] uppercase tracking-wider bg-[#0d1117]">
              <th className="pl-3 pr-1 py-2 text-center w-9">#</th>
              <th className="px-2 py-2 text-left">Strike</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-left">Expiry</th>
              <th className="px-2 py-2 text-right">DTE</th>
              <th className="px-2 py-2 text-right" title="Estimated date to close at 50% profit (theta decay curve)">
                <span className="text-[#3fb950]">↗</span> 50%
              </th>
              <th className="px-2 py-2 text-right" title="Estimated date to close at 80% profit (theta decay curve)">
                <span className="text-[#3fb950]">↗</span> 80%
              </th>
              <th className="px-2 py-2 text-right">Mid</th>
              <th className="px-2 py-2 text-right">Premium</th>
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
                      className="fixed z-50 w-72 rounded border border-[#30363d] bg-[#161b22] shadow-lg shadow-black/40 p-3 text-left text-[10px]"
                      style={{ top: scorePos.top, right: scorePos.right }}
                    >
                      <p className="font-semibold text-[#c9d1d9] uppercase tracking-wider mb-2">Quality Score (0–100)</p>
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
            {activeTrades.map((t) => {
              const { rec } = t;
              const mid = (rec.contract.bid + rec.contract.ask) / 2;
              const contracts = rec.contracts_allocated;
              const totalPremium = mid * contracts * 100;
              const collateral = rec.contract.strike * contracts * 100;

              return (
                <tr
                  key={`${activeTicker}-${activeType}-${t.num}`}
                  className={`transition-colors hover:bg-[#1c2128] ${t.num % 2 === 0 ? "bg-[#0d1117]/50" : ""}`}
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
                        <div className="w-8 h-1 rounded-full bg-[#21262d] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${rec.quality_score}%`, backgroundColor: rec.quality_score >= 70 ? '#3fb950' : rec.quality_score >= 40 ? '#d29922' : '#f85149' }} />
                        </div>
                        <span className={`text-[10px] ${rec.quality_score >= 70 ? 'text-[#3fb950]' : rec.quality_score >= 40 ? 'text-[#d29922]' : 'text-[#f85149]'}`}>{rec.quality_score.toFixed(0)}</span>
                      </div>
                    </td>
                  </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Health popup */}
      {healthPopup && healthData[healthPopup] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setHealthPopup(null)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#21262d]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-[#c9d1d9]">{healthPopup}</span>
                <span className={`text-xs font-bold tabular-nums ${
                  healthData[healthPopup].health_score >= 80 ? "text-[#3fb950]" : healthData[healthPopup].health_score >= 65 ? "text-[#56d364]" : healthData[healthPopup].health_score >= 45 ? "text-[#d29922]" : healthData[healthPopup].health_score >= 25 ? "text-[#db6d28]" : "text-[#f85149]"
                }`}>
                  {healthData[healthPopup].health_score}/100 · {healthData[healthPopup].verdict}
                </span>
              </div>
              <button onClick={() => setHealthPopup(null)} className="text-[#484f58] hover:text-[#c9d1d9] transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {(healthData[healthPopup].strengths.length > 0 || healthData[healthPopup].concerns.length > 0) ? (
                <div className="space-y-4">
                  {healthData[healthPopup].strengths.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-[#3fb950] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        Strengths
                      </h4>
                      <ul className="space-y-1.5">
                        {healthData[healthPopup].strengths.map((s, i) => (
                          <li key={i} className="text-xs text-[#c9d1d9] flex items-start gap-2 leading-relaxed">
                            <span className="text-[#3fb950] mt-0.5 shrink-0">•</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {healthData[healthPopup].concerns.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-[#d29922] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        Concerns
                      </h4>
                      <ul className="space-y-1.5">
                        {healthData[healthPopup].concerns.map((c, i) => (
                          <li key={i} className="text-xs text-[#c9d1d9] flex items-start gap-2 leading-relaxed">
                            <span className="text-[#d29922] mt-0.5 shrink-0">•</span>
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#484f58] italic">No strengths or concerns identified.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LlmAnalysis({ prompt, recommendations, ollamaModels, ollamaModelsLoading, earningsCalendar = {}, earningsHistory = {}, analystTrends = {}, tickersWithoutOptions = [], filters }: Props) {
  const [provider, setProvider] = useState<Provider>("ollama");
  const [model, setModel] = useState(() => ollamaModels[0] ?? "");
  const [apiKey, setApiKey] = useState("");
  const [analysis, setAnalysis] = useState<StrategicAnalysis | null>(null);
  const [rawAnalysis, setRawAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);

  // Set model when ollama models become available or provider changes
  useEffect(() => {
    if (provider === "ollama" && ollamaModels.length > 0 && !ollamaModels.includes(model)) {
      setModel(ollamaModels[0]);
    }
  }, [ollamaModels, provider, model]);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(p === "ollama" ? (ollamaModels[0] ?? "") : OPENAI_MODELS[0]);
  }

  useEffect(() => {
    setAnalysis(null);
    setRawAnalysis(null);
    setError(null);
  }, [provider]);

  // Clear analysis when new recommendations arrive
  useEffect(() => {
    setAnalysis(null);
    setRawAnalysis(null);
  }, [recommendations]);

  const runAnalysis = useCallback(async function runAnalysis() {
    if (provider === "openai" && !apiKey) {
      setError("Please enter your OpenAI API key.");
      return;
    }
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setRawAnalysis(null);

    try {
      let res: Response;

      if (provider === "ollama") {
        res = await fetch("/api/ollama", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: prompt.messages,
            temperature: prompt.temperature,
            max_tokens: prompt.max_tokens,
          }),
        });
      } else {
        res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: prompt.messages,
            temperature: 0,
            max_tokens: prompt.max_tokens,
            seed: 42,
            response_format: { type: "json_object" },
          }),
        });
      }

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          errMsg = body.error?.message ?? body.error ?? errMsg;
        } catch {
          const text = await res.text().catch(() => "");
          if (text) errMsg = text.slice(0, 200);
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      if (!content) {
        setError("Model returned an empty response. Try again.");
        return;
      }
      setRawAnalysis(content);
      const parsed = parseAnalysis(content);
      setAnalysis(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "LLM request failed");
    } finally {
      setLoading(false);
    }
  }, [provider, apiKey, model, prompt]);

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
    <section className="bg-[#161b22] rounded-lg border border-[#30363d] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#30363d] bg-[#0d1117]">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold text-[#c9d1d9] uppercase tracking-wider">
            Trade Desk
          </h2>
          <span className="text-[10px] text-[#484f58] tabular-nums">
            {ccTrades.length} CC &middot; {cspTrades.length} CSP
          </span>
          {tickersWithoutOptions && tickersWithoutOptions.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5 text-[#d29922] text-[10px] font-medium">
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>No options chain:</span>
              <span className="flex flex-wrap gap-1">
                {tickersWithoutOptions.map((t) => (
                  <span key={t} className="bg-[#d2992215] border border-[#d2992240] px-1.5 py-0.5 rounded font-bold">{t}</span>
                ))}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        {/* Controls row */}
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as Provider)}
            className="border border-[#30363d] rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#58a6ff] bg-[#0d1117] text-[#c9d1d9]"
          >
            <option value="ollama">Ollama (local)</option>
            <option value="openai">OpenAI</option>
          </select>
          {provider === "ollama" ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={ollamaModelsLoading}
              className="border border-[#30363d] rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#58a6ff] bg-[#0d1117] text-[#c9d1d9] disabled:opacity-40"
            >
              {ollamaModelsLoading && <option value="">Loading models…</option>}
              {!ollamaModelsLoading && ollamaModels.length === 0 && (
                <option value="">No models found</option>
              )}
              {ollamaModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border border-[#30363d] rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#58a6ff] bg-[#0d1117] text-[#c9d1d9]"
            >
              {OPENAI_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          {provider === "openai" && (
            <input
              type="password"
              placeholder="API key (sk-…)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 min-w-[200px] border border-[#30363d] rounded px-3 py-1.5 text-xs placeholder:text-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] bg-[#0d1117] text-[#c9d1d9]"
            />
          )}
          <button
            onClick={runAnalysis}
            disabled={loading || !model}
            className="bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-1.5 rounded transition text-xs flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Analyzing…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                Run Analysis
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="bg-[#f8514915] border border-[#f8514930] text-[#f85149] text-xs rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setShowPrompt((v) => !v)}
            className={`text-[10px] font-medium px-2.5 py-1 rounded border transition ${showPrompt ? "bg-[#21262d] border-[#30363d] text-[#c9d1d9]" : "border-transparent text-[#484f58] hover:text-[#8b949e]"}`}
          >
            {showPrompt ? "▾ Prompt" : "▸ Prompt"}
          </button>
          <button
            onClick={() => setShowCriteria((v) => !v)}
            className={`text-[10px] font-medium px-2.5 py-1 rounded border transition ${showCriteria ? "bg-[#21262d] border-[#30363d] text-[#c9d1d9]" : "border-transparent text-[#484f58] hover:text-[#8b949e]"}`}
          >
            {showCriteria ? "▾ Criteria" : "▸ Criteria"}
          </button>
        </div>
        {showPrompt && (
          <div className="mb-4 space-y-2">
            {prompt.messages.map((msg: ChatMessage, i: number) => (
              <div key={i} className="bg-[#0d1117] rounded p-3 border border-[#21262d]">
                <p className="text-[10px] font-semibold text-[#484f58] uppercase tracking-wider mb-1">
                  {msg.role}
                </p>
                <pre className="text-[10px] text-[#8b949e] whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-60">
                  {msg.content}
                </pre>
              </div>
            ))}
          </div>
        )}

        {/* Selection Criteria */}
        {showCriteria && (
          <div className="mb-4 rounded border border-[#30363d] bg-[#0d1117] overflow-hidden">
              {/* Strategy Filters (read-only) */}
              {filters && (
              <div className="px-4 py-3 border-b border-[#21262d]">
                <p className="text-[10px] font-semibold text-[#c9d1d9] uppercase tracking-wider mb-2">Strategy Filters</p>
                <div className="flex items-center flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded-md px-2 py-0.5 text-[10px]">
                    <span className="text-[#8b949e]">DTE</span>
                    <span className="text-[#c9d1d9] tabular-nums font-medium">{filters.dte_min}–{filters.dte_max}</span>
                    <span className="text-[#484f58]">d</span>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded-md px-2 py-0.5 text-[10px]">
                    <span className="text-[#8b949e]">ROC</span>
                    <span className="text-[#c9d1d9] tabular-nums font-medium">{filters.min_annualised_roc}–{filters.max_annualised_roc}</span>
                    <span className="text-[#484f58]">%</span>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded-md px-2 py-0.5 text-[10px]">
                    <span className="text-[#8b949e]">OI ≥</span>
                    <span className="text-[#c9d1d9] tabular-nums font-medium">{filters.min_open_interest.toLocaleString()}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded-md px-2 py-0.5 text-[10px]">
                    <span className="text-[#d29922]">CC Δ</span>
                    <span className="text-[#c9d1d9] tabular-nums font-medium">{filters.cc_delta_min}–{filters.cc_delta_max}%</span>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded-md px-2 py-0.5 text-[10px]">
                    <span className="text-[#58a6ff]">CSP Δ</span>
                    <span className="text-[#c9d1d9] tabular-nums font-medium">{filters.csp_delta_min}–{filters.csp_delta_max}%</span>
                  </span>
                </div>
              </div>
              )}
              {/* Quality Score */}
              <div className="px-4 py-3 border-b border-[#21262d]">
                <p className="text-[10px] font-semibold text-[#c9d1d9] uppercase tracking-wider mb-2">Quality Score (0–100)</p>
                <div className="space-y-1.5">
                  {([
                    { label: "ROC", max: 50, desc: "Annualized return, capped at 60%" },
                    { label: "Delta", max: 20, desc: "Proximity to 0.275 target" },
                    { label: "Liquidity", max: 20, desc: "Open interest, full at 5,000+" },
                    { label: "IV", max: 10, desc: "Sweet spot 25–60%" },
                  ]).map(({ label, max, desc }) => (
                    <div key={label} className="flex items-center gap-2 text-[10px]">
                      <span className="text-[#c9d1d9] font-medium w-14">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#21262d] overflow-hidden">
                        <div className="h-full rounded-full bg-[#3fb950]" style={{ width: `${max}%` }} />
                      </div>
                      <span className="text-[#3fb950] tabular-nums font-medium w-6 text-right">{max}</span>
                      <span className="text-[#484f58] w-44 truncate">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Selection Logic */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold text-[#c9d1d9] uppercase tracking-wider mb-2">Selection Logic</p>
                <div className="grid grid-cols-2 gap-4 text-[10px]">
                  <div>
                    <p className="text-[#58a6ff] font-medium mb-1">Covered Calls</p>
                    <ul className="text-[#8b949e] space-y-0.5 list-none">
                      <li>Requires ≥ 1×100 quantity held</li>
                      <li>Up to 3 strike/DTE tiers for diversification</li>
                      <li>Lot allocation: 40 / 40 / 20 split</li>
                      <li>Diversity bonus for spread across strikes & DTEs</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-[#58a6ff] font-medium mb-1">Cash-Secured Puts</p>
                    <ul className="text-[#8b949e] space-y-0.5 list-none">
                      <li>Cross-ticker optimization by total premium</li>
                      <li>Greedy cash allocation across up to 3 tickers</li>
                      <li>Per-ticker tier selection (up to 3 tiers)</li>
                      <li>Alternatives shown for comparison</li>
                    </ul>
                  </div>
                </div>
              </div>
          </div>
        )}

        {/* Strategic Analysis */}
        {analysis && (
          <div className="rounded border border-[#30363d] bg-[#0d1117] overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-[#21262d]">
              <p className="text-[10px] font-semibold text-[#c9d1d9] uppercase tracking-widest">AI Strategic Analysis</p>
            </div>
            <div className="divide-y divide-[#21262d]">
              {analysis.assignment_risk && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-[#f85149] uppercase tracking-wider mb-1">Assignment Risk</p>
                  <p className="text-xs text-[#c9d1d9] leading-relaxed">{analysis.assignment_risk}</p>
                </div>
              )}
              {analysis.concentration && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-[#d29922] uppercase tracking-wider mb-1">Concentration</p>
                  <p className="text-xs text-[#c9d1d9] leading-relaxed">{analysis.concentration}</p>
                </div>
              )}
              {analysis.earnings_strategy && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-[#d29922] uppercase tracking-wider mb-1">Earnings Strategy</p>
                  <p className="text-xs text-[#c9d1d9] leading-relaxed">{analysis.earnings_strategy}</p>
                </div>
              )}
              {analysis.wheel_cycle && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-[#58a6ff] uppercase tracking-wider mb-1">Wheel Cycle</p>
                  <p className="text-xs text-[#c9d1d9] leading-relaxed">{analysis.wheel_cycle}</p>
                </div>
              )}
              {analysis.key_risks && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-[#f85149] uppercase tracking-wider mb-1">Key Risks</p>
                  <p className="text-xs text-[#c9d1d9] leading-relaxed">{analysis.key_risks}</p>
                </div>
              )}
              {analysis.action_items && analysis.action_items.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-[#3fb950] uppercase tracking-wider mb-1.5">Action Items</p>
                  <ol className="list-decimal list-inside space-y-1">
                    {analysis.action_items.map((item, i) => (
                      <li key={i} className="text-xs text-[#c9d1d9] leading-relaxed">{item}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Parse failure — show raw response */}
        {rawAnalysis && !analysis && !loading && (
          <div className="rounded border border-[#d29922] bg-[#d2992215] px-4 py-3 text-xs text-[#d29922] mb-4">
            <p className="font-medium mb-1.5">Could not parse AI analysis — showing raw response.</p>
            <pre className="text-[10px] whitespace-pre-wrap text-[#8b949e] max-h-40 overflow-auto bg-[#0d1117] border border-[#30363d] rounded p-2">
              {rawAnalysis.slice(0, 1000)}
            </pre>
          </div>
        )}

        {/* Trades tables */}
        <div>
          {(ccTrades.length > 0 || cspTrades.length > 0) && (
            <TradesTable
              ccTrades={ccTrades}
              cspTrades={cspTrades}
              earningsCalendar={earningsCalendar}
              earningsHistory={earningsHistory}
              analystTrends={analystTrends}
            />
          )}
          {ccTrades.length === 0 && cspTrades.length === 0 && (
            <div className="rounded border border-[#30363d] bg-[#0d1117] px-4 py-3 text-xs text-[#8b949e]">
              No executable trades found for the current portfolio and market data.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
