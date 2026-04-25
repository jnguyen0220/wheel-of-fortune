// ── Domain types mirroring the Rust backend models ───────────────────────────

export type OptionType = "CALL" | "PUT";

export type WheelLeg = "cash_secured_put" | "covered_call";

export interface StockHolding {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  current_price: number;
}

export interface StockHoldingInput {
  ticker: string;
  shares: number;
  cost_basis: number;
  current_price: number;
}

export interface Inventory {
  holdings: StockHolding[];
}

export interface OptionsContract {
  ticker: string;
  option_type: OptionType;
  strike: number;
  expiration: string; // "YYYY-MM-DD"
  bid: number;
  ask: number;
  last: number;
  volume: number;
  open_interest: number;
  implied_volatility: number;
  delta: number;
  theta: number;
  gamma: number;
  vega: number;
  dte: number;
  underlying_price: number;
}

export interface StockMarketData {
  ticker: string;
  price: number;
  daily_low: number;
  daily_high: number;
  week52_low: number;
  week52_high: number;
}

export interface WheelRecommendation {
  ticker: string;
  leg: WheelLeg;
  contract: OptionsContract;
  annualised_roc: number;
  quality_score: number;
  rationale: string;
  shares_held: number;
  /** How many contracts to sell at this strike/expiry. */
  contracts_allocated: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmPrompt {
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
}

export interface RecommendationResponse {
  market_data: Record<string, StockMarketData>;
  /** Pre-computed trade candidates from the wheel strategy engine. */
  recommendations: WheelRecommendation[];
  /** LLM prompt that asks the model to rank the pre-computed trades. */
  llm_prompt: LlmPrompt;
  data_source: string;
  /** Tickers that were requested but had no options chain data. */
  tickers_without_options: string[];
}

export interface RecommendationRequest {
  inventory?: Inventory;
  tickers: string[];
  available_cash?: number;
}

// ── Earnings types ───────────────────────────────────────────────────────────

export interface EarningsCalendar {
  ticker: string;
  /** Earnings report date (YYYY-MM-DD). */
  earnings_date: string;
  /** Days until earnings from today. */
  days_until: number;
  /** "BMO", "AMC", or "TAS" (time not supplied). */
  time_of_day: string;
}

export interface EarningsResult {
  ticker: string;
  /** Report date (YYYY-MM-DD). */
  report_date: string;
  /** e.g. "Q1 2025" */
  fiscal_quarter: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  eps_surprise: number | null;
  revenue_estimate: number | null;
  revenue_actual: number | null;
  beat: boolean | null;
}

// ── Analyst recommendation trend types ────────────────────────────────────────

export interface AnalystTrend {
  ticker: string;
  period: string;
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
}
