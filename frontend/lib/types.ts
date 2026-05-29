// ── Domain types mirroring the Rust backend models ───────────────────────────

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type OptionType = "CALL" | "PUT";

type WheelLeg = "cash_secured_put" | "covered_call";

interface StockHolding {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  current_price: number;
}

interface Inventory {
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
  has_pre_post_market_data: boolean;
  market_state: string;
  pre_market_price: number | null;
  pre_market_change_percent: number | null;
  post_market_price: number | null;
  post_market_change_percent: number | null;
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
  /** IV-aware premium selling score (-10 to +15). Positive = IV conditions favor selling. */
  iv_score?: number;
  /** Brief IV signal label. */
  iv_signal?: string;
}

export interface RecommendationResponse {
  market_data: Record<string, StockMarketData>;
  /** Pre-computed trade candidates from the wheel strategy engine. */
  recommendations: WheelRecommendation[];
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
  cc_max_assignment_pct?: number;
  csp_max_assignment_pct?: number;
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
  name: string | null;
  sector: string | null;
  description: string | null;
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

// ── Discovery types ───────────────────────────────────────────────────────────

export interface DiscoveryItem {
  rank: number;
  ticker: string;
  name: string;
  price: number;
  change_percent: number;
  volume: number;
  market_cap: number;
  analyst_rating: string | null;
}

// ── News types ────────────────────────────────────────────────────────────────

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface NewsItem {
  ticker: string;
  title: string;
  publisher: string;
  link: string;
  published_at: number;
}

// ── Shared portfolio types ────────────────────────────────────────────────────

export interface PositionTransaction {
  id: string;
  type: "buy" | "sell";
  date: string;
  quantity: number;
  price: number;
}

export interface OptionsOrder {
  id: string;
  ticker: string;
  option_type: "CALL" | "PUT";
  leg: "CC" | "CSP";
  strike: number;
  expiration: string;
  contracts: number;
  premium: number;
  status: "open" | "closed";
  created_at: string;
  close_premium?: number;
  closed_at?: string;
}

// ── IV Signal types ──────────────────────────────────────────────────────────

type MarketRegime = "range_bound" | "trending" | "volatile";
type FavoredLeg = "csp" | "cc" | "both";

export interface IvSignal {
  ticker: string;
  premium_score: number;
  regime: MarketRegime;
  favored_leg: FavoredLeg;
  atm_iv: number;
  hv_20: number;
  iv_hv_ratio: number;
  iv_rank: number;
  bb_squeeze: number;
  rsi: number;
  price: number;
  sma_20: number;
  sma_50: number;
  criteria_met: number;
  notes: string[];
  action: string;
}
