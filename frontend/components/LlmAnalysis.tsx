"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { LlmPrompt, ChatMessage, StockHolding } from "@/lib/types";

interface Props {
  prompt: LlmPrompt;
  /** If true, automatically call the LLM whenever the prompt changes. */
  autoRun?: boolean;
  /**
   * Valid strikes from the backend: ticker (uppercase) → "CC"|"CSP" → sorted
   * list of valid strike prices. Used to validate and snap LLM-hallucinated
   * strikes to the nearest real contract strike.
   */
  validStrikes?: Record<string, Record<string, number[]>>;
  holdings?: StockHolding[];
}

type Provider = "openai" | "ollama";

const OPENAI_MODELS = ["gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"];

interface TradeRow {
  num: number;
  action?: string;
  ticker: string;
  type?: string;
  strike?: string;
  contracts?: number;
  expiry?: string;
  dte?: number;
  premium_per_share?: string;
  total_premium?: string;
  ann_roc?: string;
  max_risk?: string;
  verdict?: string;
  rationale?: string;
}

interface ParsedResponse {
  summary?: string;
  trades: TradeRow[];
}

type GenericRecord = Record<string, unknown>;

function mapStrategyTrades(obj: GenericRecord): TradeRow[] | null {
  const strategy = obj.strategy as GenericRecord | undefined;
  if (!strategy) return null;
  const rawTrades = strategy.trades;
  if (!Array.isArray(rawTrades)) return null;

  const mapped: TradeRow[] = rawTrades.map((r, i) => {
    const row = r as GenericRecord;
    const symbol = String(row.symbol ?? "");
    const ticker = symbol.replace(/[^A-Za-z]/g, "").toUpperCase() || "UNKNOWN";
    const strike = Number(row.strike_price ?? 0);
    const dte = Number(row.dte ?? 0);
    const contracts = Number(row.contracts ?? 1);
    const premiumPerContract = Number(row.premium_per_contract ?? 0);
    const annRoc = Number(row.expected_roc ?? row.return_on_investment ?? 0);

    return {
      num: Number(row.rank ?? i + 1),
      action: "SELL",
      ticker,
      type: String(row.type ?? "").toUpperCase(),
      strike: strike > 0 ? `$${strike.toFixed(2)}` : undefined,
      contracts: contracts > 0 ? contracts : 1,
      expiry: String(row.expiry_date ?? ""),
      dte: dte > 0 ? dte : undefined,
      premium_per_share: premiumPerContract > 0 ? `$${(premiumPerContract / 100).toFixed(2)}` : undefined,
      total_premium: row.total_premium !== undefined ? `$${Number(row.total_premium).toFixed(2)}` : undefined,
      ann_roc: annRoc > 0 ? `${annRoc.toFixed(2)}%` : undefined,
      max_risk: row.collateral_required !== undefined ? `$${Number(row.collateral_required).toFixed(2)}` : undefined,
      rationale: String(row.reason_better_than_next ?? ""),
    };
  });

  return mapped;
}

function mapCspCcTrades(obj: GenericRecord): TradeRow[] | null {
  const cspObj = obj.csp as GenericRecord | undefined;
  const cspTrades = Array.isArray(cspObj?.trades) ? (cspObj?.trades as unknown[]) : [];
  const ccTrades = Array.isArray(obj.cc) ? (obj.cc as unknown[]) : [];

  if (cspTrades.length === 0 && ccTrades.length === 0) {
    return null;
  }

  const mapRow = (r: unknown, type: "CSP" | "CC", idx: number): TradeRow => {
    const row = r as GenericRecord;
    const symbol = String(row.symbol ?? row.ticker ?? "");
    const ticker = symbol.replace(/[^A-Za-z]/g, "").toUpperCase();
    const strike = Number(row.strike_price ?? row.strike ?? 0);
    const dte = Number(row.dte ?? 0);
    const contracts = Number(row.contracts ?? 1);
    const annRoc = Number(row.ann_roc ?? row.expected_roc ?? 0);
    const marginPerContract = Number(row.margin_per_contract ?? row.collateral_required ?? 0);

    return {
      num: idx + 1,
      action: "SELL",
      ticker,
      type,
      strike: strike > 0 ? `$${strike.toFixed(2)}` : undefined,
      contracts: contracts > 0 ? contracts : 1,
      expiry: String(row.expiry_date ?? row.expiry ?? ""),
      dte: dte > 0 ? dte : undefined,
      ann_roc: annRoc > 0 ? `${annRoc.toFixed(2)}%` : undefined,
      max_risk: marginPerContract > 0 ? `$${(marginPerContract * (contracts > 0 ? contracts : 1)).toFixed(2)}` : undefined,
      rationale: String(row.reason_better_than_next ?? ""),
    };
  };

  const mappedCsp = cspTrades.map((r, i) => mapRow(r, "CSP", i));
  const mappedCc = ccTrades.map((r, i) => mapRow(r, "CC", i + mappedCsp.length));
  return [...mappedCsp, ...mappedCc];
}

