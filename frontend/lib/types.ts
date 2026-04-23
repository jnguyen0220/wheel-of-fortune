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
  llm_prompt: LlmPrompt;
  data_source: string;
  /** ticker → "CC"|"CSP" → sorted list of valid strike prices from the options chain */
  valid_strikes: Record<string, Record<string, number[]>>;
}

export interface RecommendationRequest {
  inventory?: Inventory;
  tickers: string[];
  available_cash?: number;
  min_premium_abs?: number;
  min_premium_pct?: number;
  data_source?: string;
}
