import type { EarningsCalendar } from "./types";

// ── Health score color helpers ───────────────────────────────────────────────

/**
 * Returns a text color class for a health score value (0–100).
 */
export function healthScoreColor(score: number): string {
  if (score >= 80) return "text-[#3fb950]";
  if (score >= 65) return "text-[#56d364]";
  if (score >= 45) return "text-[#d29922]";
  if (score >= 25) return "text-[#db6d28]";
  return "text-[#f85149]";
}

/**
 * Returns a badge color class (bg + text) for a health score value (0–100).
 */
export function healthScoreBadgeColor(score: number): string {
  if (score >= 80) return "bg-[#3fb950]/15 text-[#3fb950]";
  if (score >= 65) return "bg-[#56d364]/15 text-[#56d364]";
  if (score >= 45) return "bg-[#d29922]/15 text-[#d29922]";
  if (score >= 25) return "bg-[#db6d28]/15 text-[#db6d28]";
  return "bg-[#f85149]/15 text-[#f85149]";
}

export function verdictBadgeColor(verdict: string): string {
  switch (verdict) {
    case "Strong": return "bg-[#238636]/20 text-[#7ee787]";
    case "Healthy": return "bg-[#1f6feb]/15 text-[#79c0ff]";
    case "Fair": return "bg-[#d29922]/15 text-[#e3b341]";
    case "Weak": return "bg-[#db6d28]/15 text-[#f0883e]";
    case "Poor": return "bg-[#f85149]/15 text-[#ff7b72]";
    default: return "bg-[#30363d]/50 text-[#8b949e]";
  }
}

// ── Earnings helpers ─────────────────────────────────────────────────────────

/**
 * Returns the number of days until the next earnings event for a ticker,
 * or undefined if no upcoming earnings.
 */
export function nextEarningsDays(
  earningsCalendar: Record<string, EarningsCalendar[]> | undefined,
  ticker: string,
): number | undefined {
  const dates = earningsCalendar?.[ticker] ?? [];
  const next = dates.find((e) => e.days_until >= 0) ?? dates[0];
  if (!next || next.days_until < 0) return undefined;
  return next.days_until;
}

/**
 * Returns a text color class for an earnings days-until value.
 */
export function earningsDaysColor(days: number): string {
  if (days <= 7) return "text-[#f85149]";
  if (days <= 14) return "text-[#d29922]";
  return "text-[#8b949e]";
}

/**
 * Returns formatted display text for earnings days.
 */
export function earningsDaysLabel(days: number): string {
  return days === 0 ? "TODAY" : `${days}d`;
}

/**
 * Returns the earnings dot indicator color (background) for ticker tabs.
 * Returns null if no dot should be shown.
 */
export function earningsDotInfo(
  earningsCalendar: Record<string, EarningsCalendar[]> | undefined,
  ticker: string,
): { show: boolean; color: string; days: number } | null {
  const days = nextEarningsDays(earningsCalendar, ticker);
  if (days === undefined || days > 14) return null;
  const color = days <= 7 ? "bg-[#f85149]" : "bg-[#d29922]";
  return { show: true, color, days };
}

// ── Number formatting helpers ────────────────────────────────────────────────

/**
 * Format a number as USD currency: $1,234.56
 */
export function fmtCurrency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a number as signed USD: +$1,234.56 or -$1,234.56
 */
export function fmtSignedCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

/**
 * Format shares/quantity with commas: 1,000
 */
export function fmtShares(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: value % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 });
}

/**
 * Format a percentage: +12.34% or -5.67%
 */
export function fmtPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

// ── Analyst consensus helpers ────────────────────────────────────────────────

export interface AnalystConsensus {
  label: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | "—";
  score: number; // 1–5 weighted average (5 = most bullish), 0 if no data
  color: string; // tailwind text color class
  total: number; // total number of analysts
}

/**
 * Compute a weighted analyst consensus from trend data.
 * Uses a 1–5 scale: Strong Buy=5, Buy=4, Hold=3, Sell=2, Strong Sell=1.
 */
export function analystConsensus(data: { strong_buy: number; buy: number; hold: number; sell: number; strong_sell: number } | null | undefined): AnalystConsensus {
  if (!data) return { label: "—", score: 0, color: "text-[#30363d]", total: 0 };
  const total = data.strong_buy + data.buy + data.hold + data.sell + data.strong_sell;
  if (total === 0) return { label: "—", score: 0, color: "text-[#30363d]", total: 0 };
  const score = (data.strong_buy * 5 + data.buy * 4 + data.hold * 3 + data.sell * 2 + data.strong_sell * 1) / total;
  let label: AnalystConsensus["label"];
  let color: string;
  if (score >= 4.5) { label = "Strong Buy"; color = "text-[#3fb950]"; }
  else if (score >= 3.5) { label = "Buy"; color = "text-[#56d364]"; }
  else if (score >= 2.5) { label = "Hold"; color = "text-[#d29922]"; }
  else if (score >= 1.5) { label = "Sell"; color = "text-[#f85149]"; }
  else { label = "Strong Sell"; color = "text-[#f85149]"; }
  return { label, score, color, total };
}