function mapCspAllocationObject(obj: GenericRecord): TradeRow[] | null {
  const allocation = (obj["*CSP Allocation*"] ?? obj["CSP Allocation"]) as GenericRecord | undefined;
  if (!allocation || typeof allocation !== "object") {
    return null;
  }

  const entries = Object.entries(allocation);
  if (entries.length === 0) {
    return null;
  }

  const trades: TradeRow[] = entries.map(([label, amount], idx) => {
    const labelText = String(label);
    const amountText = String(amount ?? "");

    const tickerMatch = labelText.match(/^([A-Za-z]+)/);
    const strikeMatch = labelText.match(/Strike\s*\$?([0-9]+(?:\.[0-9]+)?)/i);
    const dteMatch = labelText.match(/DTE\s*=\s*([0-9]+)/i);
    const marginMatch = amountText.match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);

    const ticker = tickerMatch?.[1]?.toUpperCase() ?? "";
    const strike = strikeMatch ? Number(strikeMatch[1]) : 0;
    const dte = dteMatch ? Number(dteMatch[1]) : 0;
    const margin = marginMatch ? Number(marginMatch[1].replace(/,/g, "")) : 0;

    return {
      num: idx + 1,
      action: "SELL",
      ticker,
      type: "CSP",
      strike: strike > 0 ? `$${strike.toFixed(2)}` : undefined,
      contracts: margin > 0 && strike > 0 ? Math.max(1, Math.floor(margin / (strike * 100))) : 1,
      dte: dte > 0 ? dte : undefined,
      max_risk: margin > 0 ? `$${margin.toFixed(2)}` : undefined,
      rationale: "Parsed from CSP allocation summary.",
    };
  });

  return trades;
}

/**
 * Walk the string from `start` to find the matching closing brace, respecting
 * nested braces and string literals (including escaped characters).
 * Returns the index AFTER the closing `}`, or -1 if no match.
 * If the string ends while still inside an object (depth > 0), returns the
 * length of the string so callers can still attempt to parse the fragment.
 */
function findMatchingBrace(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  // Partial match — return the full remaining string so repairJson can fix it
  return depth > 0 ? s.length : -1;
}

function deduplicateTrades(trades: TradeRow[]): TradeRow[] {
  const merged = new Map<string, TradeRow>();

  for (const t of trades) {
    const ticker = (t.ticker ?? "").toUpperCase();
    const type = (t.type ?? "").toUpperCase();
    const expiry = (t.expiry ?? "").trim();
    const strikeRaw = t.strike === undefined || t.strike === null ? "" : String(t.strike);
    const strikeNum = parseFloat(strikeRaw.replace(/[^0-9.]/g, "")) || 0;
    const strikeKey = strikeNum ? strikeNum.toFixed(2) : "0";
    const key = `${ticker}|${type}|${strikeKey}|${expiry}`;

    const contractsRaw = Number(t.contracts);
    const contracts = contractsRaw >= 1 ? Math.round(contractsRaw) : 1;

    if (!merged.has(key)) {
      merged.set(key, { ...t, contracts });
      continue;
    }

    const existing = merged.get(key)!;
    const existingContracts = Number(existing.contracts) >= 1 ? Math.round(Number(existing.contracts)) : 1;
    merged.set(key, { ...existing, contracts: existingContracts + contracts });
  }

  return Array.from(merged.values());
}

