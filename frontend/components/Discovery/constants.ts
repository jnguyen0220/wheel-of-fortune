export type SortField = "rank" | "ticker" | "price" | "health" | "rating";
export type WatchSortField = "ticker" | "price" | "health" | "name" | "sector" | "analyst" | "positions";
export type SortDir = "asc" | "desc";

interface ScreenerDef {
  id: string;
  label: string;
  description: string;
  icon: string;
}

interface ScreenerCategory {
  label: string;
  screeners: ScreenerDef[];
}

export const SCREENER_CATEGORIES: ScreenerCategory[] = [
  {
    label: "Market Movers",
    screeners: [
      { id: "most_actives", label: "Most Active", description: "Highest volume today", icon: "📊" },
      { id: "day_gainers", label: "Day Gainers", description: "Biggest gains today", icon: "📈" },
      { id: "day_losers", label: "Day Losers", description: "Biggest losses today", icon: "📉" },
      { id: "most_shorted_stocks", label: "Most Shorted", description: "Highest short interest", icon: "🎯" },
      { id: "most_active_penny_stocks", label: "Active Penny Stocks", description: "Most traded penny stocks", icon: "🪙" },
      { id: "recent_52_week_highs", label: "52-Week Highs", description: "Stocks at 52-week highs", icon: "⬆️" },
      { id: "recent_52_week_lows", label: "52-Week Lows", description: "Stocks at 52-week lows", icon: "⬇️" },
    ],
  },
  {
    label: "Sentiment & Signals",
    screeners: [
      { id: "bullish_stocks_right_now", label: "Bullish Now", description: "Bullish technical signals", icon: "🐂" },
      { id: "bearish_stocks_right_now", label: "Bearish Now", description: "Bearish technical signals", icon: "🐻" },
      { id: "upside_breakout_stocks_daily", label: "Upside Breakout", description: "Daily upside breakouts", icon: "💥" },
    ],
  },
  {
    label: "Value & Growth",
    screeners: [
      { id: "undervalued_large_caps", label: "Undervalued Large Caps", description: "Below intrinsic value", icon: "💎" },
      { id: "undervalued_growth_stocks", label: "Undervalued Growth", description: "Growth at a discount", icon: "🌱" },
      { id: "strong_undervalued_stocks", label: "Strong Undervalued", description: "Deeply undervalued picks", icon: "💰" },
      { id: "undervalued_wide_moat_stocks", label: "Wide Moat Undervalued", description: "Undervalued with competitive edge", icon: "🏰" },
      { id: "growth_technology_stocks", label: "Growth Tech", description: "Strong tech growth", icon: "🚀" },
      { id: "aggressive_small_caps", label: "Aggressive Small Caps", description: "High growth potential", icon: "⚡" },
      { id: "small_cap_gainers", label: "Small Cap Gainers", description: "Small caps gaining", icon: "🔥" },
    ],
  },
  {
    label: "Ratings",
    screeners: [
      { id: "morningstar_five_star_stocks", label: "Morningstar 5-Star", description: "Top Morningstar rated", icon: "⭐" },
    ],
  },
  {
    label: "Funds & Bonds",
    screeners: [
      { id: "conservative_foreign_funds", label: "Conservative Foreign", description: "Low-risk international", icon: "🌍" },
      { id: "high_yield_bond", label: "High Yield Bonds", description: "Above-average yields", icon: "💵" },
      { id: "portfolio_anchors", label: "Portfolio Anchors", description: "Stable foundation", icon: "⚓" },
      { id: "solid_large_growth_funds", label: "Large Growth Funds", description: "Top-rated large growth", icon: "📊" },
      { id: "solid_midcap_growth_funds", label: "Midcap Growth Funds", description: "Top-rated midcap", icon: "📦" },
      { id: "top_mutual_funds", label: "Top Mutual Funds", description: "Highest-rated overall", icon: "🏆" },
    ],
  },
];

export const SCREENERS: ScreenerDef[] = SCREENER_CATEGORIES.flatMap((c) => c.screeners);

export const SIGNAL_SCREENER_IDS = [
  "most_actives", "day_gainers", "day_losers", "most_shorted_stocks",
  "bullish_stocks_right_now", "bearish_stocks_right_now", "upside_breakout_stocks_daily",
  "undervalued_large_caps", "undervalued_growth_stocks", "strong_undervalued_stocks",
];
