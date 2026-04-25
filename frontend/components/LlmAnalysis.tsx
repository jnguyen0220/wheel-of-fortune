"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { LlmPrompt, ChatMessage, WheelRecommendation, EarningsCalendar, EarningsResult, AnalystTrend } from "@/lib/types";

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
}

interface LlmRanking {
  rank: number;
  ticker: string;
  type: string;
  strike: number;
  dte: number;
  rationale: string;
}

interface LlmResponse {
  summary?: string;
  ranked_cc: LlmRanking[];
  ranked_csp: LlmRanking[];
}

function parseRankingArray(arr: unknown): LlmRanking[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((r: Record<string, unknown>) => ({
    rank: Number(r.rank ?? 0),
    ticker: String(r.ticker ?? ""),
    type: String(r.type ?? ""),
    strike: Number(r.strike ?? 0),
    dte: Number(r.dte ?? 0),
    rationale: String(r.rationale ?? ""),
  }));
}

/** Try to parse the LLM's ranking response from raw text. */
function parseLlmRanking(raw: string): LlmResponse | null {
  // Strip <think> blocks and markdown fences
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  // Find the first JSON object
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  // Find matching closing brace
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
  // Fix trailing commas
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");
  // Close unclosed braces
  const openB = (candidate.match(/\{/g) ?? []).length;
  const closeB = (candidate.match(/\}/g) ?? []).length;
  if (openB > closeB) candidate += "}".repeat(openB - closeB);
  const openA = (candidate.match(/\[/g) ?? []).length;
  const closeA = (candidate.match(/\]/g) ?? []).length;
  if (openA > closeA) candidate += "]".repeat(openA - closeA);

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const summary = typeof parsed.summary === "string" ? parsed.summary : undefined;

    // Support both new split schema and legacy single-array schema
    let ranked_cc = parseRankingArray(parsed.ranked_cc);
    let ranked_csp = parseRankingArray(parsed.ranked_csp);

    // Fallback: if LLM used the old ranked_trades array, split by type
    if (ranked_cc.length === 0 && ranked_csp.length === 0 && Array.isArray(parsed.ranked_trades)) {
      const all = parseRankingArray(parsed.ranked_trades);
      ranked_cc = all.filter((r) => r.type.toUpperCase() === "CC");
      ranked_csp = all.filter((r) => r.type.toUpperCase() === "CSP");
    }

    if (ranked_cc.length === 0 && ranked_csp.length === 0) return null;
    return { summary, ranked_cc, ranked_csp };
  } catch {
    return null;
  }
}

/** Match an LLM ranking entry to an engine recommendation. */
function matchRanking(
  ranking: LlmRanking,
  rec: WheelRecommendation,
): boolean {
  const tickerMatch = ranking.ticker.toUpperCase() === rec.ticker.toUpperCase();
  const legType = rec.leg === "covered_call" ? "CC" : "CSP";
  const typeMatch = ranking.type.toUpperCase() === legType;
  const strikeMatch = Math.abs(ranking.strike - rec.contract.strike) < 0.01;
  // When DTE is present, require it to match (handles same ticker+type+strike at different expiries)
  const dteMatch = ranking.dte === 0 || ranking.dte === rec.contract.dte;
  return tickerMatch && typeMatch && strikeMatch && dteMatch;
}

interface DisplayTrade {
  num: number;
  rec: WheelRecommendation;
  rationale?: string;
  /** True when the LLM changed this trade's position from the engine order. */
  reordered?: boolean;
  /** Original engine rank (1-based) before LLM reordering. */
  engineRank: number;
}