/** Convert Python-dict-style output to valid JSON so we can parse it. */
function pythonDictToJson(s: string): string {
  return s
    // Replace single-quoted strings with double-quoted, handling escaped single quotes inside
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_, inner) =>
      `"${inner.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`)
    // Python booleans / None
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
    // Trailing commas before } or ]
    .replace(/,\s*([}\]])/g, "$1");
}

/** Repair common LLM JSON errors before parsing. */
function repairJson(s: string): string {
  // LLMs often forget to close trade objects — the pattern is:
  //   "rationale":"...", {"num":   (missing } before the ,)
  s = s.replace(/"(\s*,\s*)\{"num":/g, (_m, sep) => `"}${sep}{"num":`);

  // Stray quote between ] and } at end of outer object: ]"} → ]}
  s = s.replace(/\]"\s*\}/g, ']}');

  // Stray quote after the last trade's closing brace before ]: }"} → }]
  s = s.replace(/\}"\s*\]/g, '}]');

  // Trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // Normalize common inline arithmetic outputs for numeric fields.
  // Examples:
  //   "total_capital_used": 1850 + 483 = 2333.0
  //   "collateral_required": 1500 * 100 = 150,000.0
  //   "expected_roc": (483.0 / 150,000.0) * 100 ≈ 0.322%
  s = s.replace(/:\s*[^,\n\r]*=\s*([0-9][0-9,]*\.?[0-9]*)/g, (_m, val) => `: ${val.replace(/,/g, "")}`);
  s = s.replace(/:\s*[^,\n\r]*≈\s*([0-9][0-9,]*\.?[0-9]*)%?/g, (_m, val) => `: ${val.replace(/,/g, "")}`);

  // Close any unclosed brackets/braces at the end of the string
  const opens = (s.match(/\[/g) ?? []).length;
  const closes = (s.match(/\]/g) ?? []).length;
  if (opens > closes) s += "]".repeat(opens - closes);
  const openB = (s.match(/\{/g) ?? []).length;
  const closeB = (s.match(/\}/g) ?? []).length;
  if (openB > closeB) s += "}".repeat(openB - closeB);

  return s;
}

/**
 * Validate LLM strikes against the backend's valid strike list for each ticker/type.
 * We snap only when the value is close to a real strike; otherwise we reject it.
 */
function validateAndSnapStrikes(
  trades: TradeRow[],
  validStrikes: Record<string, Record<string, number[]>>,
): TradeRow[] {
  console.log("[VALIDATE] Input trades:", trades.length, "Valid strikes object keys:", Object.keys(validStrikes));
  const valid: TradeRow[] = [];

  for (const t of trades) {
    let ticker = (t.ticker ?? "").toUpperCase();
    const type = (t.type ?? "").toUpperCase().includes("CC") ? "CC" : "CSP";
    if (!ticker) {
      const possibleTickers = Object.keys(validStrikes).filter(
        (k) => (validStrikes[k]?.[type] ?? []).length > 0,
      );
      if (possibleTickers.length === 1) {
        ticker = possibleTickers[0];
      }
    }

    const candidates = ticker ? validStrikes[ticker]?.[type] : undefined;

    if (!candidates || candidates.length === 0) {
      console.log("[VALIDATE] Trade", t.num, `(${ticker}/${type}): no candidates found in validStrikes, KEEPING anyway`);
      valid.push({ ...t, ticker: ticker || (t.ticker ?? "UNKNOWN") });
      continue;
    }

    const llmStrikeRaw = t.strike === undefined || t.strike === null ? "0" : String(t.strike);
    const llmStrikeParsed = parseFloat(llmStrikeRaw.replace(/[^0-9.]/g, "")) || 0;

    if (llmStrikeParsed <= 0) {
      console.log("[VALIDATE] Trade", t.num, `(${ticker}/${type}): strike '${t.strike}' parsed to ${llmStrikeParsed} ≤ 0, DROPPING`);
      continue;
    }

    const sorted = [...candidates].sort((a, b) => a - b);
    const maxCandidate = sorted[sorted.length - 1];

    // Some models output strike in cents (e.g., 1850 instead of 18.50).
    // Evaluate common scaled variants and keep the closest plausible one.
    const strikeVariants = [
      llmStrikeParsed,
      llmStrikeParsed / 10,
      llmStrikeParsed / 100,
      llmStrikeParsed / 1000,
    ].filter((v) => v > 0 && v <= maxCandidate * 2);

    const nearestDiff = (value: number) =>
      sorted.reduce((best, s) => Math.min(best, Math.abs(value - s)), Number.POSITIVE_INFINITY);

    const llmStrike = strikeVariants.length > 0
      ? strikeVariants.reduce((best, current) =>
          nearestDiff(current) < nearestDiff(best) ? current : best,
        strikeVariants[0])
      : llmStrikeParsed;

    const minStep = sorted.length > 1
      ? sorted.slice(1).reduce((min, val, i) => Math.min(min, val - sorted[i]), Number.POSITIVE_INFINITY)
      : 0.0;
    const snapTolerance = Math.max(0.01, minStep > 0 ? minStep / 2 : 0.02 * sorted[0]);

    let nearest = sorted[0];
    let bestDiff = Math.abs(nearest - llmStrike);
    for (const s of sorted) {
      const diff = Math.abs(s - llmStrike);
      if (diff < bestDiff) {
        bestDiff = diff;
        nearest = s;
      }
    }

    if (bestDiff <= snapTolerance) {
      console.log("[VALIDATE] Trade", t.num, `(${ticker}/${type}): strike ${llmStrike} snapped to ${nearest} (diff=${bestDiff.toFixed(3)}, tol=${snapTolerance.toFixed(3)})`);
      valid.push({ ...t, ticker: ticker || t.ticker, strike: `$${nearest.toFixed(2)}` });
    } else {
      console.log("[VALIDATE] Trade", t.num, `(${ticker}/${type}): strike ${llmStrike} too far from nearest ${nearest} (diff=${bestDiff.toFixed(3)}, tol=${snapTolerance.toFixed(3)}), DROPPING`);
    }
  }

  console.log("[VALIDATE] Result:", valid.length, "trades kept out of", trades.length);
  return valid;
}

function parseResponse(raw: string): ParsedResponse | null {
  console.log("[PARSE.raw] Input length:", raw.length, "First 300 chars:", raw.slice(0, 300));
  
  // Strip <think>...</think> blocks produced by deepseek-r1
  const noThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Strip markdown code fences
  const cleaned = noThink.replace(/```(?:json|python)?/gi, "").replace(/```/g, "").trim();
  console.log("[PARSE.clean] After cleanup length:", cleaned.length, "First 300 chars:", cleaned.slice(0, 300));

  // Collect all top-level JSON objects in the string — LLMs sometimes emit
  // summary and trades as two separate objects on separate lines.
  const objects: Record<string, unknown>[] = [];
  let pos = 0;
  while (true) {
    const start = cleaned.indexOf("{", pos);
    if (start === -1) break;
    const end = findMatchingBrace(cleaned, start);
    if (end === -1) break;
    const candidate = cleaned.slice(start, end);
    const repaired = repairJson(candidate);
    const attempts = [candidate, repaired, pythonDictToJson(candidate), pythonDictToJson(repaired)];
    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && typeof parsed === "object") {
          objects.push(parsed as Record<string, unknown>);
          break;
        }
      } catch { /* try next */ }
    }
    if (end === cleaned.length) break;
    pos = start + 1;
  }

  if (objects.length === 0) return null;

  console.log("[PARSE] Found", objects.length, "JSON objects to parse");

  // Merge all parsed objects: combine summary and trades from whichever objects have them.
  const merged: { summary?: string; trades?: TradeRow[]; executable_trades_ranked?: TradeRow[]; strategy_trades?: TradeRow[]; csp_cc_trades?: TradeRow[]; csp_allocation_trades?: TradeRow[] } = {};
  for (const obj of objects) {
    if (typeof obj.summary === "string" && !merged.summary) {
      merged.summary = obj.summary;
      console.log("[PARSE] Extracted summary");
    }
    if (Array.isArray(obj.trades) && !merged.trades) {
      merged.trades = obj.trades as TradeRow[];
      console.log("[PARSE] Found 'trades' array, length:", merged.trades.length);
    }
    if (Array.isArray(obj.executable_trades_ranked) && !merged.executable_trades_ranked) {
      merged.executable_trades_ranked = obj.executable_trades_ranked as TradeRow[];
      console.log("[PARSE] Found 'executable_trades_ranked' array, length:", merged.executable_trades_ranked.length);
    }
    if (!merged.strategy_trades) {
      const mapped = mapStrategyTrades(obj);
      if (mapped && mapped.length > 0) {
        merged.strategy_trades = mapped;
        console.log("[PARSE] Found 'strategy.trades', mapped to", mapped.length, "trades");
      }
    }
    if (!merged.csp_cc_trades) {
      const mapped = mapCspCcTrades(obj);
      if (mapped && mapped.length > 0) {
        merged.csp_cc_trades = mapped;
        console.log("[PARSE] Found 'csp'/'cc' trades, mapped to", mapped.length, "trades");
      }
    }
    if (!merged.csp_allocation_trades) {
      const mapped = mapCspAllocationObject(obj);
      if (mapped && mapped.length > 0) {
        merged.csp_allocation_trades = mapped;
        console.log("[PARSE] Found '*CSP Allocation*' object, mapped to", mapped.length, "trades");
      }
    }
  }

  const trades =
    merged.trades ??
    merged.executable_trades_ranked ??
    merged.strategy_trades ??
    merged.csp_cc_trades ??
    merged.csp_allocation_trades;
  if (!trades) {
    console.log("[PARSE] FAILED: No trades array found in any schema");
    return null;
  }

  console.log("[PARSE] Selected trades from schema, count:", trades.length, "before dedup");
  const deduped = deduplicateTrades(trades);
  console.log("[PARSE] After dedup:", deduped.length, "trades");
  deduped.forEach((t, i) => { t.num = i + 1; });
  return { summary: merged.summary, trades: deduped };
}

function ExecuteTable({ trades, model, provider }: { trades: TradeRow[]; model: string; provider: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 shadow-sm overflow-hidden">
      {/* Banner */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-emerald-300 bg-emerald-100">
        <span className="text-xl">✅</span>
        <h3 className="text-base font-extrabold text-emerald-800 uppercase tracking-wide">
          Execute Today
        </h3>
        <span className="ml-auto text-xs font-medium bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">
          {provider === "ollama" ? `Ollama / ${model}` : model}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wide">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Strike</th>
              <th className="px-3 py-2 text-right">Contracts</th>
              <th className="px-3 py-2 text-left">Expiry</th>
              <th className="px-3 py-2 text-right">DTE</th>
              <th className="px-3 py-2 text-right">Mid/share</th>
              <th className="px-3 py-2 text-right">Total Premium</th>
              <th className="px-3 py-2 text-right">Ann. ROC</th>
              <th className="px-3 py-2 text-right">Max Risk</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const key = String(t.num) || t.ticker;
              const isOpen = !!expanded[key];
              const isCC = (t.type ?? "").toUpperCase().includes("CC");
              // Compute all dollar figures from first principles — don't trust LLM arithmetic.
              const perShare = parseFloat((t.premium_per_share ?? "0").replace(/[^0-9.]/g, "")) || 0;
              // Clamp contracts: must be a positive whole number. LLMs sometimes output delta (0.06) as contracts.
              const contractsRaw = Number(t.contracts);
              const contracts = contractsRaw >= 1 ? Math.round(contractsRaw) : 1;
              const strikeRaw = t.strike === undefined || t.strike === null ? "0" : String(t.strike);
              const strikeNum = parseFloat(strikeRaw.replace(/[^0-9.]/g, "")) || 0;
              const computedTotal = perShare * contracts * 100;
              // Max risk: CSP = contracts × 100 × strike (full assignment cost)
              //           CC  = contracts × 100 × strike (shares called away at strike)
              const computedMaxRisk = strikeNum * contracts * 100;
              const totalPremiumDisplay = computedTotal > 0
                ? `$${computedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : (t.total_premium ?? "—");
              const maxRiskDisplay = computedMaxRisk > 0
                ? `$${computedMaxRisk.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                : (t.max_risk ?? "—");
              return (
                <React.Fragment key={key}>
                  <tr
                    onClick={() => toggle(key)}
                    className="border-t border-emerald-200 cursor-pointer hover:bg-emerald-100 transition"
                  >
                    <td className="px-3 py-3 text-emerald-600 font-bold text-base select-none">
                      {isOpen ? "−" : "+"}
                    </td>
                    <td className="px-3 py-3 text-emerald-700 font-semibold">{t.num}</td>
                    <td className="px-3 py-3">
                      <span className="bg-emerald-700 text-white text-xs font-bold px-2 py-0.5 rounded">
                        {t.action}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-extrabold text-slate-900">{t.ticker}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${isCC ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{t.strike}</td>
                    <td className="px-3 py-3 text-right font-bold text-indigo-700">
                      {t.contracts ?? 1}<span className="text-[10px] text-indigo-400 ml-0.5">×100</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{t.expiry}</td>
                    <td className="px-3 py-3 text-right text-slate-600">{t.dte ?? "—"}d</td>
                    <td className="px-3 py-3 text-right text-slate-500">{t.premium_per_share ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-600">
                      {totalPremiumDisplay}
                      <div className="text-[10px] font-normal text-emerald-400">${perShare.toFixed(2)} × {contracts} × 100</div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-800">{t.ann_roc}</td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {maxRiskDisplay}
                      <div className="text-[10px] font-normal text-slate-400">{contracts} × 100 × {t.strike}</div>
                    </td>
                  </tr>
                  {isOpen && t.rationale && (
                    <tr key={`${key}-detail`} className="bg-white border-t border-emerald-100">
                      <td colSpan={12} className="px-5 py-3">
                        <div className="flex items-start gap-2 text-sm text-slate-700">
                          <span className="text-emerald-500 font-bold mt-0.5">💡</span>
                          <span className="leading-relaxed">{t.rationale}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LlmAnalysis({ prompt, autoRun = false, validStrikes = {}, holdings = [] }: Props) {
  const holdingsByTicker = React.useMemo(() => {
    const map = new Map<string, StockHolding>();
    holdings.forEach((h) => map.set(h.ticker.toUpperCase(), h));
    return map;
  }, [holdings]);
  const [provider, setProvider] = useState<Provider>("ollama");
  const [apiKey, setApiKey] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(true);
  const [model, setModel] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    fetch("/api/ollama-models")
      .then((r) => r.json())
      .then((data: { models: string[] }) => {
        const models = data.models ?? [];
        setOllamaModels(models);
        if (models.length > 0) setModel(models[0]);
      })
      .catch(() => setOllamaModels([]))
      .finally(() => setOllamaModelsLoading(false));
  }, []);

  // Tracks whether we have a pending auto-run waiting for a model to load.
  const pendingAutoRun = useRef(false);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(p === "ollama" ? (ollamaModels[0] ?? "") : OPENAI_MODELS[0]);
    setAnalysis(null);
    setError(null);
  }

  const runAnalysis = useCallback(async function runAnalysis() {
    if (provider === "openai" && !apiKey) {
      setError("Please enter your OpenAI API key.");
      return;
    }
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      let res: Response;

      if (provider === "ollama") {
        // Route through the Next.js API proxy so the container reaches
        // host.docker.internal:11434 — avoids CORS issues in the browser.
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
      console.log("[LLM] raw response data:", JSON.stringify(data).slice(0, 500));
      const content: string =
        data.choices?.[0]?.message?.content ?? "";
      console.log("[LLM] content length:", content.length, "preview:", content.slice(0, 200));
      if (!content) {
        setError("Model returned an empty response. Try again.");
        return;
      }
      setAnalysis(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "LLM request failed");
    } finally {
      setLoading(false);
    }
  }, [provider, apiKey, model, prompt]);

  // Auto-run whenever a new prompt arrives.
  // If the model isn't ready yet (still loading Ollama list), set a pending
  // flag so the model-ready effect below picks it up.
  useEffect(() => {
    if (!autoRun) return;
    if (model) {
      const timer = setTimeout(() => {
        void runAnalysis();
      }, 0);
      return () => clearTimeout(timer);
    } else {
      // Model not yet available — wait for it.
      pendingAutoRun.current = true;
    }
  }, [autoRun, model, prompt, runAnalysis]);

  // When the model becomes available, fire any pending auto-run.
  useEffect(() => {
    if (!autoRun || !model || !pendingAutoRun.current) return;
    pendingAutoRun.current = false;
    const timer = setTimeout(() => {
      void runAnalysis();
    }, 0);
    return () => clearTimeout(timer);
  }, [autoRun, model, runAnalysis]);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-2xl font-bold text-slate-900">
          🤖 AI Expert Analysis
        </h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Send strategy candidates to an LLM for professional options trading analysis.
        Your API key is never stored on the backend.
      </p>

      {/* Controls row */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as Provider)}
          className="border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 bg-white"
        >
          <option value="ollama">🦙 Ollama (local)</option>
          <option value="openai">✨ OpenAI</option>
        </select>
        {provider === "openai" && (
          <input
            type="password"
            placeholder="OpenAI API key (sk-…)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          />
        )}
        {provider === "ollama" ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={ollamaModelsLoading}
            className="border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60"
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
            className="border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {OPENAI_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg transition shadow-md hover:shadow-lg whitespace-nowrap"
        >
          {loading ? "🔄 Analysing…" : "✨ Analyze"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm font-medium rounded-lg px-4 py-3 mb-6">
          ⚠️ {error}
        </div>
      )}

      {/* Prompt inspector */}
      <div className="mb-6">
        <button
          onClick={() => setShowPrompt((v) => !v)}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold underline"
        >
          {showPrompt ? "▼ Hide" : "▶ Show"} LLM Prompt
        </button>
        {showPrompt && (
          <div className="mt-3 space-y-3">
            {prompt.messages.map((msg: ChatMessage, i: number) => (
              <div key={i} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  {msg.role}
                </p>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-60">
                  {msg.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analysis output */}
      {loading && (
        <div className="flex items-center gap-3 text-slate-500 text-sm py-4">
          <span className="animate-spin text-xl">⏳</span>
          Waiting for model response…
        </div>
      )}

      {analysis && (() => {
        const rawParsed = parseResponse(analysis);
        console.log("[PARSE] rawParsed:", rawParsed ? { trades: rawParsed.trades.length, summary: rawParsed.summary?.slice(0, 100) } : "null");
        if (rawParsed?.trades) {
          console.log("[PARSE] First trade:", rawParsed.trades[0]);
          console.log("[PARSE] All trades:", rawParsed.trades.map(t => ({ ticker: t.ticker, type: t.type, strike: t.strike, contracts: t.contracts })));
        }

        // Validate strikes against the known-good list from the backend.
        // This prevents hallucinated or 10x strikes from appearing in the table.
        const parsed = rawParsed
          ? (() => {
              const snapped = Object.keys(validStrikes).length > 0
                ? validateAndSnapStrikes(rawParsed.trades, validStrikes)
                : rawParsed.trades;
              console.log("[SNAP] After strike validation:", snapped.length, "trades remain");
              if (snapped.length > 0) console.log("[SNAP] First after snap:", snapped[0]);
              const executable = snapped.filter((t) => {
                const ticker = (t.ticker ?? "").toUpperCase();
                const holding = holdingsByTicker.get(ticker);
                const isCsp = (t.type ?? "").toUpperCase().includes("CSP");
                if (!holding) return true;
                if (holding.shares > 0 && isCsp) return false;
                return true;
              });
              console.log("[FILTER] After holding filter:", executable.length, "trades remain");
              executable.forEach((t, i) => { t.num = i + 1; });
              return { ...rawParsed, trades: executable };
            })()
          : null;

        if (parsed !== null && parsed.trades.length === 0) {
          return (
            <div className="rounded-xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm text-slate-700">
              <p className="font-bold mb-1">📭 No trades recommended</p>
              {parsed.summary && <p className="text-slate-600">{parsed.summary}</p>}
            </div>
          );
        }

        if (parsed === null) {
          return (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-800">
              <p className="font-bold mb-2">⚠️ Could not parse structured trades from model response.</p>
              <p className="mb-2 text-xs">Raw response ({analysis.length} chars):</p>
              <pre className="text-xs whitespace-pre-wrap text-amber-700 max-h-80 overflow-auto bg-white border border-amber-200 rounded p-3">{analysis}</pre>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {/* Summary */}
            {parsed.summary && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-900 leading-relaxed">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1.5">Expert Assessment</p>
                <p>{parsed.summary}</p>
              </div>
            )}

            {/* Trades table */}
            {parsed.trades.length > 0 && (
              <ExecuteTable trades={parsed.trades} model={model} provider={provider} />
            )}

          </div>
        );
      })()}
    </section>
  );
}
