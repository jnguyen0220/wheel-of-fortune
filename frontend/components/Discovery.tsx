"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DiscoveryItem, FinancialHealth, AnalystTrend, SearchResult, StockMarketData, OptionsChain, EarningsCalendar, EarningsResult, NewsItem, WheelRecommendation, PositionTransaction, OptionsOrder } from "@/lib/types";
import { getDiscovery, getBatchData, prefetchDiscovery, searchTickers, getOptionsChains, getMarketData, getEarningsCalendar, getEarningsHistory, getNews, getRecommendations } from "@/lib/api";
import { healthScoreColor, healthScoreBadgeColor, verdictBadgeColor } from "@/lib/format";
import { useLocalStorageState } from "@/lib/hooks";
import TickerLink from "./TickerLink";
import CloseContractModal from "./CloseContractModal";
import { SummaryTab, FinancialsTab } from "./HealthPopupContext";

type SortField = "rank" | "ticker" | "price" | "health" | "rating";
type SortDir = "asc" | "desc";

interface DiscoveryProps {
  existingTickers?: string[];
  onAddTicker?: (ticker: string) => void;
  onRemoveTicker?: (ticker: string) => void;
}

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

const SCREENER_CATEGORIES: ScreenerCategory[] = [
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

// Flat list for backwards compat
const SCREENERS: ScreenerDef[] = SCREENER_CATEGORIES.flatMap((c) => c.screeners);

export default function Discovery({ existingTickers = [], onAddTicker, onRemoveTicker }: DiscoveryProps) {
  const [activeScreener, setActiveScreener] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<Record<string, FinancialHealth>>({});
  const [analystData, setAnalystData] = useState<Record<string, AnalystTrend[]>>({});
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 24;
  const prefetched = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [leftTab, setLeftTab] = useState<"screeners" | "search" | "watchlist">("watchlist");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Watchlist state ──
  const [watchlist, setWatchlist] = useLocalStorageState<string[]>("watchlist", []);
  const [watchInput, setWatchInput] = useState("");
  const [selectedWatch, setSelectedWatch] = useState<string | null>(null);
  const [watchDetailTab, setWatchDetailTab] = useState<"summary" | "financials" | "research" | "position" | "option" | "order">("summary");
  const [watchBatch, setWatchBatch] = useState<{
    financials: Record<string, FinancialHealth>;
    analyst_trends: Record<string, AnalystTrend[]>;
    market_data: Record<string, StockMarketData>;
    earnings_calendar: Record<string, EarningsCalendar[]>;
    earnings_history: Record<string, EarningsResult[]>;
  }>({ financials: {}, analyst_trends: {}, market_data: {}, earnings_calendar: {}, earnings_history: {} });
  const [watchOptions, setWatchOptions] = useState<OptionsChain | null>(null);
  const [watchOptionsLoading, setWatchOptionsLoading] = useState(false);
  const [watchOptionsExp, setWatchOptionsExp] = useState<string | null>(null);
  const [watchOptionsSubTab, setWatchOptionsSubTab] = useState<"chain" | "recommendation">("chain");
  const [watchRecs, setWatchRecs] = useState<WheelRecommendation[]>([]);
  const [watchRecsLoading, setWatchRecsLoading] = useState(false);
  const optionsChainRef = useRef<HTMLDivElement>(null);
  const optionsPriceDividerRef = useRef<HTMLTableRowElement>(null);
  const [watchNews, setWatchNews] = useState<NewsItem[]>([]);
  const [researchCollapsed, setResearchCollapsed] = useState<Record<string, boolean>>({});
  const [positions, setPositions] = useLocalStorageState<Record<string, PositionTransaction[]>>("wof-positions", {});
  const [orders, setOrders] = useLocalStorageState<OptionsOrder[]>("wof-orders", []);
  const [closingOrder, setClosingOrder] = useState<OptionsOrder | null>(null);

  const openCloseModal = useCallback((order: OptionsOrder) => {
    setClosingOrder(order);
  }, []);

  const confirmCloseOrder = useCallback((closePremium: number, closeDate: string) => {
    if (!closingOrder) return;
    setOrders(prev => prev.map(x => x.id === closingOrder.id ? { ...x, status: "closed" as const, close_premium: closePremium, closed_at: closeDate } : x));
    setClosingOrder(null);
  }, [closingOrder, setOrders]);

  const addOrder = useCallback((order: Omit<OptionsOrder, "id" | "status" | "created_at">) => {
    const newOrder: OptionsOrder = {
      ...order,
      id: crypto.randomUUID(),
      status: "open",
      created_at: new Date().toISOString(),
    };
    setOrders(prev => [newOrder, ...prev]);
    setWatchDetailTab("order");
  }, []);

  // Fetch batch data for watchlist tickers
  useEffect(() => {
    if (watchlist.length === 0) { setWatchBatch({ financials: {}, analyst_trends: {}, market_data: {}, earnings_calendar: {}, earnings_history: {} }); return; }
    getBatchData(watchlist)
      .then((b) => setWatchBatch({
        financials: b.financials,
        analyst_trends: b.analyst_trends,
        market_data: b.market_data,
        earnings_calendar: b.earnings_calendar,
        earnings_history: b.earnings_history,
      }))
      .catch(() => {});
  }, [watchlist]);

  // Fetch news for selected watchlist ticker
  useEffect(() => {
    if (!selectedWatch) { setWatchNews([]); return; }
    getNews([selectedWatch])
      .then((news) => setWatchNews(news.filter(n => n.ticker === selectedWatch)))
      .catch(() => setWatchNews([]));
  }, [selectedWatch]);

  // Fetch options when selected ticker or tab changes
  useEffect(() => {
    if (!selectedWatch || watchDetailTab !== "option") { setWatchOptions(null); return; }
    setWatchOptionsLoading(true);
    getOptionsChains([selectedWatch])
      .then((chains) => setWatchOptions(chains.find(c => c.ticker === selectedWatch) || null))
      .catch(() => setWatchOptions(null))
      .finally(() => setWatchOptionsLoading(false));
  }, [selectedWatch, watchDetailTab]);

  // Auto-scroll options chain to current price divider
  useEffect(() => {
    if (watchDetailTab === "option" && !watchOptionsLoading) {
      requestAnimationFrame(() => optionsPriceDividerRef.current?.scrollIntoView({ behavior: 'instant', block: 'center' }));
    }
  }, [watchOptionsExp, watchDetailTab, watchOptionsLoading]);

  const addToWatchlist = useCallback((ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setWatchlist((prev) => prev.includes(t) ? prev : [...prev, t]);
    setWatchInput("");
    setSelectedWatch(t);
  }, []);

  const removeFromWatchlist = useCallback((ticker: string) => {
    setWatchlist((prev) => prev.filter((t) => t !== ticker));
    if (selectedWatch === ticker) setSelectedWatch(null);
  }, [selectedWatch]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHealthData, setSearchHealthData] = useState<Record<string, FinancialHealth>>({});
  const [searchAnalystData, setSearchAnalystData] = useState<Record<string, AnalystTrend[]>>({});
  const [searchMarketData, setSearchMarketData] = useState<Record<string, StockMarketData>>({});
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefetch all screeners on first mount
  useEffect(() => {
    if (prefetched.current) return;
    prefetched.current = true;
    prefetchDiscovery().catch(() => { /* best effort */ });
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchTickers(q);
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchQuery]);

  // Fetch health data for search results
  useEffect(() => {
    if (searchResults.length === 0) { setSearchHealthData({}); setSearchAnalystData({}); setSearchMarketData({}); return; }
    const tickers = searchResults.map((r) => r.symbol);
    getBatchData(tickers)
      .then((batch) => {
        setSearchHealthData(batch.financials);
        setSearchAnalystData(batch.analyst_trends);
        setSearchMarketData(batch.market_data);
      })
      .catch(() => { /* supplementary */ });
  }, [searchResults]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  }

  async function loadScreener(screenerId: string) {
    setActiveScreener(screenerId);
    setLoading(true);
    setError(null);
    setItems([]);
    setHealthData({});
    setSortField("rank");
    setSortDir("asc");
    setPage(0);
    resultsRef.current?.scrollTo({ top: 0 });
    try {
      const results = await getDiscovery(screenerId);
      setItems(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load screener");
    } finally {
      setLoading(false);
    }
  }

  // Fetch health data when items change
  useEffect(() => {
    if (items.length === 0) return;
    const tickers = items.map((i) => i.ticker);
    getBatchData(tickers)
      .then((batch) => {
        setHealthData(batch.financials);
        setAnalystData(batch.analyst_trends);
      })
      .catch(() => { /* supplementary */ });
  }, [items]);

  function getRatingScore(item: DiscoveryItem, trendData: Record<string, AnalystTrend[]>): number {
    if (item.analyst_rating) {
      const score = parseFloat(item.analyst_rating.split(" - ")[0]);
      return isNaN(score) ? Infinity : score;
    }
    const trends = trendData[item.ticker];
    const cur = trends?.find(t => t.period === "0m");
    if (cur) {
      const total = cur.strong_buy + cur.buy + cur.hold + cur.sell + cur.strong_sell;
      if (total > 0) {
        return (cur.strong_buy * 1 + cur.buy * 2 + cur.hold * 3 + cur.sell * 4 + cur.strong_sell * 5) / total;
      }
    }
    return Infinity;
  }

  function sortItems(sourceItems: DiscoveryItem[], hData: Record<string, FinancialHealth>, aData: Record<string, AnalystTrend[]>): DiscoveryItem[] {
    // Pre-compute rating scores to avoid recalculation on every comparison
    const ratingScores = sortField === "rating"
      ? new Map(sourceItems.map(item => [item.ticker, getRatingScore(item, aData)]))
      : null;
    return [...sourceItems].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "rank":
          cmp = a.rank - b.rank;
          break;
        case "ticker":
          cmp = a.ticker.localeCompare(b.ticker);
          break;
        case "price":
          cmp = a.price - b.price;
          break;
        case "health":
          cmp = (hData[a.ticker]?.health_score ?? -1) - (hData[b.ticker]?.health_score ?? -1);
          break;
        case "rating":
          cmp = (ratingScores!.get(a.ticker) ?? Infinity) - (ratingScores!.get(b.ticker) ?? Infinity);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const sortedItems = sortItems(items, healthData, analystData);
  const totalPages = Math.ceil(sortedItems.length / PAGE_SIZE);
  const paginatedItems = sortedItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const activeScreenerDef = SCREENERS.find((s) => s.id === activeScreener);
  const existingSet = new Set(existingTickers.map(t => t.toUpperCase()));

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set(SCREENER_CATEGORIES.map(c => c.label)));

  function toggleCategory(label: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function renderRatingCell(item: DiscoveryItem, currentAnalystData: Record<string, AnalystTrend[]>) {
    let label = "";
    let score = NaN;
    if (item.analyst_rating) {
      const parts = item.analyst_rating.split(" - ");
      score = parseFloat(parts[0]);
      label = parts[1] || "";
    } else {
      const trends = currentAnalystData[item.ticker];
      const cur = trends?.find(t => t.period === "0m");
      if (cur) {
        const total = cur.strong_buy + cur.buy + cur.hold + cur.sell + cur.strong_sell;
        if (total > 0) {
          score = (cur.strong_buy * 1 + cur.buy * 2 + cur.hold * 3 + cur.sell * 4 + cur.strong_sell * 5) / total;
          label = score <= 1.5 ? "Strong Buy" : score <= 2.5 ? "Buy" : score <= 3.5 ? "Hold" : score <= 4.5 ? "Underperform" : "Sell";
        }
      }
    }
    if (!label) return <span className="text-[10px] text-[#484f58]">—</span>;
    const color = score <= 1.5 ? "text-[#3fb950] bg-[#3fb95010]"
      : score <= 2.5 ? "text-[#58a6ff] bg-[#58a6ff10]"
      : score <= 3.5 ? "text-[#d29922] bg-[#d2992210]"
      : "text-[#f85149] bg-[#f8514910]";
    return (
      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${color}`} title={`${score.toFixed(1)} - ${label}`}>
        {label}
      </span>
    );
  }

  function renderResultsTable(
    tableItems: DiscoveryItem[],
    currentHealthData: Record<string, FinancialHealth>,
    currentAnalystData: Record<string, AnalystTrend[]>,
    scrollRef: React.RefObject<HTMLDivElement | null>,
    showRank: boolean,
  ) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#161b22] z-10">
            <tr className="border-b border-[#30363d]">
              <th className="px-3 py-2.5 w-9">
                <svg className="w-3.5 h-3.5 text-[#d29922] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </th>
              {showRank && (
                <th
                  className="px-2 py-2.5 text-center th w-10 cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                  onClick={() => toggleSort("rank")}
                >
                  <span className="inline-flex items-center gap-0.5">
                    #
                    {sortField === "rank" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </span>
                </th>
              )}
              <th
                className="px-3 py-2.5 text-left th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                onClick={() => toggleSort("ticker")}
              >
                <span className="inline-flex items-center gap-0.5">
                  Ticker
                  {sortField === "ticker" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </span>
              </th>
              <th className="px-3 py-2.5 text-left th">Company</th>
              <th className="px-3 py-2.5 text-left th">Sector</th>
              <th
                className="px-3 py-2.5 text-right th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                onClick={() => toggleSort("price")}
              >
                <span className="inline-flex items-center justify-end gap-0.5">
                  Price
                  {sortField === "price" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </span>
              </th>
              <th
                className="px-3 py-2.5 text-right th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                onClick={() => toggleSort("health")}
              >
                <span className="inline-flex items-center justify-end gap-0.5">
                  Health
                  {sortField === "health" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </span>
              </th>
              <th className="px-3 py-2.5 text-right th">Change</th>
              <th
                className="px-3 py-2.5 text-center th cursor-pointer select-none hover:text-[#c9d1d9] transition-colors"
                onClick={() => toggleSort("rating")}
              >
                <span className="inline-flex items-center justify-center gap-0.5">
                  Rating
                  {sortField === "rating" && <span className="text-[#58a6ff] text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tableItems.map((item, idx) => {
              const isLast = idx === tableItems.length - 1;
              const rowBorder = isLast ? "" : "border-b border-[#21262d]/60";
              const health = currentHealthData[item.ticker];
              const inWatchlist = watchlist.includes(item.ticker.toUpperCase());
              return (
                <tr key={`${item.ticker}-${item.rank}`} className={`group transition-colors duration-100 ${inWatchlist ? "bg-[#d2992208]" : "hover:bg-[#161b22]"}`}>
                  <td className={`px-3 py-2.5 text-center ${rowBorder}`}>
                    <input
                      type="checkbox"
                      checked={inWatchlist}
                      onChange={() => {
                        if (inWatchlist) {
                          removeFromWatchlist(item.ticker.toUpperCase());
                        } else {
                          addToWatchlist(item.ticker);
                        }
                      }}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#d29922] focus:ring-[#d29922] focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                    />
                  </td>
                  {showRank && (
                    <td className={`px-2 py-2.5 text-center tabular-nums text-[#484f58] text-[10px] ${rowBorder}`}>
                      {item.rank}
                    </td>
                  )}
                  <td className={`px-3 py-2.5 ${rowBorder}`}>
                    <TickerLink ticker={item.ticker} className="font-bold text-[11px] text-[#58a6ff] tracking-wide uppercase hover:underline cursor-pointer" />
                  </td>
                  <td className={`px-3 py-2.5 ${rowBorder}`}>
                    <span className="text-[10px] text-[#8b949e] truncate max-w-[150px] block leading-tight">
                      {health?.name || item.name || "—"}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 ${rowBorder}`}>
                    {health?.sector ? (
                      <span className="text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                        {health.sector}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#484f58]">—</span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold text-[#c9d1d9] ${rowBorder}`}>
                    ${item.price.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                    {health ? (
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-6 h-1 rounded-full bg-[#21262d] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${health.health_score}%`,
                              backgroundColor: health.health_score >= 70 ? '#3fb950' : health.health_score >= 40 ? '#d29922' : '#f85149',
                            }}
                          />
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums ${healthScoreColor(health.health_score)}`}>
                          {health.health_score}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[#484f58] text-[10px]">—</span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                    <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                      item.change_percent >= 0
                        ? "text-[#3fb950] bg-[#3fb95010]"
                        : "text-[#f85149] bg-[#f8514910]"
                    }`}>
                      {item.change_percent >= 0 ? "+" : ""}{item.change_percent.toFixed(2)}%
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 text-center ${rowBorder}`}>
                    {renderRatingCell(item, currentAnalystData)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Convert search results to DiscoveryItem shape for the shared table
  const searchAsItems: DiscoveryItem[] = searchResults.map((r, i) => {
    const md = searchMarketData[r.symbol];
    return {
      rank: i + 1,
      ticker: r.symbol,
      name: r.name,
      price: md?.price ?? 0,
      change_percent: 0,
      volume: 0,
      market_cap: 0,
      analyst_rating: null,
    };
  });

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Top-level tab switcher */}
      <div className="tab-group mb-3">
        <button
          onClick={() => setLeftTab("watchlist")}
          className={`tab-btn flex items-center gap-1.5 ${
            leftTab === "watchlist"
              ? "bg-[#30363d] text-[#c9d1d9]"
              : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
          Watchlist
          {watchlist.length > 0 && (
            <span className="text-[9px] bg-[#21262d] text-[#8b949e] px-1.5 py-0.5 rounded-full">{watchlist.length}</span>
          )}
        </button>
        <button
          onClick={() => setLeftTab("screeners")}
          className={`tab-btn flex items-center gap-1.5 ${
            leftTab === "screeners"
              ? "bg-[#30363d] text-[#c9d1d9]"
              : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
          Screeners
          <span className="text-[9px] bg-[#21262d] text-[#8b949e] px-1.5 py-0.5 rounded-full">{SCREENERS.length}</span>
        </button>
        <button
          onClick={() => setLeftTab("search")}
          className={`tab-btn flex items-center gap-1.5 ${
            leftTab === "search"
              ? "bg-[#30363d] text-[#c9d1d9]"
              : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          Search
        </button>
      </div>

      {/* ── Screeners Tab ── */}
      {leftTab === "screeners" && (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Screener sidebar */}
          <div className="w-[260px] shrink-0 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#30363d]">
              <svg className="w-4 h-4 text-[#58a6ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
              <div>
                <h3 className="text-[11px] font-bold text-[#c9d1d9] uppercase tracking-wide">Screeners</h3>
                <p className="text-[9px] text-[#484f58]">{SCREENERS.length} available</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {SCREENER_CATEGORIES.map((cat) => {
                const isExpanded = expandedCategories.has(cat.label);
                return (
                  <div key={cat.label}>
                    <button
                      onClick={() => toggleCategory(cat.label)}
                      className="flex items-center justify-between w-full px-4 py-2 bg-[#161b22]/50 border-b border-[#21262d]/60 hover:bg-[#161b22] transition-colors"
                    >
                      <span className="text-[9px] font-bold text-[#8b949e] uppercase tracking-widest">{cat.label}</span>
                      <svg className={`w-3 h-3 text-[#484f58] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                    {isExpanded && cat.screeners.map((s) => {
                      const isActive = activeScreener === s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => loadScreener(s.id)}
                          className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-all duration-150 border-b border-[#21262d]/40 last:border-b-0 ${
                            isActive
                              ? "bg-[#161b22] border-l-[3px] border-l-[#58a6ff] pl-[13px]"
                              : "hover:bg-[#161b22]/50 border-l-[3px] border-l-transparent"
                          }`}
                        >
                          <span className="text-sm leading-none">{s.icon}</span>
                          <div className="flex-1 min-w-0">
                            <span className={`text-[11px] font-semibold block truncate ${isActive ? "text-[#58a6ff]" : "text-[#c9d1d9]"}`}>
                              {s.label}
                            </span>
                            <span className="text-[9px] text-[#484f58] block truncate">{s.description}</span>
                          </div>
                          {isActive && (
                            <svg className="w-3 h-3 text-[#58a6ff] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Screener results */}
          <div ref={resultsRef} className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm">
            {!activeScreener ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-[#8b949e]">Select a screener</p>
                  <p className="text-[10px] text-[#484f58] mt-0.5">Choose from the panel on the left to explore stocks</p>
                </div>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <div className="w-10 h-10 rounded-full border-2 border-[#30363d] border-t-[#58a6ff] animate-spin" />
                <p className="text-xs text-[#8b949e] font-medium">Loading {activeScreenerDef?.label}…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-16">
                <div className="w-10 h-10 rounded-full bg-[#f8514915] border border-[#f8514930] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#f85149]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <p className="text-xs text-[#f85149] font-medium">{error}</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-16">
                <p className="text-xs text-[#484f58]">No results for this screener.</p>
              </div>
            ) : (
              <>
                {/* Results header */}
                <div className="px-4 py-3 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#30363d] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{activeScreenerDef?.icon}</span>
                    <div>
                      <h4 className="text-[11px] font-bold text-[#c9d1d9]">{activeScreenerDef?.label}</h4>
                      <p className="text-[9px] text-[#484f58]">{activeScreenerDef?.description}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded-full">
                    {items.length} stocks
                  </span>
                </div>

                {renderResultsTable(paginatedItems, healthData, analystData, tableScrollRef, true)}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#30363d] bg-[#161b22]">
                    <span className="text-[10px] text-[#484f58] tabular-nums">
                      Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedItems.length)} of {sortedItems.length}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => { setPage((p) => Math.max(0, p - 1)); tableScrollRef.current?.scrollTo({ top: 0 }); }}
                        disabled={page === 0}
                        className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed transition"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                      </button>
                      <span className="text-[10px] text-[#8b949e] tabular-nums px-2 font-medium">
                        {page + 1} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setPage((p) => Math.min(totalPages - 1, p + 1)); tableScrollRef.current?.scrollTo({ top: 0 }); }}
                        disabled={page >= totalPages - 1}
                        className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] disabled:opacity-30 disabled:cursor-not-allowed transition"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Search Tab ── */}
      {leftTab === "search" && (
        <div className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm min-h-0">
          {/* Search input bar */}
          <div className="px-4 py-3 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#30363d] flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <svg className="w-3.5 h-3.5 text-[#484f58] absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ticker or company name…"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md pl-9 pr-8 py-1.5 text-[11px] text-[#c9d1d9] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] transition"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#c9d1d9] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <span className="text-[10px] font-medium text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded-full">
                {searchResults.length} results
              </span>
            )}
          </div>

          {/* Search results */}
          {searchLoading ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
              <div className="w-10 h-10 rounded-full border-2 border-[#30363d] border-t-[#58a6ff] animate-spin" />
              <p className="text-xs text-[#8b949e] font-medium">Searching…</p>
            </div>
          ) : !searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
              <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
                <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-[#8b949e]">Search for a stock</p>
                <p className="text-[10px] text-[#484f58] mt-0.5">Enter a ticker symbol or company name</p>
              </div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 py-16">
              <p className="text-xs text-[#484f58]">No results found for &ldquo;{searchQuery}&rdquo;</p>
            </div>
          ) : (
            renderResultsTable(sortItems(searchAsItems, searchHealthData, searchAnalystData), searchHealthData, searchAnalystData, tableScrollRef, false)
          )}
        </div>
      )}
      {/* ── Watchlist Tab ── */}
      {leftTab === "watchlist" && (
        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left: ticker list */}
          <div className="w-[260px] shrink-0 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col">
            <div className="flex items-center gap-2.5 px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
              <svg className="w-3.5 h-3.5 text-[#d29922]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              <span className="text-[11px] font-semibold text-[#c9d1d9] tracking-wide flex-1">Watchlist</span>
              <span className="text-[9px] text-[#484f58] tabular-nums bg-[#21262d] px-1.5 py-0.5 rounded-full font-medium">{watchlist.length}</span>
            </div>
            {/* Add ticker input */}
            <form
              onSubmit={(e) => { e.preventDefault(); addToWatchlist(watchInput); }}
              className="flex items-center gap-1.5 px-3 py-2 border-b border-[#21262d]"
            >
              <input
                type="text"
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value.toUpperCase())}
                placeholder="Add ticker…"
                className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-[11px] text-[#c9d1d9] placeholder:text-[#30363d] focus:outline-none focus:border-[#58a6ff] transition"
              />
              <button
                type="submit"
                disabled={!watchInput.trim()}
                className="px-2.5 py-1.5 rounded bg-[#21262d] border border-[#30363d] text-[#c9d1d9] text-[10px] font-medium disabled:opacity-20 hover:bg-[#30363d] hover:border-[#8b949e] transition shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              </button>
            </form>
            {/* Ticker list */}
            <div className="flex-1 overflow-y-auto">
              {watchlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-12 px-4">
                  <svg className="w-6 h-6 text-[#21262d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                  <p className="text-[10px] text-[#484f58]">Add a ticker to start</p>
                </div>
              ) : (
                watchlist.map((t) => {
                  const md = watchBatch.market_data[t];
                  const health = watchBatch.financials[t];
                  const isActive = selectedWatch === t;
                  const hasTxns = (positions[t] || []).length > 0;
                  return (
                    <div
                      key={t}
                      onClick={() => setSelectedWatch(t)}
                      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-b border-[#21262d]/30 last:border-b-0 ${
                        isActive
                          ? "bg-[#161b22] border-l-2 border-l-[#d29922]"
                          : "hover:bg-[#161b22]/40 border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] font-bold tracking-wide ${
                              isActive ? "text-[#d29922]" : "text-[#c9d1d9]"
                            }`}>{t}</span>
                            {health && (
                              <span className={`text-[9px] font-bold tabular-nums ${healthScoreColor(health.health_score)}`}>
                                {health.health_score}
                              </span>
                            )}
                            {hasTxns && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#d29922]/60 shrink-0" title="Has positions" />
                            )}
                            {(() => { const oc = orders.filter(o => o.ticker === t && o.status === "open").length; return oc > 0 ? <span className="text-[8px] font-bold tabular-nums text-[#58a6ff] bg-[#58a6ff]/10 rounded-full px-1.5 py-0.5 leading-none">{oc}</span> : null; })()}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {md && (
                              <span className="text-[10px] text-[#8b949e] font-medium tabular-nums">${md.price.toFixed(2)}</span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); removeFromWatchlist(t); }}
                              className="opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-[#f85149] transition-all p-0.5"
                              title="Remove"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {health?.name && (
                          <p className="text-[9px] text-[#484f58] truncate leading-tight">{health.name}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          <div className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col">
            {!selectedWatch ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-16">
                <svg className="w-8 h-8 text-[#21262d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
                <p className="text-[11px] text-[#484f58]">Select a ticker to view details</p>
              </div>
            ) : (
              <>
                {/* Ticker header */}
                <div className="bg-[#161b22] px-5 py-3 border-b border-[#21262d]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border ${
                        watchBatch.financials[selectedWatch]?.health_score >= 70
                          ? "bg-[#238636]/10 border-[#238636]/20 text-[#3fb950]"
                          : watchBatch.financials[selectedWatch]?.health_score >= 40
                          ? "bg-[#d29922]/10 border-[#d29922]/20 text-[#d29922]"
                          : watchBatch.financials[selectedWatch]
                          ? "bg-[#f85149]/10 border-[#f85149]/20 text-[#f85149]"
                          : "bg-[#21262d] border-[#30363d] text-[#8b949e]"
                      }`}>
                        {selectedWatch.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#f0f6fc] tracking-tight">{selectedWatch}</span>
                          {watchBatch.financials[selectedWatch] && (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${healthScoreBadgeColor(watchBatch.financials[selectedWatch].health_score)}`}>
                              <span className="tabular-nums">{watchBatch.financials[selectedWatch].health_score}</span>
                            </span>
                          )}
                          {watchBatch.financials[selectedWatch]?.verdict && (
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${verdictBadgeColor(watchBatch.financials[selectedWatch].verdict)}`}>
                              {watchBatch.financials[selectedWatch].verdict}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {watchBatch.financials[selectedWatch]?.name && (
                            <span className="text-[11px] text-[#8b949e]">{watchBatch.financials[selectedWatch].name}</span>
                          )}
                          {watchBatch.financials[selectedWatch]?.sector && (
                            <><span className="text-[#30363d] text-[10px]">·</span><span className="text-[11px] text-[#484f58]">{watchBatch.financials[selectedWatch].sector}</span></>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {watchBatch.market_data[selectedWatch] && (
                        <span className="text-base font-bold text-[#f0f6fc] tabular-nums">${watchBatch.market_data[selectedWatch].price.toFixed(2)}</span>
                      )}
                      <div className="flex items-center gap-1 mt-1 justify-end flex-wrap">
                        {watchBatch.market_data[selectedWatch] && (
                          <span className="text-[9px] text-[#484f58] tabular-nums">
                            ${watchBatch.market_data[selectedWatch].week52_low.toFixed(0)}–${watchBatch.market_data[selectedWatch].week52_high.toFixed(0)}
                          </span>
                        )}
                        {watchBatch.financials[selectedWatch]?.trailing_pe != null && (
                          <span className="text-[9px] text-[#484f58] tabular-nums">
                            · P/E {watchBatch.financials[selectedWatch].trailing_pe!.toFixed(1)}
                          </span>
                        )}
                        {watchBatch.financials[selectedWatch]?.revenue_growth != null && (
                          <span className="text-[9px] tabular-nums">
                            · <span className={watchBatch.financials[selectedWatch].revenue_growth! >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>
                              {watchBatch.financials[selectedWatch].revenue_growth! >= 0 ? "+" : ""}{(watchBatch.financials[selectedWatch].revenue_growth! * 100).toFixed(1)}%
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detail sub-tabs */}
                <div className="tab-group overflow-x-auto">
                  {(["summary", "financials", "research", "position", "option", "order"] as const).map((tab) => {
                    const label = { summary: "Summary", financials: "Financials", research: "Research", position: "Position", option: "Options", order: "Contracts" }[tab];
                    const icon = {
                      summary: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>,
                      financials: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
                      research: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
                      position: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>,
                      option: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>,
                      order: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>,
                    }[tab];
                    return (
                      <button
                        key={tab}
                        onClick={() => setWatchDetailTab(tab)}
                        className={`tab-btn whitespace-nowrap inline-flex items-center gap-1 ${
                          watchDetailTab === tab
                            ? "bg-[#30363d] text-[#c9d1d9]"
                            : "text-[#8b949e] hover:text-[#c9d1d9]"
                        }`}
                      >
                        {icon}
                        {label}
                        {tab === "order" && (() => { const oc = orders.filter(o => o.ticker === selectedWatch && o.status === "open").length; return oc > 0 ? <span className="text-[8px] font-bold tabular-nums text-[#58a6ff] bg-[#58a6ff]/10 rounded-full px-1.5 leading-none">{oc}</span> : null; })()}
                      </button>
                    );
                  })}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-4 bg-[#0d1117]">
                  {watchDetailTab === "summary" && (
                    <SummaryTab health={watchBatch.financials[selectedWatch]} />
                  )}
                  {watchDetailTab === "financials" && (
                    <FinancialsTab health={watchBatch.financials[selectedWatch]} />
                  )}
                  {watchDetailTab === "research" && (() => {
                    const md = watchBatch.market_data[selectedWatch];
                    const cal = watchBatch.earnings_calendar[selectedWatch];
                    const hist = watchBatch.earnings_history[selectedWatch];
                    const trends = watchBatch.analyst_trends[selectedWatch];
                    const fmtP = (v: number) => `$${v.toFixed(2)}`;
                    const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

                    const sortedHist = hist ? [...hist].sort((a, b) => b.report_date.localeCompare(a.report_date)) : [];
                    let streak = 0;
                    for (const e of sortedHist) { if (e.beat === true) streak++; else break; }

                    const latest = trends?.[0];
                    const totalAnalysts = latest ? latest.strong_buy + latest.buy + latest.hold + latest.sell + latest.strong_sell : 0;
                    const bullish = latest ? latest.strong_buy + latest.buy : 0;
                    const bearish = latest ? latest.sell + latest.strong_sell : 0;
                    const bullPct = totalAnalysts > 0 ? ((bullish / totalAnalysts) * 100).toFixed(0) : "0";
                    const consensus = totalAnalysts === 0 ? "N/A"
                      : bullish / totalAnalysts >= 0.7 ? "Strong Buy"
                      : bullish / totalAnalysts >= 0.5 ? "Buy"
                      : bearish / totalAnalysts >= 0.5 ? "Sell"
                      : bearish / totalAnalysts >= 0.7 ? "Strong Sell"
                      : "Hold";
                    const consensusColor = consensus === "Strong Buy" || consensus === "Buy"
                      ? "text-[#3fb950]" : consensus === "Hold"
                      ? "text-[#d29922]" : consensus === "N/A"
                      ? "text-[#484f58]" : "text-[#f85149]";

                    const toggleResearch = (k: string) => setResearchCollapsed(prev => ({ ...prev, [k]: !prev[k] }));

                    const formatTimeAgo = (ts: number) => {
                      const secs = Math.floor((Date.now() - ts * 1000) / 1000);
                      if (secs < 60) return "now";
                      const mins = Math.floor(secs / 60);
                      if (mins < 60) return `${mins}m`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h`;
                      const days = Math.floor(hrs / 24);
                      return `${days}d`;
                    };

                    const SectionHeader = ({ id, icon, label, badge }: { id: string; icon: React.ReactNode; label: string; badge?: React.ReactNode }) => (
                      <button
                        onClick={() => toggleResearch(id)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-[#161b22] hover:bg-[#1c2128] transition-colors select-none"
                      >
                        <svg className={`w-3 h-3 text-[#484f58] transition-transform ${researchCollapsed[id] ? "-rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                        {icon}
                        <span className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest flex-1 text-left">{label}</span>
                        {badge}
                      </button>
                    );

                    const Row = ({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) => (
                      <div className={`flex items-center justify-between px-3 py-1.5 ${muted ? "" : "border-t border-[#21262d]/40"}`}>
                        <span className="text-[10px] text-[#484f58]">{label}</span>
                        <span className="text-[10px] tabular-nums font-medium">{children}</span>
                      </div>
                    );

                    return (
                      <div className="space-y-2">
                        {/* ── Price ── */}
                        <div className="border border-[#21262d] rounded-lg overflow-hidden">
                          <SectionHeader
                            id="price"
                            icon={<svg className="w-3 h-3 text-[#8b949e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>}
                            label="Price"
                            badge={md ? <span className="text-[10px] font-bold text-[#f0f6fc] tabular-nums">{fmtP(md.price)}</span> : undefined}
                          />
                          {!researchCollapsed["price"] && (
                            md ? (
                              <div className="bg-[#0d1117]">
                                <Row label="Daily Range"><span className="text-[#c9d1d9]">{fmtP(md.daily_low)} — {fmtP(md.daily_high)}</span></Row>
                                <Row label="52-Week Low"><span className="text-[#c9d1d9]">{fmtP(md.week52_low)}</span></Row>
                                <Row label="52-Week High"><span className="text-[#c9d1d9]">{fmtP(md.week52_high)}</span></Row>
                                <Row label="52-Week Position">
                                  <span className="text-[#c9d1d9]">
                                    {md.week52_high > md.week52_low ? (() => {
                                      const pct = (md.price - md.week52_low) / (md.week52_high - md.week52_low) * 100;
                                      return (
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className="w-16 h-1.5 rounded-full bg-[#21262d] overflow-hidden inline-block align-middle">
                                            <span className="h-full rounded-full bg-[#58a6ff] block" style={{ width: `${Math.min(100, pct)}%` }} />
                                          </span>
                                          {pct.toFixed(0)}%
                                        </span>
                                      );
                                    })() : "—"}
                                  </span>
                                </Row>
                                <Row label="Market State"><span className="text-[#8b949e]">{md.market_state}</span></Row>
                                {md.pre_market_price != null && (
                                  <Row label="Pre-Market">
                                    <span className={md.pre_market_change_percent != null && md.pre_market_change_percent >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>
                                      {fmtP(md.pre_market_price)} {md.pre_market_change_percent != null && fmtPct(md.pre_market_change_percent)}
                                    </span>
                                  </Row>
                                )}
                                {md.post_market_price != null && (
                                  <Row label="After-Hours">
                                    <span className={md.post_market_change_percent != null && md.post_market_change_percent >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>
                                      {fmtP(md.post_market_price)} {md.post_market_change_percent != null && fmtPct(md.post_market_change_percent)}
                                    </span>
                                  </Row>
                                )}
                              </div>
                            ) : (
                              <div className="px-3 py-3 text-[10px] text-[#484f58] text-center bg-[#0d1117]">No price data available</div>
                            )
                          )}
                        </div>

                        {/* ── Earnings ── */}
                        <div className="border border-[#21262d] rounded-lg overflow-hidden">
                          <SectionHeader
                            id="earnings"
                            icon={<svg className="w-3 h-3 text-[#8b949e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>}
                            label="Earnings"
                            badge={streak > 0 ? <span className="text-[9px] font-bold bg-[#3fb950]/15 text-[#3fb950] px-1.5 py-0.5 rounded">{streak}Q beat streak</span> : undefined}
                          />
                          {!researchCollapsed["earnings"] && (
                            (cal && cal.length > 0) || sortedHist.length > 0 ? (
                              <div className="bg-[#0d1117]">
                                {cal && cal.length > 0 && (
                                  <>
                                    <Row label="Next Earnings"><span className="text-[#c9d1d9]">{cal[0].earnings_date}</span></Row>
                                    <Row label="Days Until"><span className={cal[0].days_until <= 7 ? "text-[#d29922] font-semibold" : "text-[#c9d1d9]"}>{cal[0].days_until}d</span></Row>
                                  </>
                                )}
                                {sortedHist.length > 0 && (
                                  <div className="border-t border-[#21262d]/40 px-3 py-2">
                                    <div className="grid grid-cols-6 gap-1">
                                      {sortedHist.slice(0, 6).map((e, i) => (
                                        <div key={i} className="text-center">
                                          <div className="text-[8px] text-[#484f58] mb-0.5 truncate">{e.fiscal_quarter}</div>
                                          <div className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                            e.beat === true ? "bg-[#3fb950]/15 text-[#3fb950]" :
                                            e.beat === false ? "bg-[#f85149]/15 text-[#f85149]" :
                                            "bg-[#21262d] text-[#484f58]"
                                          }`}>
                                            {e.eps_actual != null ? `$${e.eps_actual.toFixed(2)}` : "—"}
                                          </div>
                                          {e.eps_surprise != null && (
                                            <div className={`text-[8px] mt-0.5 ${e.eps_surprise >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                                              {e.eps_surprise >= 0 ? "+" : ""}{e.eps_surprise.toFixed(2)}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="px-3 py-3 text-[10px] text-[#484f58] text-center bg-[#0d1117]">No earnings data available</div>
                            )
                          )}
                        </div>

                        {/* ── Analyst ── */}
                        <div className="border border-[#21262d] rounded-lg overflow-hidden">
                          <SectionHeader
                            id="analyst"
                            icon={<svg className="w-3 h-3 text-[#8b949e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>}
                            label="Analyst"
                            badge={totalAnalysts > 0 ? <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${consensusColor === "text-[#3fb950]" ? "bg-[#3fb950]/15 text-[#3fb950]" : consensusColor === "text-[#d29922]" ? "bg-[#d29922]/15 text-[#d29922]" : consensusColor === "text-[#f85149]" ? "bg-[#f85149]/15 text-[#f85149]" : "bg-[#21262d] text-[#484f58]"}`}>{consensus}</span> : undefined}
                          />
                          {!researchCollapsed["analyst"] && (
                            latest && totalAnalysts > 0 ? (
                              <div className="bg-[#0d1117]">
                                <div className="border-t border-[#21262d]/40 px-3 py-2">
                                  <div className="flex items-center gap-1 h-2.5 rounded-full overflow-hidden bg-[#21262d]">
                                    {[{c: "bg-[#2ea043]", v: latest.strong_buy}, {c: "bg-[#3fb950]", v: latest.buy}, {c: "bg-[#d29922]", v: latest.hold}, {c: "bg-[#db6d28]", v: latest.sell}, {c: "bg-[#f85149]", v: latest.strong_sell}].map((s, i) => (
                                      s.v > 0 ? <div key={i} className={`${s.c} h-full`} style={{ width: `${(s.v / totalAnalysts) * 100}%` }} /> : null
                                    ))}
                                  </div>
                                  <div className="flex justify-between mt-1">
                                    <span className="text-[8px] text-[#3fb950]">{bullPct}% Bull</span>
                                    <span className="text-[8px] text-[#484f58]">{totalAnalysts} analysts</span>
                                  </div>
                                </div>
                                <Row label="Strong Buy"><span className="text-[#2ea043]">{latest.strong_buy}</span></Row>
                                <Row label="Buy"><span className="text-[#3fb950]">{latest.buy}</span></Row>
                                <Row label="Hold"><span className="text-[#d29922]">{latest.hold}</span></Row>
                                <Row label="Sell"><span className="text-[#db6d28]">{latest.sell}</span></Row>
                                <Row label="Strong Sell"><span className="text-[#f85149]">{latest.strong_sell}</span></Row>
                              </div>
                            ) : (
                              <div className="px-3 py-3 text-[10px] text-[#484f58] text-center bg-[#0d1117]">No analyst data available</div>
                            )
                          )}
                        </div>

                        {/* ── News ── */}
                        <div className="border border-[#21262d] rounded-lg overflow-hidden">
                          <SectionHeader
                            id="news"
                            icon={<svg className="w-3 h-3 text-[#8b949e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5" /></svg>}
                            label="News"
                            badge={watchNews.length > 0 ? <span className="text-[9px] text-[#484f58]">{watchNews.length}</span> : undefined}
                          />
                          {!researchCollapsed["news"] && (
                            watchNews.length > 0 ? (
                              <div className="bg-[#0d1117] divide-y divide-[#21262d]/40 max-h-[320px] overflow-y-auto">
                                {watchNews.map((item, i) => (
                                  <a
                                    key={i}
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-2 px-3 py-2 hover:bg-[#161b22]/80 transition-colors group"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] text-[#c9d1d9] leading-snug line-clamp-2 group-hover:text-[#f0f6fc] transition-colors">{item.title}</p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[8px] text-[#484f58]">{item.publisher}</span>
                                        <span className="text-[8px] text-[#30363d]">·</span>
                                        <span className="text-[8px] text-[#30363d]">{formatTimeAgo(item.published_at)}</span>
                                      </div>
                                    </div>
                                    <svg className="w-3 h-3 text-[#30363d] group-hover:text-[#484f58] mt-0.5 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                    </svg>
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <div className="px-3 py-3 text-[10px] text-[#484f58] text-center bg-[#0d1117]">No recent news</div>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Position tab ── */}
                  {watchDetailTab === "position" && (() => {
                    const md = watchBatch.market_data[selectedWatch];
                    const txns = positions[selectedWatch] || [];
                    const today = new Date().toISOString().slice(0, 10);
                    const defaultPrice = md ? md.price : 0;

                    const addTxn = (e: React.FormEvent<HTMLFormElement>) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const fd = new FormData(form);
                      const txn: PositionTransaction = {
                        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                        type: fd.get("type") as "buy" | "sell",
                        date: fd.get("date") as string,
                        quantity: parseFloat(fd.get("quantity") as string),
                        price: parseFloat(fd.get("price") as string),
                      };
                      if (!txn.quantity || txn.quantity <= 0 || !txn.price || txn.price <= 0) return;
                      setPositions(prev => ({ ...prev, [selectedWatch]: [...(prev[selectedWatch] || []), txn] }));
                      form.reset();
                      (form.elements.namedItem("date") as HTMLInputElement).value = today;
                      (form.elements.namedItem("price") as HTMLInputElement).value = defaultPrice > 0 ? defaultPrice.toFixed(2) : "";
                    };

                    const deleteTxn = (id: string) => {
                      setPositions(prev => {
                        const updated = (prev[selectedWatch] || []).filter(t => t.id !== id);
                        return { ...prev, [selectedWatch]: updated };
                      });
                    };

                    const buyTxns = txns.filter(t => t.type === "buy");
                    const sellTxns = txns.filter(t => t.type === "sell");
                    const totalBuyQty = buyTxns.reduce((s, t) => s + t.quantity, 0);
                    const totalSellQty = sellTxns.reduce((s, t) => s + t.quantity, 0);
                    const totalBuyCost = buyTxns.reduce((s, t) => s + t.quantity * t.price, 0);
                    const totalSellProceeds = sellTxns.reduce((s, t) => s + t.quantity * t.price, 0);
                    const avgBuyPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
                    const netShares = totalBuyQty - totalSellQty;
                    const currentValue = netShares * (md?.price ?? 0);
                    const costBasis = netShares > 0 ? netShares * avgBuyPrice : 0;
                    const unrealizedPnl = currentValue - costBasis;
                    const unrealizedPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
                    const realizedPnl = totalSellProceeds - (totalSellQty > 0 ? totalSellQty * avgBuyPrice : 0);
                    const totalPnl = unrealizedPnl + realizedPnl;

                    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

                    return (
                      <div className="space-y-3 p-1">
                        {/* ── Summary Cards ── */}
                        {txns.length > 0 && (
                          <div className="grid grid-cols-4 gap-2">
                            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-2.5">
                              <div className="text-[8px] text-[#484f58] uppercase tracking-widest font-semibold mb-1">Shares</div>
                              <div className={`text-sm font-bold tabular-nums ${netShares > 0 ? "text-[#f0f6fc]" : netShares < 0 ? "text-[#f85149]" : "text-[#484f58]"}`}>{netShares.toLocaleString()}</div>
                              <div className="text-[9px] text-[#484f58] tabular-nums mt-0.5">{Math.floor(netShares / 100)} lots</div>
                            </div>
                            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-2.5">
                              <div className="text-[8px] text-[#484f58] uppercase tracking-widest font-semibold mb-1">Avg Cost</div>
                              <div className="text-sm font-bold text-[#f0f6fc] tabular-nums">{avgBuyPrice > 0 ? `$${avgBuyPrice.toFixed(2)}` : "—"}</div>
                              <div className="text-[9px] text-[#484f58] tabular-nums mt-0.5">Basis ${costBasis.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                            </div>
                            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-2.5">
                              <div className="text-[8px] text-[#484f58] uppercase tracking-widest font-semibold mb-1">Mkt Value</div>
                              <div className="text-sm font-bold text-[#f0f6fc] tabular-nums">${currentValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                              <div className="text-[9px] text-[#484f58] tabular-nums mt-0.5">@ ${md?.price?.toFixed(2) ?? "—"}</div>
                            </div>
                            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-2.5">
                              <div className="text-[8px] text-[#484f58] uppercase tracking-widest font-semibold mb-1">Total P&L</div>
                              <div className={`text-sm font-bold tabular-nums ${totalPnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                              <div className="flex gap-2 mt-0.5">
                                <span className={`text-[8px] tabular-nums ${unrealizedPnl >= 0 ? "text-[#3fb950]/70" : "text-[#f85149]/70"}`}>Unrl {unrealizedPnl >= 0 ? "+" : ""}{unrealizedPct.toFixed(1)}%</span>
                                <span className={`text-[8px] tabular-nums ${realizedPnl >= 0 ? "text-[#3fb950]/70" : "text-[#f85149]/70"}`}>Rlzd {realizedPnl >= 0 ? "+" : ""}${realizedPnl.toFixed(0)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ── Inline Add Form ── */}
                        <form onSubmit={addTxn} className="border border-[#21262d] rounded-lg overflow-hidden">
                          <div className="bg-[#161b22] px-3 py-1.5 border-b border-[#21262d] flex items-center justify-between">
                            <span className="text-[9px] text-[#484f58] uppercase tracking-widest font-bold">New Transaction</span>
                          </div>
                          <div className="flex items-end gap-1.5 px-2.5 py-2 bg-[#0d1117]">
                            <div className="flex-none w-16">
                              <label className="text-[8px] text-[#484f58] uppercase tracking-wide block mb-0.5">Type</label>
                              <select
                                name="type"
                                defaultValue=""
                                className="w-full rounded border border-[#30363d] bg-[#161b22] text-[10px] text-[#c9d1d9] px-1.5 py-1 focus:outline-none focus:border-[#58a6ff]"
                                required
                              >
                                <option value="" disabled>—</option>
                                <option value="buy">Buy</option>
                                <option value="sell">Sell</option>
                              </select>
                            </div>
                            <div className="flex-1 min-w-0">
                              <label className="text-[8px] text-[#484f58] uppercase tracking-wide block mb-0.5">Date</label>
                              <input
                                name="date"
                                type="date"
                                defaultValue={today}
                                className="w-full rounded border border-[#30363d] bg-[#161b22] text-[10px] text-[#c9d1d9] px-1.5 py-1 focus:outline-none focus:border-[#58a6ff]"
                              />
                            </div>
                            <div className="flex-none w-16">
                              <label className="text-[8px] text-[#484f58] uppercase tracking-wide block mb-0.5">Qty</label>
                              <input
                                name="quantity"
                                type="number"
                                min="0.01"
                                step="0.01"
                                placeholder="0"
                                required
                                className="w-full rounded border border-[#30363d] bg-[#161b22] text-[10px] text-[#c9d1d9] px-1.5 py-1 tabular-nums focus:outline-none focus:border-[#58a6ff]"
                              />
                            </div>
                            <div className="flex-none w-20">
                              <label className="text-[8px] text-[#484f58] uppercase tracking-wide block mb-0.5">Price</label>
                              <input
                                name="price"
                                type="number"
                                min="0.01"
                                step="0.01"
                                defaultValue={defaultPrice > 0 ? defaultPrice.toFixed(2) : ""}
                                placeholder="$0.00"
                                required
                                className="w-full rounded border border-[#30363d] bg-[#161b22] text-[10px] text-[#c9d1d9] px-1.5 py-1 tabular-nums focus:outline-none focus:border-[#58a6ff]"
                              />
                            </div>
                            <button
                              type="submit"
                              className="flex-none px-3 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[10px] font-semibold text-[#c9d1d9] transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        </form>

                        {/* ── Transactions Ledger ── */}
                        {txns.length > 0 ? (
                          <div className="border border-[#21262d] rounded-lg overflow-hidden">
                            <div className="bg-[#161b22] px-3 py-1.5 border-b border-[#21262d] flex items-center justify-between">
                              <span className="text-[9px] text-[#484f58] uppercase tracking-widest font-bold">Transactions</span>
                              <span className="text-[9px] text-[#30363d]">{txns.length} entries</span>
                            </div>
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="bg-[#0d1117]/60 text-[#484f58]">
                                  <th className="px-2.5 py-1.5 text-left font-medium w-12"></th>
                                  <th className="px-2.5 py-1.5 text-left font-medium">Date</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Shares</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Price</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Total</th>
                                  <th className="w-7 px-1 py-1.5"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {sorted.map((t) => {
                                  const isBuy = t.type === "buy";
                                  return (
                                    <tr key={t.id} className="border-t border-[#21262d]/40 hover:bg-[#161b22]/60 transition-colors group">
                                      <td className="px-2.5 py-1.5">
                                        <span className={`inline-flex items-center justify-center w-10 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                                          isBuy ? "bg-[#238636]/15 text-[#3fb950]" : "bg-[#da3633]/15 text-[#f85149]"
                                        }`}>
                                          {t.type}
                                        </span>
                                      </td>
                                      <td className="px-2.5 py-1.5 text-[#8b949e] tabular-nums">{t.date}</td>
                                      <td className={`px-2.5 py-1.5 text-right tabular-nums font-medium ${isBuy ? "text-[#3fb950]" : "text-[#f85149]"}`}>{isBuy ? "+" : "-"}{t.quantity}</td>
                                      <td className="px-2.5 py-1.5 text-right text-[#c9d1d9] tabular-nums">${t.price.toFixed(2)}</td>
                                      <td className={`px-2.5 py-1.5 text-right tabular-nums font-semibold ${isBuy ? "text-[#f85149]" : "text-[#3fb950]"}`}>{isBuy ? "-" : "+"}${(t.quantity * t.price).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                      <td className="px-1 py-1.5 text-center">
                                        <button
                                          onClick={() => deleteTxn(t.id)}
                                          className="opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-[#f85149] transition-all p-0.5"
                                          title="Delete"
                                        >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-[#30363d] bg-[#161b22]/80">
                                  <td className="px-2.5 py-2 text-[9px] font-bold text-[#8b949e] uppercase" colSpan={2}>Net Position</td>
                                  <td className={`px-2.5 py-2 text-right tabular-nums font-bold ${netShares > 0 ? "text-[#f0f6fc]" : netShares < 0 ? "text-[#f85149]" : "text-[#484f58]"}`}>{netShares}</td>
                                  <td className="px-2.5 py-2 text-right text-[#8b949e] tabular-nums">{avgBuyPrice > 0 ? `$${avgBuyPrice.toFixed(2)}` : "—"}</td>
                                  <td className={`px-2.5 py-2 text-right tabular-nums font-bold ${unrealizedPnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                                    {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1.5 py-10 border border-[#21262d] rounded-lg bg-[#161b22]/30">
                            <svg className="w-6 h-6 text-[#30363d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                            </svg>
                            <p className="text-[10px] text-[#484f58]">No transactions for {selectedWatch}</p>
                            <p className="text-[9px] text-[#30363d]">Add a buy or sell above to start tracking</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Option tab ── */}
                  {watchDetailTab === "option" && (() => {
                    return (
                      <div className="flex flex-col h-full min-h-0">
                        {/* Sub-tabs */}
                        <div className="tab-group mb-3">
                          {([{ key: "chain" as const, label: "Chain" }, { key: "recommendation" as const, label: "Recommendation" }]).map(({ key, label }) => (
                            <button
                              key={key}
                              onClick={() => setWatchOptionsSubTab(key)}
                              className={`tab-btn ${
                                watchOptionsSubTab === key
                                  ? "bg-[#30363d] text-[#c9d1d9]"
                                  : "text-[#8b949e] hover:text-[#c9d1d9]"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* Chain sub-tab */}
                        {watchOptionsSubTab === "chain" && (() => {
                    if (watchOptionsLoading) {
                      return (
                        <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                          <div className="w-10 h-10 rounded-full border-2 border-[#30363d] border-t-[#d29922] animate-spin" />
                          <p className="text-xs text-[#8b949e] font-medium">Loading options chain…</p>
                        </div>
                      );
                    }
                    if (!watchOptions || watchOptions.contracts.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                          <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                            </svg>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-medium text-[#8b949e]">No options data</p>
                            <p className="text-[10px] text-[#484f58] mt-0.5">Options chain not available for {selectedWatch}</p>
                          </div>
                        </div>
                      );
                    }
                    // Group by expiration
                    const byExp: Record<string, typeof watchOptions.contracts> = {};
                    for (const c of watchOptions.contracts) {
                      (byExp[c.expiration] ??= []).push(c);
                    }
                    const expirations = Object.keys(byExp).sort();
                    const activeExp = watchOptionsExp && expirations.includes(watchOptionsExp) ? watchOptionsExp : expirations[0] ?? null;
                    const activeContracts = activeExp ? byExp[activeExp] : [];
                    const calls = activeContracts.filter(c => c.option_type === "CALL").sort((a, b) => a.strike - b.strike);
                    const puts = activeContracts.filter(c => c.option_type === "PUT").sort((a, b) => a.strike - b.strike);
                    return (
                      <div className="flex gap-3 h-full min-h-0">
                        {/* Left: Expiration selector */}
                        <div className="w-32 shrink-0 rounded border border-[#21262d] overflow-hidden flex flex-col bg-[#0d1117]">
                          <div className="px-3 py-2 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-[#c9d1d9] uppercase tracking-wide">Expirations</span>
                            <span className="text-[9px] text-[#484f58] bg-[#21262d] px-1.5 py-0.5 rounded-full tabular-nums">{expirations.length}</span>
                          </div>
                          <div className="flex-1 overflow-y-auto">
                            {expirations.map((exp) => {
                              const dte = byExp[exp][0]?.dte ?? 0;
                              const count = byExp[exp].length;
                              const isActive = exp === activeExp;
                              return (
                                <div
                                  key={exp}
                                  onClick={() => setWatchOptionsExp(exp)}
                                  className={`px-3 py-2 cursor-pointer transition-colors border-b border-[#21262d]/30 border-l-2 ${
                                    isActive
                                      ? "bg-[#161b22] border-l-[#58a6ff]"
                                      : "border-l-transparent hover:bg-[#161b22]/50"
                                  }`}
                                >
                                  <div className={`text-[11px] font-medium tabular-nums ${isActive ? "text-[#f0f6fc]" : "text-[#c9d1d9]"}`}>{exp}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[9px] tabular-nums ${isActive ? "text-[#d29922]" : "text-[#484f58]"}`}>{dte}d</span>
                                    <span className="text-[9px] text-[#484f58]">{count} contracts</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Right: Option chain */}
                        <div className="flex-1 min-w-0 rounded border border-[#21262d] overflow-hidden flex flex-col bg-[#0d1117]">
                          {activeExp ? (
                            <>
                              <div className="px-3 py-2 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-semibold text-[#f0f6fc] tabular-nums">{activeExp}</span>
                                  <span className="text-[9px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded font-medium tabular-nums">{activeContracts[0]?.dte ?? "—"} DTE</span>
                                </div>
                                <div className="flex items-center gap-3 text-[9px] text-[#484f58]">
                                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]"></span>{calls.length} calls</span>
                                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#f85149]"></span>{puts.length} puts</span>
                                  <span className="text-[#8b949e] font-medium tabular-nums">${watchOptions.underlying_price.toFixed(2)}</span>
                                </div>
                              </div>
                              <div className="flex-1 overflow-auto" ref={optionsChainRef}>
                                {(() => {
                                  const price = watchOptions.underlying_price;
                                  const callMap = new Map(calls.map(c => [c.strike, c]));
                                  const putMap = new Map(puts.map(c => [c.strike, c]));
                                  const allStrikes = [...new Set([...calls.map(c => c.strike), ...puts.map(c => c.strike)])].sort((a, b) => a - b);
                                  let priceIdx = allStrikes.findIndex(s => s >= price);
                                  if (priceIdx === -1) priceIdx = allStrikes.length;
                                  return (
                                    <table className="w-full text-[10px] border-collapse table-fixed">
                                      <colgroup>
                                        <col className="w-[3%]" />{/* + Call */}
                                        <col className="w-[9%]" />{/* OI */}
                                        <col className="w-[7%]" />{/* Vol */}
                                        <col className="w-[7%]" />{/* IV */}
                                        <col className="w-[9%]" />{/* Bid */}
                                        <col className="w-[9%]" />{/* Ask */}
                                        <col className="w-[10%]" />{/* Strike */}
                                        <col className="w-[9%]" />{/* Bid */}
                                        <col className="w-[9%]" />{/* Ask */}
                                        <col className="w-[7%]" />{/* IV */}
                                        <col className="w-[7%]" />{/* Vol */}
                                        <col className="w-[9%]" />{/* OI */}
                                        <col className="w-[3%]" />{/* + Put */}
                                      </colgroup>
                                      <thead className="sticky top-0 z-10">
                                        <tr className="bg-[#161b22]">
                                          <th className="px-1 py-1.5 border-b border-[#21262d]"></th>
                                          <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">OI</th>
                                          <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">Vol</th>
                                          <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">IV</th>
                                          <th className="px-2 py-1.5 text-right text-[#3fb950]/70 font-semibold border-b border-[#21262d]">Bid</th>
                                          <th className="px-2 py-1.5 text-right text-[#3fb950]/70 font-semibold border-b border-r border-[#21262d]">Ask</th>
                                          <th className="px-2 py-1.5 text-center text-[#c9d1d9] font-bold border-b border-r border-[#21262d] bg-[#161b22]">Strike</th>
                                          <th className="px-2 py-1.5 text-right text-[#f85149]/70 font-semibold border-b border-[#21262d]">Bid</th>
                                          <th className="px-2 py-1.5 text-right text-[#f85149]/70 font-semibold border-b border-[#21262d]">Ask</th>
                                          <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">IV</th>
                                          <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">Vol</th>
                                          <th className="px-2 py-1.5 text-right text-[#484f58] font-medium border-b border-[#21262d]">OI</th>
                                          <th className="px-1 py-1.5 border-b border-[#21262d]"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {allStrikes.map((strike, i) => {
                                          const call = callMap.get(strike);
                                          const put = putMap.get(strike);
                                          const callItm = strike < price;
                                          const putItm = strike > price;
                                          const atm = !callItm && !putItm && Math.abs(strike - price) === Math.min(...allStrikes.map(s => Math.abs(s - price)));
                                          const rows: React.ReactNode[] = [];
                                          if (i === priceIdx) {
                                            rows.push(
                                              <tr key="price-divider" ref={optionsPriceDividerRef}>
                                                <td colSpan={13} className="h-0 p-0 relative">
                                                  <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#d29922]/40"></div>
                                                  <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0d1117] px-2 py-0.5 rounded-full border border-[#d29922]/30 text-[9px] font-bold text-[#d29922] tabular-nums whitespace-nowrap">
                                                    ${price.toFixed(2)}
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          }
                                          rows.push(
                                            <tr
                                              key={strike}
                                              className={`border-b border-[#21262d]/20 transition-colors hover:bg-[#161b22]/60 ${
                                                atm ? "bg-[#d29922]/[0.03]" : callItm ? "bg-[#3fb950]/[0.03]" : putItm ? "bg-[#f85149]/[0.03]" : ""
                                              }`}
                                            >
                                              {call ? (<>
                                                <td className="px-0.5 py-1 text-center">
                                                  <button
                                                    onClick={() => addOrder({ ticker: call.ticker, option_type: "CALL", leg: "CC", strike: call.strike, expiration: call.expiration, contracts: 1, premium: (call.bid + call.ask) / 2 })}
                                                    className="w-5 h-5 rounded bg-[#3fb950]/10 hover:bg-[#3fb950]/25 text-[#3fb950] text-[10px] font-bold transition-colors" title="Create call contract"
                                                  >+</button>
                                                </td>
                                                <td className="px-2 py-1 text-right text-[#484f58] tabular-nums">{call.open_interest.toLocaleString()}</td>
                                                <td className="px-2 py-1 text-right text-[#484f58] tabular-nums">{call.volume?.toLocaleString() ?? "—"}</td>
                                                <td className="px-2 py-1 text-right text-[#6e7681] tabular-nums">{(call.implied_volatility * 100).toFixed(0)}%</td>
                                                <td className={`px-2 py-1 text-right tabular-nums font-medium ${callItm ? "text-[#f0f6fc]" : "text-[#8b949e]"}`}>{call.bid.toFixed(2)}</td>
                                                <td className={`px-2 py-1 text-right tabular-nums font-medium border-r border-[#21262d] ${callItm ? "text-[#f0f6fc]" : "text-[#8b949e]"}`}>{call.ask.toFixed(2)}</td>
                                              </>) : (
                                                <td colSpan={6} className="border-r border-[#21262d]"></td>
                                              )}
                                              <td className={`px-2 py-1 text-center font-bold tabular-nums border-r border-[#21262d] ${atm ? "text-[#d29922]" : "text-[#c9d1d9]"}`}>
                                                {strike.toFixed(1)}
                                              </td>
                                              {put ? (<>
                                                <td className={`px-2 py-1 text-right tabular-nums font-medium ${putItm ? "text-[#f0f6fc]" : "text-[#8b949e]"}`}>{put.bid.toFixed(2)}</td>
                                                <td className={`px-2 py-1 text-right tabular-nums font-medium ${putItm ? "text-[#f0f6fc]" : "text-[#8b949e]"}`}>{put.ask.toFixed(2)}</td>
                                                <td className="px-2 py-1 text-right text-[#6e7681] tabular-nums">{(put.implied_volatility * 100).toFixed(0)}%</td>
                                                <td className="px-2 py-1 text-right text-[#484f58] tabular-nums">{put.volume?.toLocaleString() ?? "—"}</td>
                                                <td className="px-2 py-1 text-right text-[#484f58] tabular-nums">{put.open_interest.toLocaleString()}</td>
                                                <td className="px-0.5 py-1 text-center">
                                                  <button
                                                    onClick={() => addOrder({ ticker: put.ticker, option_type: "PUT", leg: "CSP", strike: put.strike, expiration: put.expiration, contracts: 1, premium: (put.bid + put.ask) / 2 })}
                                                    className="w-5 h-5 rounded bg-[#f85149]/10 hover:bg-[#f85149]/25 text-[#f85149] text-[10px] font-bold transition-colors" title="Create put contract"
                                                  >+</button>
                                                </td>
                                              </>) : (
                                                <td colSpan={6}></td>
                                              )}
                                            </tr>
                                          );
                                          return rows;
                                        })}
                                        {priceIdx === allStrikes.length && (
                                          <tr>
                                            <td colSpan={13} className="h-0 p-0 relative">
                                              <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#d29922]/40"></div>
                                              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0d1117] px-2 py-0.5 rounded-full border border-[#d29922]/30 text-[9px] font-bold text-[#d29922] tabular-nums whitespace-nowrap">
                                                ${watchOptions.underlying_price.toFixed(2)}
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  );
                                })()}
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center justify-center h-full text-[11px] text-[#484f58]">Select an expiration date</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                        {/* Recommendation sub-tab */}
                        {watchOptionsSubTab === "recommendation" && (() => {
                          const ticker = selectedWatch;
                          // Derive shares from Position tab transactions
                          const tickerPositions = ticker ? (positions[ticker] || []) : [];
                          const netShares = tickerPositions.reduce((sum, t) => sum + (t.type === "buy" ? t.quantity : -t.quantity), 0);
                          const avgCost = (() => {
                            let totalQty = 0, totalCost = 0;
                            for (const t of tickerPositions) {
                              if (t.type === "buy") { totalQty += t.quantity; totalCost += t.quantity * t.price; }
                            }
                            return totalQty > 0 ? totalCost / totalQty : 0;
                          })();
                          const positionHoldings = ticker && netShares > 0 ? [{
                            id: crypto.randomUUID(),
                            ticker,
                            shares: netShares,
                            cost_basis: avgCost,
                            current_price: watchBatch.market_data[ticker]?.price ?? 0,
                          }] : [];
                          const runRecs = async (dteMin: number, dteMax: number, minOi: number, assignPct: number) => {
                            if (!ticker) return;
                            setWatchRecsLoading(true);
                            try {
                              const result = await getRecommendations({
                                inventory: positionHoldings.length > 0 ? { holdings: positionHoldings } : undefined,
                                tickers: [ticker],
                                available_cash: netShares < 100 ? 100000 : undefined,
                                dte_min: dteMin,
                                dte_max: dteMax,
                                min_open_interest: minOi,
                                cc_max_assignment_pct: assignPct / 100,
                                csp_max_assignment_pct: assignPct / 100,
                                earnings_calendar: watchBatch.earnings_calendar[ticker] || undefined,
                                analyst_trends: watchBatch.analyst_trends[ticker] ? [watchBatch.analyst_trends[ticker] as unknown as AnalystTrend].flat() : undefined,
                              });
                              setWatchRecs(result.recommendations ?? []);
                            } catch {
                              setWatchRecs([]);
                            } finally {
                              setWatchRecsLoading(false);
                            }
                          };
                          const ccRecs = watchRecs.filter(r => r.leg === "covered_call");
                          const cspRecs = watchRecs.filter(r => r.leg === "cash_secured_put");
                          return (
                            <div className="flex flex-col h-full min-h-0">
                              {/* Filter bar */}
                              <form
                                className="flex items-end gap-3 pb-3 border-b border-[#21262d] mb-3 shrink-0"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const fd = new FormData(e.currentTarget);
                                  runRecs(
                                    parseInt(fd.get("dte_min") as string) || 14,
                                    parseInt(fd.get("dte_max") as string) || 45,
                                    parseInt(fd.get("min_oi") as string) || 100,
                                    parseInt(fd.get("assign_pct") as string) || 30,
                                  );
                                }}
                              >
                                <div>
                                  <label className="block text-[9px] text-[#484f58] uppercase tracking-wider mb-1">DTE Min</label>
                                  <input name="dte_min" type="number" defaultValue={14} className="w-16 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] tabular-nums focus:outline-none focus:border-[#58a6ff]" />
                                </div>
                                <div>
                                  <label className="block text-[9px] text-[#484f58] uppercase tracking-wider mb-1">DTE Max</label>
                                  <input name="dte_max" type="number" defaultValue={45} className="w-16 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] tabular-nums focus:outline-none focus:border-[#58a6ff]" />
                                </div>
                                <div>
                                  <label className="block text-[9px] text-[#484f58] uppercase tracking-wider mb-1">Min OI</label>
                                  <input name="min_oi" type="number" defaultValue={100} className="w-20 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] tabular-nums focus:outline-none focus:border-[#58a6ff]" />
                                </div>
                                <div>
                                  <label className="block text-[9px] text-[#484f58] uppercase tracking-wider mb-1">Max Assign %</label>
                                  <input name="assign_pct" type="number" defaultValue={30} min={1} max={100} className="w-16 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] tabular-nums focus:outline-none focus:border-[#58a6ff]" />
                                </div>
                                <button
                                  type="submit"
                                  disabled={watchRecsLoading}
                                  className="px-3 py-1 text-[11px] font-medium rounded bg-[#238636] text-white hover:bg-[#2ea043] transition-colors disabled:opacity-50"
                                >
                                  {watchRecsLoading ? "Running…" : "Generate"}
                                </button>
                              </form>

                              {/* Results */}
                              <div className="flex-1 overflow-y-auto">
                                {watchRecsLoading ? (
                                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <div className="w-8 h-8 rounded-full border-2 border-[#30363d] border-t-[#d29922] animate-spin" />
                                    <p className="text-[11px] text-[#8b949e]">Analyzing {ticker}…</p>
                                  </div>
                                ) : watchRecs.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                                    <p className="text-[11px] text-[#484f58]">Click Generate to find optimal trades for {ticker}</p>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    {/* Unified recommendations table */}
                                    <div className="border border-[#21262d] rounded overflow-hidden">
                                      <table className="w-full text-[10px]">
                                        <thead>
                                          <tr className="bg-[#161b22] text-[#484f58]">
                                            <th className="px-2 py-1.5 text-left font-medium">Type</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Contracts</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Strike</th>
                                            <th className="px-2 py-1.5 text-right font-medium">OTM %</th>
                                            <th className="px-2 py-1.5 text-right font-medium">DTE</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Delta</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Bid</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Mid</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Premium</th>
                                            <th className="px-2 py-1.5 text-right font-medium">IV</th>
                                            <th className="px-2 py-1.5 text-right font-medium">ROC</th>
                                            <th className="px-2 py-1.5 text-right font-medium">Quality</th>
                                            <th className="px-2 py-1.5 text-right font-medium">OI</th>
                                            <th className="w-8 px-1 py-1.5"></th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {/* CC section */}
                                          {ccRecs.length > 0 && (
                                            <tr className="bg-[#58a6ff]/5">
                                              <td colSpan={14} className="px-2 py-1 text-[9px] font-bold text-[#58a6ff] uppercase tracking-widest">
                                                Covered Calls — {ccRecs.reduce((s, r) => s + (r.contracts_allocated ?? 1), 0)} contracts · {ccRecs.reduce((s, r) => s + (r.contracts_allocated ?? 1), 0) * 100} shares
                                              </td>
                                            </tr>
                                          )}
                                          {ccRecs.map((r, i) => {
                                            const contracts = r.contracts_allocated ?? 1;
                                            const mid = (r.contract.bid + r.contract.ask) / 2;
                                            const otm = ((r.contract.strike - r.contract.underlying_price) / r.contract.underlying_price) * 100;
                                            const label = Math.abs(r.contract.delta) <= 0.24 ? "Consrv" : Math.abs(r.contract.delta) >= 0.29 ? "Aggrss" : "Modrt";
                                            return (
                                              <tr key={`cc-${i}`} className="border-t border-[#21262d]/30 hover:bg-[#161b22]/60 transition-colors">
                                                <td className="px-2 py-1.5 font-medium">
                                                  <span className="text-[#58a6ff]">CC</span>
                                                  {ccRecs.length > 1 && <span className="text-[#484f58] ml-1 text-[9px]">{label}</span>}
                                                  {r.earnings_warning && <span className="ml-1 text-[#d29922]" title="Earnings warning">⚠</span>}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-[#c9d1d9] tabular-nums">{contracts}</td>
                                                <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">${r.contract.strike.toFixed(1)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{otm.toFixed(1)}%</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.dte}d</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.delta.toFixed(2)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.bid.toFixed(2)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">{mid.toFixed(2)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#3fb950] font-semibold tabular-nums">${(mid * contracts * 100).toFixed(0)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{(r.contract.implied_volatility * 100).toFixed(0)}%</td>
                                                <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${r.annualised_roc >= 20 ? "text-[#3fb950]" : r.annualised_roc >= 12 ? "text-[#d29922]" : "text-[#8b949e]"}`}>{r.annualised_roc.toFixed(1)}%</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums">
                                                  <span className={`inline-block w-10 text-center px-1 py-0.5 rounded text-[9px] font-bold ${r.quality_score >= 70 ? "bg-[#3fb950]/15 text-[#3fb950]" : r.quality_score >= 40 ? "bg-[#d29922]/15 text-[#d29922]" : "bg-[#21262d] text-[#484f58]"}`}>
                                                    {r.quality_score.toFixed(0)}
                                                  </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-[#484f58] tabular-nums">{r.contract.open_interest.toLocaleString()}</td>
                                                <td className="px-1 py-1.5 text-center">
                                                  <button
                                                    onClick={() => addOrder({ ticker: r.contract.ticker, option_type: "CALL", leg: "CC", strike: r.contract.strike, expiration: r.contract.expiration, contracts, premium: (r.contract.bid + r.contract.ask) / 2 })}
                                                    className="w-5 h-5 rounded bg-[#3fb950]/10 hover:bg-[#3fb950]/25 text-[#3fb950] text-[10px] font-bold transition-colors" title="Create contract"
                                                  >+</button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                          {/* CSP section */}
                                          {cspRecs.length > 0 && (
                                            <tr className={`bg-[#d29922]/5 ${ccRecs.length > 0 ? "border-t-2 border-[#21262d]" : ""}`}>
                                              <td colSpan={14} className="px-2 py-1 text-[9px] font-bold text-[#d29922] uppercase tracking-widest">
                                                Cash-Secured Puts — {cspRecs.length} trades
                                              </td>
                                            </tr>
                                          )}
                                          {cspRecs.map((r, i) => {
                                            const mid = (r.contract.bid + r.contract.ask) / 2;
                                            const otm = ((r.contract.underlying_price - r.contract.strike) / r.contract.underlying_price) * 100;
                                            return (
                                              <tr key={`csp-${i}`} className="border-t border-[#21262d]/30 hover:bg-[#161b22]/60 transition-colors">
                                                <td className="px-2 py-1.5 font-medium">
                                                  <span className="text-[#d29922]">CSP</span>
                                                  {r.earnings_warning && <span className="ml-1 text-[#d29922]" title="Earnings warning">⚠</span>}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-[#c9d1d9] tabular-nums">1</td>
                                                <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">${r.contract.strike.toFixed(1)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{otm.toFixed(1)}%</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.dte}d</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.delta.toFixed(2)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{r.contract.bid.toFixed(2)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">{mid.toFixed(2)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#3fb950] font-semibold tabular-nums">${(mid * 100).toFixed(0)}</td>
                                                <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{(r.contract.implied_volatility * 100).toFixed(0)}%</td>
                                                <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${r.annualised_roc >= 20 ? "text-[#3fb950]" : r.annualised_roc >= 12 ? "text-[#d29922]" : "text-[#8b949e]"}`}>{r.annualised_roc.toFixed(1)}%</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums">
                                                  <span className={`inline-block w-10 text-center px-1 py-0.5 rounded text-[9px] font-bold ${r.quality_score >= 70 ? "bg-[#3fb950]/15 text-[#3fb950]" : r.quality_score >= 40 ? "bg-[#d29922]/15 text-[#d29922]" : "bg-[#21262d] text-[#484f58]"}`}>
                                                    {r.quality_score.toFixed(0)}
                                                  </span>
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-[#484f58] tabular-nums">{r.contract.open_interest.toLocaleString()}</td>
                                                <td className="px-1 py-1.5 text-center">
                                                  <button
                                                    onClick={() => addOrder({ ticker: r.contract.ticker, option_type: "PUT", leg: "CSP", strike: r.contract.strike, expiration: r.contract.expiration, contracts: 1, premium: mid })}
                                                    className="w-5 h-5 rounded bg-[#d29922]/10 hover:bg-[#d29922]/25 text-[#d29922] text-[10px] font-bold transition-colors" title="Create contract"
                                                  >+</button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* ── Order tab ── */}
                  {watchDetailTab === "order" && (() => {
                    const tickerOrders = orders.filter(o => o.ticker === selectedWatch && o.status !== "closed");
                    const currentPrice = selectedWatch ? watchBatch.market_data[selectedWatch]?.price ?? 0 : 0;
                    return (
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest">Contracts</span>
                          <span className="text-[9px] text-[#484f58]">{tickerOrders.length} orders</span>
                        </div>
                        {tickerOrders.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-12">
                            <p className="text-[11px] text-[#484f58]">No contracts yet</p>
                            <p className="text-[9px] text-[#30363d]">Use + buttons on Chain or Recommendation tabs</p>
                          </div>
                        ) : (
                          <div className="border border-[#21262d] rounded overflow-hidden">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="bg-[#161b22] text-[#484f58]">
                                  <th className="px-2 py-1.5 text-left font-medium">Type</th>
                                  <th className="px-2 py-1.5 text-right font-medium">Strike</th>
                                  <th className="px-2 py-1.5 text-right font-medium">Exp</th>
                                  <th className="px-2 py-1.5 text-right font-medium">DTE</th>
                                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                                  <th className="px-2 py-1.5 text-right font-medium">Premium</th>
                                  <th className="px-2 py-1.5 text-right font-medium">Intrinsic</th>
                                  <th className="px-2 py-1.5 text-center font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tickerOrders.map(o => {
                                  const dte = Math.max(0, Math.ceil((new Date(o.expiration + "T00:00:00").getTime() - Date.now()) / 86400000));
                                  const intrinsic = o.option_type === "CALL"
                                    ? Math.max(0, currentPrice - o.strike)
                                    : Math.max(0, o.strike - currentPrice);
                                  return (
                                    <tr key={o.id} className="border-t border-[#21262d]/30 hover:bg-[#161b22]/60 transition-colors">
                                      <td className="px-2 py-1.5 font-medium">
                                        <span className={o.leg === "CC" ? "text-[#58a6ff]" : "text-[#d29922]"}>{o.leg}</span>
                                        <span className="text-[#484f58] ml-1 text-[9px]">{o.option_type}</span>
                                      </td>
                                      <td className="px-2 py-1.5 text-right text-[#f0f6fc] font-medium tabular-nums">${o.strike.toFixed(1)}</td>
                                      <td className="px-2 py-1.5 text-right text-[#8b949e] tabular-nums">{o.expiration}</td>
                                      <td className={`px-2 py-1.5 text-right tabular-nums ${dte <= 7 ? "text-[#f85149] font-semibold" : dte <= 14 ? "text-[#d29922]" : "text-[#8b949e]"}`}>{dte}d</td>
                                      <td className="px-2 py-1 text-right">
                                        <input
                                          type="number"
                                          min={1}
                                          value={o.contracts}
                                          onChange={e => {
                                            const val = Math.max(1, parseInt(e.target.value) || 1);
                                            setOrders(prev => prev.map(x => x.id === o.id ? { ...x, contracts: val } : x));
                                          }}
                                          className="w-10 bg-[#0d1117] border border-[#21262d] rounded px-1 py-0.5 text-right text-[10px] text-[#c9d1d9] tabular-nums focus:border-[#58a6ff] focus:outline-none"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5 text-right text-[#3fb950] font-semibold tabular-nums">${(o.premium * o.contracts * 100).toFixed(0)}</td>
                                      <td className={`px-2 py-1.5 text-right tabular-nums ${intrinsic > 0 ? "text-[#f85149] font-semibold" : "text-[#484f58]"}`}>
                                        {intrinsic > 0 ? `$${intrinsic.toFixed(2)}` : "OTM"}
                                      </td>
                                      <td className="px-2 py-1.5 text-center">
                                        <select
                                          value={o.status}
                                          onChange={e => {
                                            if (e.target.value === "closed" && o.status === "open") {
                                              e.target.value = "open";
                                              openCloseModal(o);
                                            }
                                          }}
                                          className={`rounded border border-[#21262d] bg-[#0d1117] text-[9px] font-bold px-1 py-0.5 focus:outline-none focus:border-[#58a6ff] cursor-pointer ${
                                            o.status === "open" ? "text-[#58a6ff]" : "text-[#484f58]"
                                          }`}
                                        >
                                          <option value="open">Open</option>
                                          <option value="closed">Closed</option>
                                        </select>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Close Order Modal ── */}
      {closingOrder && (
        <CloseContractModal
          order={closingOrder}
          onConfirm={confirmCloseOrder}
          onCancel={() => setClosingOrder(null)}
        />
      )}
    </div>
  );
}
