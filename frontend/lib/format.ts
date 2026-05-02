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