function TradesTable({ ccTrades, cspTrades, model, provider, ccRanked, cspRanked, earningsCalendar, earningsHistory, analystTrends }: {
  ccTrades: DisplayTrade[];
  cspTrades: DisplayTrade[];
  model: string;
  provider: string;
  ccRanked: boolean;
  cspRanked: boolean;
  earningsCalendar?: Record<string, EarningsCalendar[]>;
  earningsHistory?: Record<string, EarningsResult[]>;
  analystTrends?: Record<string, AnalystTrend[]>;
}) {
  const [activeTab, setActiveTab] = useState<"cc" | "csp">(ccTrades.length > 0 ? "cc" : "csp");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const scoreBtnRef = useRef<HTMLButtonElement>(null);
  const [scorePos, setScorePos] = useState<{ top: number; right: number } | null>(null);

  const trades = activeTab === "cc" ? ccTrades : cspTrades;
  const isRanked = activeTab === "cc" ? ccRanked : cspRanked;
  const isCSP = activeTab === "csp";

  // Group trades by ticker, preserving rank order within each group
  // For CC: re-number per ticker (each ticker's CCs are independent)
  const tickerGroups: { ticker: string; trades: DisplayTrade[] }[] = React.useMemo(() => {
    const map = new Map<string, DisplayTrade[]>();
    for (const t of trades) {
      const arr = map.get(t.rec.ticker) ?? [];
      arr.push(t);
      map.set(t.rec.ticker, arr);
    }
    const groups = Array.from(map.entries())
      .sort(([, a], [, b]) => a[0].num - b[0].num)
      .map(([ticker, trades]) => ({ ticker, trades }));

    if (!isCSP) {
      for (const group of groups) {
        const engineByTicker = new Map<number, number>();
        group.trades.forEach((t, i) => engineByTicker.set(t.engineRank, i));
        group.trades.forEach((t, i) => {
          t.num = i + 1;
          t.engineRank = (engineByTicker.get(t.engineRank) ?? i) + 1;
        });
      }
    }

    return groups;
  }, [trades, isCSP]);

  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#30363d] bg-[#1c2128]">
        <div className="flex bg-[#161b22] border border-[#30363d] rounded p-0.5">
          {([
            { key: "cc" as const, label: "Covered Calls", count: ccTrades.length },
            { key: "csp" as const, label: "Cash-Secured Puts", count: cspTrades.length },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setExpanded({}); }}
              disabled={count === 0}
              className={`px-3 py-1 text-[10px] font-medium rounded transition ${
                activeTab === key
                  ? "bg-[#30363d] text-[#c9d1d9]"
                  : "text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 disabled:cursor-not-allowed"
              }`}
            >
              {label}
              <span className={`ml-1.5 tabular-nums ${activeTab === key ? "text-[#c9d1d9]" : "text-[#484f58]"}`}>{count}</span>
            </button>
          ))}
        </div>
        {isRanked && (
          <span className="text-[10px] font-medium bg-[#58a6ff15] text-[#58a6ff] border border-[#58a6ff30] px-2 py-0.5 rounded">
            LLM Reordered
          </span>
        )}
        <span className="ml-auto text-[10px] font-medium text-[#484f58]">
          {provider === "ollama" ? `Ollama / ${model}` : model}
        </span>
      </div>

      {trades.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[#484f58]">
          No {isCSP ? "cash-secured put" : "covered call"} trades available
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-[24px]" />
            <col className="w-[36px]" />
            <col className="w-[52px]" />
            <col className="w-[72px]" />
            <col className="w-[64px]" />
            <col className="w-[88px]" />
            <col className="w-[48px]" />
            <col className="w-[60px]" />
            <col className="w-[100px]" />
            <col className="w-[56px]" />
            {isCSP && <col className="w-[84px]" />}
            <col className="w-[64px]" />
            <col className="w-[52px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#30363d] text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">
              <th className="px-2 py-2" />
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Action</th>
              <th className="px-2 py-2 text-left">Strike</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-left">Expiry</th>
              <th className="px-2 py-2 text-right">DTE</th>
              <th className="px-2 py-2 text-right">Mid</th>
              <th className="px-2 py-2 text-right">Premium</th>
              <th className="px-2 py-2 text-right">ROC</th>
              {isCSP && <th className="px-2 py-2 text-right">Collateral</th>}
              <th className="px-2 py-2 text-right">OI</th>
              <th className="px-2 py-2 text-right">
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
                  Score
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
            {tickerGroups.map((group) => {
              const earningsDates = earningsCalendar?.[group.ticker] ?? [];
              const nextEarnings = earningsDates.find(e => e.days_until >= 0) ?? earningsDates[0];
              const historyArr = earningsHistory?.[group.ticker] ?? [];
              const lastResult = historyArr[historyArr.length - 1];

              return (
              <React.Fragment key={group.ticker}>
                <tr className="bg-[#0d1117] border-t border-[#30363d]">
                    <td colSpan={isCSP ? 13 : 12} className="px-3 py-1.5">
                      <span className="font-bold text-[#c9d1d9] text-xs">{group.ticker}</span>
                      <span className="ml-2 text-[10px] text-[#8b949e]">${group.trades[0].rec.contract.underlying_price.toFixed(2)}</span>
                      <span className="ml-2 text-[10px] text-[#484f58]">{group.trades.length} trade{group.trades.length !== 1 ? "s" : ""}</span>
                      {nextEarnings && nextEarnings.days_until >= 0 && (
                        <span className="ml-3 inline-flex items-center gap-1 text-[10px] font-medium text-[#d29922] bg-[#d2992215] border border-[#d2992240] px-1.5 py-0.5 rounded" title={`Earnings on ${nextEarnings.earnings_date}`}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                          </svg>
                          ER in {nextEarnings.days_until}d
                        </span>
                      )}
                      {lastResult && (
                        <span className={`ml-2 text-[10px] font-medium ${lastResult.beat ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                          {lastResult.beat ? "Beat" : "Miss"} {lastResult.fiscal_quarter}{lastResult.eps_surprise != null && <span className="ml-1 text-[#484f58]">({lastResult.eps_surprise >= 0 ? "+" : ""}{lastResult.eps_surprise.toFixed(2)})</span>}
                        </span>
                      )}
                      {(() => {
                        const trends = analystTrends?.[group.ticker];
                        const current = trends?.find(t => t.period === "0m") ?? trends?.[0];
                        if (!current) return null;
                        const bullish = current.strong_buy + current.buy;
                        const bearish = current.sell + current.strong_sell;
                        const total = bullish + current.hold + bearish;
                        if (total === 0) return null;
                        const label = bullish > bearish + current.hold ? "Buy" : bearish > bullish ? "Sell" : "Hold";
                        const color = label === "Buy" ? "text-[#3fb950] bg-[#3fb95015] border-[#3fb95040]" : label === "Sell" ? "text-[#f85149] bg-[#f8514915] border-[#f8514940]" : "text-[#8b949e] bg-[#8b949e15] border-[#8b949e40]";
                        return (
                          <span className={`ml-3 inline-flex items-center gap-1 text-[10px] font-medium ${color} border px-1.5 py-0.5 rounded`} title={`${current.strong_buy} Strong Buy · ${current.buy} Buy · ${current.hold} Hold · ${current.sell} Sell · ${current.strong_sell} Strong Sell`}>
                            {label} ({bullish}B {current.hold}H {bearish}S)
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                {group.trades.map((t) => {
                  const { rec } = t;
                  const isOpen = !!expanded[`${activeTab}-${t.num}`];
                  const mid = (rec.contract.bid + rec.contract.ask) / 2;
                  const contracts = rec.contracts_allocated;
                  const totalPremium = mid * contracts * 100;
                  const collateral = rec.contract.strike * contracts * 100;
                  const rationale = t.rationale || rec.rationale;
                  const spansEarnings = nextEarnings && nextEarnings.days_until >= 0 && nextEarnings.days_until < rec.contract.dte;

                  return (
                    <React.Fragment key={t.num}>
                      <tr
                        onClick={() => setExpanded((prev) => ({ ...prev, [`${activeTab}-${t.num}`]: !prev[`${activeTab}-${t.num}`] }))}
                        className="cursor-pointer hover:bg-[#1c2128] transition border-t border-[#21262d]"
                      >
                        <td className="px-2 py-2 text-[#484f58] text-[10px] select-none">
                          {isOpen ? "▾" : "▸"}
                        </td>
                        <td className="px-2 py-2 text-[#8b949e] font-medium">
                          {t.num === t.engineRank || !isRanked ? (
                            t.num
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-[#484f58] line-through text-[10px]">{t.engineRank}</span>
                              <span className="text-[#58a6ff]">→</span>
                              <span>{t.num}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-[10px] font-bold text-[#f85149] border border-[#f8514940] px-1 py-0.5 rounded">SELL</span>
                        </td>
                        <td className="px-2 py-2 font-medium text-[#c9d1d9] tabular-nums">${rec.contract.strike.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-medium text-[#c9d1d9] tabular-nums">
                          {contracts}<span className="text-[9px] text-[#484f58] ml-0.5">×100</span>
                        </td>
                        <td className="px-2 py-2 text-[#8b949e]">{rec.contract.expiration}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {spansEarnings ? (
                            <span className="text-[#d29922] font-medium" title={`Spans earnings on ${nextEarnings!.earnings_date} (${nextEarnings!.days_until}d away)`}>
                              {rec.contract.dte}d ⚠
                            </span>
                          ) : (
                            <span className="text-[#8b949e]">{rec.contract.dte}d</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right text-[#8b949e] tabular-nums">${mid.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-[#3fb950] tabular-nums">
                          ${totalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <div className="text-[9px] font-normal text-[#484f58]">${mid.toFixed(2)} × {contracts} × 100</div>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-[#3fb950] tabular-nums">{rec.annualised_roc.toFixed(1)}%</td>
                        {isCSP && (
                          <td className="px-2 py-2 text-right text-[#8b949e] tabular-nums">
                            ${collateral.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                        )}
                        <td className="px-2 py-2 text-right text-[#8b949e] tabular-nums">{rec.contract.open_interest.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right text-[#8b949e] tabular-nums">{rec.quality_score.toFixed(0)}</td>
                      </tr>
                      {isOpen && rationale && (
                        <tr className="bg-[#0d1117]">
                          <td colSpan={isCSP ? 13 : 12} className="px-4 py-2">
                            <p className="text-[10px] text-[#8b949e] leading-relaxed pl-4">{rationale}</p>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ); })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

export default function LlmAnalysis({ prompt, recommendations, ollamaModels, ollamaModelsLoading, earningsCalendar = {}, earningsHistory = {}, analystTrends = {}, tickersWithoutOptions = [] }: Props) {
  const [provider, setProvider] = useState<Provider>("ollama");
  const [model, setModel] = useState(() => ollamaModels[0] ?? "");
  const [apiKey, setApiKey] = useState("");
  const [llmResponse, setLlmResponse] = useState<LlmResponse | null>(null);
  const [rawAnalysis, setRawAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

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
    setLlmResponse(null);
    setRawAnalysis(null);
    setError(null);
  }, [provider]);

  // Clear LLM ranking when new recommendations arrive (e.g. Generate pressed)
  useEffect(() => {
    setLlmResponse(null);
    setRawAnalysis(null);
  }, [recommendations]);

  const runAnalysis = useCallback(async function runAnalysis() {
    if (provider === "openai" && !apiKey) {
      setError("Please enter your OpenAI API key.");
      return;
    }
    setLoading(true);
    setError(null);
    setLlmResponse(null);
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
            temperature: prompt.temperature,
            max_tokens: prompt.max_tokens,
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
      const parsed = parseLlmRanking(content);
      setLlmResponse(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "LLM request failed");
    } finally {
      setLoading(false);
    }
  }, [provider, apiKey, model, prompt]);

  // Build display trades: CC and CSP ranked independently.
  const { ccTrades, cspTrades, ccRanked, cspRanked } = React.useMemo(() => {
    const engineCC = recommendations.filter((r) => r.leg === "covered_call");
    const engineCSP = recommendations.filter((r) => r.leg === "cash_secured_put");

    function applyRanking(
      engineGroup: WheelRecommendation[],
      llmRanking: LlmRanking[],
    ): { trades: DisplayTrade[]; ranked: boolean } {
      if (engineGroup.length === 0) return { trades: [], ranked: false };

      // Build rationale map
      const rationaleMap = new Map<string, string>();
      for (const rt of llmRanking) {
        const key = `${rt.ticker.toUpperCase()}|${rt.type.toUpperCase()}|${rt.strike.toFixed(2)}|${rt.dte}`;
        rationaleMap.set(key, rt.rationale);
      }

      let ordered = [...engineGroup];
      let ranked = false;

      if (llmRanking.length > 0) {
        const matched: WheelRecommendation[] = [];
        const remaining = [...engineGroup];
        for (const rt of llmRanking) {
          const idx = remaining.findIndex((rec) => matchRanking(rt, rec));
          if (idx !== -1) {
            matched.push(remaining.splice(idx, 1)[0]);
          }
        }
        if (matched.length >= Math.ceil(engineGroup.length / 2)) {
          ordered = [...matched, ...remaining];
          ranked = ordered.some((rec, i) => rec !== engineGroup[i]);
        }
      }

      const engineIndex = new Map<WheelRecommendation, number>();
      engineGroup.forEach((rec, i) => engineIndex.set(rec, i + 1));

      const trades: DisplayTrade[] = ordered.map((rec, i) => {
        const legType = rec.leg === "covered_call" ? "CC" : "CSP";
        const key = `${rec.ticker.toUpperCase()}|${legType}|${rec.contract.strike.toFixed(2)}|${rec.contract.dte}`;
        const enginePos = engineIndex.get(rec) ?? i + 1;
        return {
          num: i + 1,
          rec,
          rationale: rationaleMap.get(key),
          reordered: ranked && enginePos !== i + 1,
          engineRank: enginePos,
        };
      });

      return { trades, ranked };
    }

    const cc = applyRanking(engineCC, llmResponse?.ranked_cc ?? []);
    const csp = applyRanking(engineCSP, llmResponse?.ranked_csp ?? []);

    return { ccTrades: cc.trades, cspTrades: csp.trades, ccRanked: cc.ranked, cspRanked: csp.ranked };
  }, [recommendations, llmResponse]);

  return (
    <section className="bg-[#161b22] rounded border border-[#30363d]">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#30363d]">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-[#c9d1d9]">
            Trade Desk
          </h2>
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
        <p className="text-[10px] text-[#8b949e] mb-3">
          {recommendations.length} trades ranked by engine score. Run AI analysis to reorder by model insight.
        </p>
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

        {/* Prompt inspector */}
        <div className="mb-4">
          <button
            onClick={() => setShowPrompt((v) => !v)}
            className="text-[10px] text-[#484f58] hover:text-[#8b949e] font-medium"
          >
            {showPrompt ? "▾ Hide prompt" : "▸ Show prompt"}
          </button>
          {showPrompt && (
            <div className="mt-2 space-y-2">
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
        </div>

        {/* LLM Summary */}
        {llmResponse?.summary && (
          <div className="rounded border border-[#30363d] bg-[#0d1117] px-4 py-3 text-xs text-[#c9d1d9] leading-relaxed mb-4">
            <p className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-widest mb-1">Summary</p>
            <p>{llmResponse.summary}</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 text-[#8b949e] text-xs py-3">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Waiting for model response…
          </div>
        )}

        {/* Parse failure — show raw response */}
        {rawAnalysis && !llmResponse && !loading && (
          <div className="rounded border border-[#d29922] bg-[#d2992215] px-4 py-3 text-xs text-[#d29922] mb-4">
            <p className="font-medium mb-1.5">Could not parse LLM ranking — showing engine order.</p>
            <pre className="text-[10px] whitespace-pre-wrap text-[#8b949e] max-h-40 overflow-auto bg-[#0d1117] border border-[#30363d] rounded p-2">
              {rawAnalysis.slice(0, 500)}
            </pre>
          </div>
        )}

        {/* Trades tables */}
        <div>
          {(ccTrades.length > 0 || cspTrades.length > 0) && (
            <TradesTable
              ccTrades={ccTrades}
              cspTrades={cspTrades}
              model={model}
              provider={provider}
              ccRanked={ccRanked}
              cspRanked={cspRanked}
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
