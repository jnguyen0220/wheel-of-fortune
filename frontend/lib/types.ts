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

export interface OptionsChain {
  ticker: string;
  underlying_price: number;
  contracts: OptionsContract[];
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
  /** True when the contract's DTE spans past a nearby earnings date. */
  earnings_warning?: boolean;
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
  dte_min?: number;
  dte_max?: number;
  chains?: OptionsChain[];
  earnings_calendar?: EarningsCalendar[];
  analyst_trends?: AnalystTrend[];
  min_open_interest?: number;
  cc_delta_min?: number;
  cc_delta_max?: number;
  csp_delta_min?: number;
  csp_delta_max?: number;
  min_annualised_roc?: number;
  max_annualised_roc?: number;
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

// ── Financial health types ────────────────────────────────────────────────────

export interface FinancialHealth {
  ticker: string;
  revenue: number | null;
  revenue_growth: number | null;
  net_income: number | null;
  profit_margin: number | null;
  operating_margin: number | null;
  earnings_per_share: number | null;
  total_cash: number | null;
  total_debt: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  return_on_equity: number | null;
  return_on_assets: number | null;
  free_cash_flow: number | null;
  operating_cash_flow: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  peg_ratio: number | null;
  health_score: number;
  verdict: string;
  strengths: string[];
  concerns: string[];
}

// ── Screener types ────────────────────────────────────────────────────────────

export interface ScreenerCandidate {
  ticker: string;
  current_price: number;
  target_price: number | null;
  upside_percent: number | null;
  forward_pe: number | null;
  trailing_pe: number | null;
  peg_ratio: number | null;
  price_to_book: number | null;
  profit_margin: number | null;
  revenue_growth: number | null;
  debt_to_equity: number | null;
  free_cash_flow: number | null;
  analyst_count: number | null;
  value_score: number;
  reasons: string[];
}
