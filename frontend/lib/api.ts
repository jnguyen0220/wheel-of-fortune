import type {
  Inventory,
  StockHolding,
  StockHoldingInput,
  StockMarketData,
  RecommendationRequest,
  RecommendationResponse,
  EarningsCalendar,
  EarningsResult,
  AnalystTrend,
  OptionsChain,
  FinancialHealth,
  ScreenerCandidate,
} from "./types";

// Use relative paths - Next.js will proxy to backend via rewrites
const BASE_URL = "";

// ── Generic fetch helper ─────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  // Handle 204 No Content (empty response body)
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

// ── Inventory API ────────────────────────────────────────────────────────────

export async function getInventory(): Promise<Inventory> {
  return apiFetch<Inventory>("/api/inventory");
}

export async function addHolding(
  input: StockHoldingInput,
): Promise<StockHolding> {
  return apiFetch<StockHolding>("/api/inventory", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteHolding(id: string): Promise<void> {
  await apiFetch<void>(`/api/inventory/${id}`, { method: "DELETE" });
}

// ── Market Data API ──────────────────────────────────────────────────────────

export async function getMarketData(
  tickers: string[],
): Promise<Record<string, StockMarketData>> {
  const params = tickers.join(",");
  return apiFetch<Record<string, StockMarketData>>(
    `/api/market-data?tickers=${encodeURIComponent(params)}`,
  );
}

// ── Recommendations API ──────────────────────────────────────────────────────

export async function getRecommendations(
  req: RecommendationRequest,
): Promise<RecommendationResponse> {
  return apiFetch<RecommendationResponse>("/api/recommendations", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Earnings API ─────────────────────────────────────────────────────────────

export async function getEarningsCalendar(
  tickers: string[],
): Promise<Record<string, EarningsCalendar[]>> {
  const params = tickers.join(",");
  return apiFetch<Record<string, EarningsCalendar[]>>(
    `/api/earnings/calendar?tickers=${encodeURIComponent(params)}`,
  );
}

export async function getEarningsHistory(
  tickers: string[],
): Promise<Record<string, EarningsResult[]>> {
  const params = tickers.join(",");
  return apiFetch<Record<string, EarningsResult[]>>(
    `/api/earnings/history?tickers=${encodeURIComponent(params)}`,
  );
}

// ── Analyst Trends API ───────────────────────────────────────────────────────

export async function getAnalystTrends(
  tickers: string[],
): Promise<Record<string, AnalystTrend[]>> {
  const params = tickers.join(",");
  return apiFetch<Record<string, AnalystTrend[]>>(
    `/api/analyst-trends?tickers=${encodeURIComponent(params)}`,
  );
}

// ── Options Chain API ────────────────────────────────────────────────────────

export async function getOptionsChains(
  tickers: string[],
): Promise<OptionsChain[]> {
  const params = tickers.join(",");
  return apiFetch<OptionsChain[]>(
    `/api/options?tickers=${encodeURIComponent(params)}`,
  );
}

// ── Financial Health API ─────────────────────────────────────────────────────

export async function getFinancialHealth(
  tickers: string[],
): Promise<Record<string, FinancialHealth>> {
  const params = tickers.join(",");
  return apiFetch<Record<string, FinancialHealth>>(
    `/api/financials?tickers=${encodeURIComponent(params)}`,
  );
}

// ── Screener API ─────────────────────────────────────────────────────────────

export async function getScreenerCandidates(
  tickers?: string[],
  minScore?: number,
): Promise<ScreenerCandidate[]> {
  const params = new URLSearchParams();
  if (tickers && tickers.length > 0) {
    params.set("tickers", tickers.join(","));
  }
  if (minScore !== undefined) {
    params.set("min_score", minScore.toString());
  }
  const qs = params.toString();
  return apiFetch<ScreenerCandidate[]>(`/api/screener${qs ? `?${qs}` : ""}`);
}
