"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { DiscoveryItem, FinancialHealth, AnalystTrend, SearchResult, StockMarketData, OptionsChain, EarningsCalendar, EarningsResult, WheelRecommendation, PositionTransaction, OptionsOrder, EmaPullbackSignal } from "@/lib/types";
import { getDiscovery, getBatchData, prefetchDiscovery, searchTickers, getOptionsChains, getMarketData, getRecommendations, getTechnicals } from "@/lib/api";
import { healthScoreColor } from "@/lib/format";
import { useLocalStorageState } from "@/lib/hooks";
import TickerLink from "./TickerLink";
import CloseContractModal from "./CloseContractModal";
import { useHealthPopup } from "./HealthPopupContext";

type SortField = "rank" | "ticker" | "price" | "health" | "rating";
type WatchSortField = "ticker" | "price" | "health" | "name" | "sector" | "analyst" | "positions";
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
  const { openHealthPopup } = useHealthPopup();
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
  const [leftTab, setLeftTab] = useState<"screeners" | "search" | "watchlist" | "signals">("watchlist");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Signals scan state ──
  const [signalResults, setSignalResults] = useState<EmaPullbackSignal[]>([]);
  const [signalLoading, setSignalLoading] = useState(false);
  const [signalScanned, setSignalScanned] = useState(false);
  const [signalSort, setSignalSort] = useState<{ field: "ticker" | "price" | "health" | "chains" | "analyst"; dir: SortDir }>({ field: "ticker", dir: "asc" });
  const [signalHealth, setSignalHealth] = useState<Record<string, FinancialHealth>>({});
  const [signalChains, setSignalChains] = useState<Record<string, number>>({});
  const [signalAnalyst, setSignalAnalyst] = useState<Record<string, AnalystTrend>>({});

  // ── Watchlist state ──
  const [watchlist, setWatchlist] = useLocalStorageState<string[]>("watchlist", []);
  const [watchInput, setWatchInput] = useState("");
  const [selectedWatch, setSelectedWatch] = useState<string | null>(null);
  const [watchSortField, setWatchSortField] = useState<WatchSortField>("ticker");
  const [watchSortDir, setWatchSortDir] = useState<SortDir>("asc");
  const [watchRefreshKey, setWatchRefreshKey] = useState(0);
  const [watchDetailTab, setWatchDetailTab] = useState<"position" | "option" | "order" | "technicals">("position");
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
  const [watchTechnicals, setWatchTechnicals] = useState<EmaPullbackSignal | null>(null);
  const [watchTechnicalsLoading, setWatchTechnicalsLoading] = useState(false);
  const optionsChainRef = useRef<HTMLDivElement>(null);
  const optionsPriceDividerRef = useRef<HTMLTableRowElement>(null);
  const activeTickerRowRef = useRef<HTMLTableRowElement>(null);

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
  }, [watchlist, watchRefreshKey]);



  // Scroll to active ticker row when expanded
  useEffect(() => {
    if (selectedWatch && activeTickerRowRef.current) {
      setTimeout(() => {
        activeTickerRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    }
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

  // Fetch technicals when selected ticker or tab changes
  useEffect(() => {
    if (!selectedWatch || watchDetailTab !== "technicals") { setWatchTechnicals(null); return; }
    setWatchTechnicalsLoading(true);
    getTechnicals([selectedWatch])
      .then((signals) => setWatchTechnicals(signals.find(s => s.ticker === selectedWatch) || null))
      .catch(() => setWatchTechnicals(null))
      .finally(() => setWatchTechnicalsLoading(false));
  }, [selectedWatch, watchDetailTab]);

  // Auto-scroll options chain to current price divider
  useEffect(() => {
    if (watchDetailTab === "option" && !watchOptionsLoading && optionsChainRef.current && optionsPriceDividerRef.current) {
      requestAnimationFrame(() => {
        const container = optionsChainRef.current;
        const divider = optionsPriceDividerRef.current;
        if (container && divider) {
          const containerRect = container.getBoundingClientRect();
          const dividerRect = divider.getBoundingClientRect();
          const offset = dividerRect.top - containerRect.top - containerRect.height / 2;
          container.scrollTop += offset;
        }
      });
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

  // ── Signals scanner: pull tickers from equity screeners, run technicals, keep 5/6+ ──
  const SIGNAL_SCREENER_IDS = [
    "most_actives", "day_gainers", "day_losers", "most_shorted_stocks",
    "bullish_stocks_right_now", "bearish_stocks_right_now", "upside_breakout_stocks_daily",
    "undervalued_large_caps", "undervalued_growth_stocks", "strong_undervalued_stocks",
  ];

  async function scanSignals() {
    setSignalLoading(true);
    setSignalResults([]);
    setSignalScanned(true);
    try {
      // Gather unique tickers from all equity screeners
      const tickerSet = new Set<string>();
      const fetches = SIGNAL_SCREENER_IDS.map(async (id) => {
        try {
          const results = await getDiscovery(id);
          results.forEach((r) => tickerSet.add(r.ticker));
        } catch { /* skip failing screener */ }
      });
      await Promise.all(fetches);

      if (tickerSet.size === 0) {
        setSignalResults([]);
        return;
      }

      // Run technicals in chunks of 20 to avoid URL length issues
      const allTickers = Array.from(tickerSet);
      const chunkSize = 20;
      const allSignals: EmaPullbackSignal[] = [];
      for (let i = 0; i < allTickers.length; i += chunkSize) {
        const chunk = allTickers.slice(i, i + chunkSize);
        try {
          const signals = await getTechnicals(chunk);
          allSignals.push(...signals);
        } catch { /* continue on error */ }
      }

      // Keep only 5/6 or 6/6 signals
      const strong = allSignals.filter((s) => s.criteria_met >= 5);
      strong.sort((a, b) => b.criteria_met - a.criteria_met || a.ticker.localeCompare(b.ticker));
      setSignalResults(strong);

      // Fetch health for signal tickers
      if (strong.length > 0) {
        getBatchData(strong.map((s) => s.ticker))
          .then((batch) => {
            setSignalHealth(batch.financials);
            // Store current-period analyst trend per ticker
            const analysts: Record<string, AnalystTrend> = {};
            Object.entries(batch.analyst_trends).forEach(([ticker, trends]) => {
              const current = trends.find(t => t.period === "0m") || trends[0];
              if (current) analysts[ticker] = current;
            });
            setSignalAnalyst(analysts);
          })
          .catch(() => {});

        // Fetch options chain counts
        getOptionsChains(strong.map((s) => s.ticker))
          .then((chains) => {
            const counts: Record<string, number> = {};
            chains.forEach((c) => { counts[c.ticker] = c.contracts.length; });
            setSignalChains(counts);
          })
          .catch(() => {});
      }
    } finally {
      setSignalLoading(false);
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
      <div className="tab-group mb-4">
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
        <button
          onClick={() => { setLeftTab("signals"); if (!signalScanned) scanSignals(); }}
          className={`tab-btn flex items-center gap-1.5 ${
            leftTab === "signals"
              ? "bg-[#30363d] text-[#c9d1d9]"
              : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
          Signals
          {signalResults.length > 0 && (
            <span className="text-[9px] bg-[#3fb950]/20 text-[#3fb950] px-1.5 py-0.5 rounded-full font-bold">{signalResults.length}</span>
          )}
        </button>
      </div>

      {/* ── Signals Tab ── */}
      {leftTab === "signals" && (
        <div className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm min-h-0">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#30363d]">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#3fb950]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
              <div>
                <h3 className="text-[11px] font-bold text-[#c9d1d9] uppercase tracking-wide">Wheel Signals</h3>
                <p className="text-[9px] text-[#484f58]">Screener tickers with 5/6+ EMA pullback criteria</p>
              </div>
            </div>
            <button
              onClick={() => scanSignals()}
              disabled={signalLoading}
              className="text-[10px] px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:bg-[#30363d] disabled:opacity-50 transition font-medium"
            >
              {signalLoading ? "Scanning…" : "Rescan"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {signalLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#30363d] border-t-[#3fb950] animate-spin" />
                <p className="text-[10px] text-[#8b949e]">Scanning screeners for strong EMA pullback setups…</p>
                <p className="text-[9px] text-[#484f58]">This may take a moment (analyzing ~200 tickers)</p>
              </div>
            ) : signalResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <svg className="w-8 h-8 text-[#30363d] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                </svg>
                <p className="text-[10px] text-[#8b949e]">No strong signals found</p>
                <p className="text-[9px] text-[#484f58] mt-0.5">No screener tickers currently meet 5/6 EMA pullback criteria</p>
              </div>
            ) : (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[9px] text-[#8b949e] uppercase tracking-widest border-b border-[#21262d]">
                    <th className="text-center py-2 px-1.5 font-medium w-8">
                      <svg className="w-3 h-3 text-[#8b949e] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                    </th>
                    <th className="text-left py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "ticker", dir: prev.field === "ticker" && prev.dir === "asc" ? "desc" : "asc" }))}>
                      Ticker {signalSort.field === "ticker" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-left py-2 px-2 font-medium">Signal</th>
                    <th className="text-right py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "price", dir: prev.field === "price" && prev.dir === "asc" ? "desc" : "asc" }))}>
                      Price {signalSort.field === "price" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-center py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "health", dir: prev.field === "health" && prev.dir === "desc" ? "asc" : "desc" }))}>
                      Health {signalSort.field === "health" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-center py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "chains", dir: prev.field === "chains" && prev.dir === "desc" ? "asc" : "desc" }))}>
                      Activity {signalSort.field === "chains" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-center py-2 px-2 font-medium cursor-pointer select-none hover:text-[#c9d1d9] transition-colors" onClick={() => setSignalSort(prev => ({ field: "analyst", dir: prev.field === "analyst" && prev.dir === "desc" ? "asc" : "desc" }))}>
                      Analyst {signalSort.field === "analyst" ? (signalSort.dir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="text-right py-2 px-2 font-medium">RSI</th>
                    <th className="text-center py-2 px-2 font-medium">Strength</th>
                    <th className="text-center py-2 px-2 font-medium">Volume</th>
                    <th className="text-center py-2 px-2 font-medium">Candle</th>
                  </tr>
                </thead>
                <tbody>
                  {[...signalResults].sort((a, b) => {
                    const dir = signalSort.dir === "asc" ? 1 : -1;
                    if (signalSort.field === "ticker") return dir * a.ticker.localeCompare(b.ticker);
                    if (signalSort.field === "health") return dir * ((signalHealth[a.ticker]?.health_score ?? 0) - (signalHealth[b.ticker]?.health_score ?? 0));
                    if (signalSort.field === "chains") return dir * ((signalChains[a.ticker] ?? 0) - (signalChains[b.ticker] ?? 0));
                    if (signalSort.field === "analyst") {
                      const aBuys = signalAnalyst[a.ticker] ? signalAnalyst[a.ticker].strong_buy + signalAnalyst[a.ticker].buy : 0;
                      const bBuys = signalAnalyst[b.ticker] ? signalAnalyst[b.ticker].strong_buy + signalAnalyst[b.ticker].buy : 0;
                      return dir * (aBuys - bBuys);
                    }
                    return dir * (a.price - b.price);
                  }).map((sig) => {
                    const isCsp = sig.direction === "call";
                    const hasShares = (positions[sig.ticker] || []).reduce((s, tx) => s + (tx.type === "buy" ? tx.quantity : -tx.quantity), 0) > 0;
                    const ccDisabled = !isCsp && !hasShares;
                    const isWatched = watchlist.includes(sig.ticker.toUpperCase());
                    return (
                      <tr key={sig.ticker} className="border-b border-[#161b22] hover:bg-[#161b22]/60 transition-colors">
                        <td className="py-2.5 px-1.5 text-center w-8">
                          <input
                            type="checkbox"
                            checked={isWatched}
                            onChange={() => {
                              if (isWatched) {
                                removeFromWatchlist(sig.ticker);
                              } else {
                                addToWatchlist(sig.ticker);
                              }
                            }}
                            className="w-3.5 h-3.5 rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#58a6ff] focus:ring-offset-0 cursor-pointer accent-[#58a6ff]"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <TickerLink ticker={sig.ticker} />
                        </td>
                        <td className="py-2.5 px-2">
                          {ccDisabled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-[#161b22] border border-[#30363d] text-[#6e7681]">
                              CC — Not actionable
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold ${isCsp ? "bg-[#d29922]/10 text-[#d29922]" : "bg-[#58a6ff]/10 text-[#58a6ff]"}`}>
                              {isCsp ? "Sell CSP" : "Sell CC"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right text-[#c9d1d9] tabular-nums font-medium">${sig.price.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-center">
                          {signalHealth[sig.ticker] ? (
                            <span className={`text-[10px] font-bold tabular-nums ${healthScoreColor(signalHealth[sig.ticker].health_score)}`}>
                              {signalHealth[sig.ticker].health_score}
                            </span>
                          ) : (
                            <span className="text-[#484f58]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {signalChains[sig.ticker] != null ? (
                            <span
                              className={`inline-block w-2.5 h-2.5 rounded-full ${signalChains[sig.ticker] >= 50 ? "bg-[#3fb950]" : signalChains[sig.ticker] >= 20 ? "bg-[#d29922]" : "bg-[#f85149]"}`}
                              title={`${signalChains[sig.ticker]} contracts`}
                            />
                          ) : (
                            <span className="text-[#484f58]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {signalAnalyst[sig.ticker] ? (() => {
                            const a = signalAnalyst[sig.ticker];
                            const total = a.strong_buy + a.buy + a.hold + a.sell + a.strong_sell;
                            // Determine consensus label
                            let label = "Hold";
                            let color = "text-[#d29922]";
                            if (total > 0) {
                              const max = Math.max(a.strong_buy, a.buy, a.hold, a.sell, a.strong_sell);
                              if (max === a.strong_buy) { label = "Strong Buy"; color = "text-[#3fb950]"; }
                              else if (max === a.buy) { label = "Buy"; color = "text-[#56d364]"; }
                              else if (max === a.hold) { label = "Hold"; color = "text-[#d29922]"; }
                              else if (max === a.sell) { label = "Sell"; color = "text-[#f85149]"; }
                              else if (max === a.strong_sell) { label = "Strong Sell"; color = "text-[#f85149]"; }
                            }
                            return (
                              <span className={`text-[10px] font-bold ${color}`} title={`${a.strong_buy} Strong Buy, ${a.buy} Buy, ${a.hold} Hold, ${a.sell} Sell, ${a.strong_sell} Strong Sell`}>
                                {label}
                              </span>
                            );
                          })() : (
                            <span className="text-[#484f58]">—</span>
                          )}
                        </td>
                        <td className={`py-2.5 px-2 text-right tabular-nums font-medium ${sig.rsi > 70 ? "text-[#f85149]" : sig.rsi < 30 ? "text-[#3fb950]" : "text-[#c9d1d9]"}`}>{sig.rsi.toFixed(1)}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${sig.criteria_met >= 6 ? "bg-[#3fb950]/15 text-[#3fb950]" : "bg-[#d29922]/15 text-[#d29922]"}`}>
                            {sig.criteria_met}/6
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {sig.volume_increasing ? (
                            <span className="text-[#3fb950]">▲</span>
                          ) : (
                            <span className="text-[#484f58]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {sig.candle_confirmed ? (
                            <span className="text-[#3fb950]">✓</span>
                          ) : (
                            <span className="text-[#484f58]">✗</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

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
        <div className="flex flex-col flex-1 min-h-0 rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden shadow-sm">
            {/* Add ticker input */}
            <form
              onSubmit={(e) => { e.preventDefault(); watchInput.split(/[\s,]+/).filter(Boolean).forEach(t => addToWatchlist(t)); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-[#30363d]"
            >
              <svg className="w-3.5 h-3.5 text-[#484f58] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <input
                type="text"
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value.toUpperCase())}
                placeholder="Add ticker symbols (comma separated)…"
                className="flex-1 bg-transparent border-none text-[11px] text-[#c9d1d9] placeholder:text-[#484f58] focus:outline-none focus:ring-0"
              />
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="submit"
                  disabled={!watchInput.trim()}
                  className="px-2.5 py-1 rounded-md bg-[#238636] text-white text-[10px] font-semibold disabled:opacity-20 hover:bg-[#2ea043] transition flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Add
                </button>
                <label
                  className="px-2.5 py-1 rounded-md bg-[#21262d] text-[#c9d1d9] text-[10px] font-medium hover:bg-[#30363d] transition cursor-pointer flex items-center gap-1"
                  title="Import tickers from CSV file"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                  Import
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const text = ev.target?.result as string;
                        text.split(/[\s,\n\r]+/).filter(Boolean).forEach(t => addToWatchlist(t.trim().toUpperCase()));
                      };
                      reader.readAsText(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (watchlist.length === 0) return;
                    navigator.clipboard.writeText(watchlist.join(", "));
                  }}
                  className="px-2.5 py-1 rounded-md bg-[#21262d] text-[#c9d1d9] text-[10px] font-medium hover:bg-[#30363d] transition flex items-center gap-1"
                  title="Export watchlist to clipboard"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const csv = "ticker\nAAPL\nMSFT\nAMD\nNVDA\nAMZN\nGOOGL\nMETA\nTSLA\nSPY\nQQQ\nMETA\nKO\nPLTR\nSOFI\nCOIN\n";
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "watchlist_template.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-2.5 py-1 rounded-md bg-[#21262d] text-[#c9d1d9] text-[10px] font-medium hover:bg-[#30363d] transition flex items-center gap-1"
                  title="Download a CSV template to customize and import"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                  Template
                </button>
              </div>
            </form>
            {/* Ticker table */}
            <div className="flex-1 overflow-y-auto">
              {watchlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-16 px-4">
                  <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-[#8b949e]">Your watchlist is empty</p>
                    <p className="text-[10px] text-[#484f58] mt-0.5">Add ticker symbols above to start tracking stocks</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#161b22] z-10">
                    <tr>
                      <td colSpan={10} className="px-3 py-2 border-b border-[#21262d]">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Positions</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setWatchRefreshKey(k => k + 1)}
                              className="text-[9px] text-[#8b949e] hover:text-[#c9d1d9] transition-colors flex items-center gap-1"
                              title="Refresh data"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                              </svg>
                              Refresh
                            </button>
                            <button
                              onClick={() => { setWatchlist([]); setSelectedWatch(null); }}
                              className="text-[9px] text-[#8b949e] hover:text-[#f85149] transition-colors flex items-center gap-1"
                              title="Clear all tickers"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                              Clear All
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <th className="w-6 px-1 py-2"></th>
                      <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-[#c9d1d9] transition-colors whitespace-nowrap"
                        onClick={() => { if (watchSortField === "ticker") setWatchSortDir(d => d === "asc" ? "desc" : "asc"); else { setWatchSortField("ticker"); setWatchSortDir("asc"); } }}
                      >
                        <span className={watchSortField === "ticker" ? "text-[#c9d1d9]" : "text-[#8b949e]"}>Ticker{watchSortField === "ticker" ? (watchSortDir === "asc" ? " ▲" : " ▼") : ""}</span>
                      </th>
                      <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-[#c9d1d9] transition-colors whitespace-nowrap"
                        onClick={() => { if (watchSortField === "sector") setWatchSortDir(d => d === "asc" ? "desc" : "asc"); else { setWatchSortField("sector"); setWatchSortDir("asc"); } }}
                      >
                        <span className={watchSortField === "sector" ? "text-[#c9d1d9]" : "text-[#8b949e]"}>Sector{watchSortField === "sector" ? (watchSortDir === "asc" ? " ▲" : " ▼") : ""}</span>
                      </th>
                      <th className="px-3 py-2 text-center text-[9px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-[#c9d1d9] transition-colors whitespace-nowrap w-20"
                        onClick={() => { if (watchSortField === "health") setWatchSortDir(d => d === "asc" ? "desc" : "asc"); else { setWatchSortField("health"); setWatchSortDir("asc"); } }}
                      >
                        <span className={watchSortField === "health" ? "text-[#c9d1d9]" : "text-[#8b949e]"}>Health{watchSortField === "health" ? (watchSortDir === "asc" ? " ▲" : " ▼") : ""}</span>
                      </th>
                      <th className="px-3 py-2 text-right text-[9px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-[#c9d1d9] transition-colors whitespace-nowrap"
                        onClick={() => { if (watchSortField === "price") setWatchSortDir(d => d === "asc" ? "desc" : "asc"); else { setWatchSortField("price"); setWatchSortDir("asc"); } }}
                      >
                        <span className={watchSortField === "price" ? "text-[#c9d1d9]" : "text-[#8b949e]"}>Price{watchSortField === "price" ? (watchSortDir === "asc" ? " ▲" : " ▼") : ""}</span>
                      </th>
                      <th className="px-3 py-2 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider whitespace-nowrap">Low</th>
                      <th className="px-3 py-2 text-right text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider whitespace-nowrap">High</th>
                      <th className="px-3 py-2 text-left text-[9px] font-semibold text-[#8b949e] uppercase tracking-wider whitespace-nowrap">Earnings</th>
                      <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-[#c9d1d9] transition-colors whitespace-nowrap"
                        onClick={() => { if (watchSortField === "analyst") setWatchSortDir(d => d === "asc" ? "desc" : "asc"); else { setWatchSortField("analyst"); setWatchSortDir("asc"); } }}
                      >
                        <span className={watchSortField === "analyst" ? "text-[#c9d1d9]" : "text-[#8b949e]"}>Analyst{watchSortField === "analyst" ? (watchSortDir === "asc" ? " ▲" : " ▼") : ""}</span>
                      </th>
                      <th className="w-7 px-1 py-2"></th>
                    </tr>
                    <tr><td colSpan={10} className="h-px bg-[#30363d]"></td></tr>
                  </thead>
                  <tbody>
                {[...watchlist].sort((a, b) => {
                  let cmp = 0;
                  const analystScore = (ticker: string) => {
                    const t0 = watchBatch.analyst_trends[ticker];
                    const cur = t0?.find((x: { period: string }) => x.period === "0m") || t0?.[0];
                    if (!cur) return 99;
                    const total = cur.strong_buy + cur.buy + cur.hold + cur.sell + cur.strong_sell;
                    return total === 0 ? 99 : (cur.strong_buy * 1 + cur.buy * 2 + cur.hold * 3 + cur.sell * 4 + cur.strong_sell * 5) / total;
                  };
                  switch (watchSortField) {
                    case "ticker": cmp = a.localeCompare(b); break;
                    case "name": cmp = (watchBatch.financials[a]?.name ?? "").localeCompare(watchBatch.financials[b]?.name ?? ""); break;
                    case "price": cmp = (watchBatch.market_data[a]?.price ?? 0) - (watchBatch.market_data[b]?.price ?? 0); break;
                    case "health": cmp = (watchBatch.financials[a]?.health_score ?? -1) - (watchBatch.financials[b]?.health_score ?? -1); break;
                    case "sector": cmp = (watchBatch.financials[a]?.sector ?? "").localeCompare(watchBatch.financials[b]?.sector ?? ""); break;
                    case "analyst": cmp = analystScore(a) - analystScore(b); break;
                    case "positions": {
                      const netA = (positions[a] || []).reduce((s, tx) => s + (tx.type === "buy" ? tx.quantity : -tx.quantity), 0);
                      const netB = (positions[b] || []).reduce((s, tx) => s + (tx.type === "buy" ? tx.quantity : -tx.quantity), 0);
                      cmp = netA - netB; break;
                    }
                  }
                  if (cmp === 0) cmp = a.localeCompare(b);
                  return watchSortDir === "asc" ? cmp : -cmp;
                }).map((t) => {
                  const md = watchBatch.market_data[t];
                  const health = watchBatch.financials[t];
                  const cal = watchBatch.earnings_calendar[t];
                  const hist = watchBatch.earnings_history[t];
                  const trends = watchBatch.analyst_trends[t];
                  const isActive = selectedWatch === t;
                  const txns = positions[t] || [];
                  const buyTxns = txns.filter(tx => tx.type === "buy");
                  const sellTxns = txns.filter(tx => tx.type === "sell");
                  const totalBuyQty = buyTxns.reduce((s, tx) => s + tx.quantity, 0);
                  const totalSellQty = sellTxns.reduce((s, tx) => s + tx.quantity, 0);
                  const netShares = totalBuyQty - totalSellQty;
                  const totalBuyCost = buyTxns.reduce((s, tx) => s + tx.quantity * tx.price, 0);
                  const avgCost = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
                  const currentValue = netShares * (md?.price ?? 0);
                  const costBasis = netShares * avgCost;
                  const pnl = currentValue - costBasis;
                  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                  const openOrders = orders.filter(o => o.ticker === t && o.status === "open");
                  const hasCSP = openOrders.some(o => o.leg === "CSP");
                  const hasCC = openOrders.some(o => o.leg === "CC");
                  const posType = hasCSP && hasCC ? "CSP+CC" : hasCSP ? "CSP" : hasCC ? "CC" : netShares > 0 ? "Stock" : "—";
                  const lots = Math.floor(netShares / 100);

                  // Earnings
                  const nextEarnings = cal && cal.length > 0 ? cal[0] : null;
                  const sortedHist = hist ? [...hist].sort((a, b) => b.report_date.localeCompare(a.report_date)) : [];
                  const lastEarnings = sortedHist.length > 0 ? sortedHist[0] : null;

                  // Analyst
                  const latest = trends?.[0];
                  const totalAnalysts = latest ? latest.strong_buy + latest.buy + latest.hold + latest.sell + latest.strong_sell : 0;
                  const bullish = latest ? latest.strong_buy + latest.buy : 0;
                  const bearish = latest ? latest.sell + latest.strong_sell : 0;
                  const consensus = totalAnalysts === 0 ? "—"
                    : bullish / totalAnalysts >= 0.7 ? "Strong Buy"
                    : bullish / totalAnalysts >= 0.5 ? "Buy"
                    : bearish / totalAnalysts >= 0.5 ? "Sell"
                    : bearish / totalAnalysts >= 0.7 ? "Strong Sell"
                    : "Hold";

                  return (
                    <React.Fragment key={t}>
                      <tr
                        ref={isActive ? activeTickerRowRef : undefined}
                        onClick={() => setSelectedWatch(isActive ? null : t)}
                        className={`group cursor-pointer transition-all duration-100 ${isActive ? "bg-[#161b22]" : "hover:bg-[#161b22]/50"}`}
                      >
                        <td className="px-1 py-2.5 text-center border-b border-[#21262d]/30 w-6">
                          <svg className={`w-3 h-3 transition-transform duration-150 inline-block ${isActive ? "rotate-90 text-[#d29922]" : "text-[#30363d] group-hover:text-[#484f58]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </td>
                        {/* Ticker */}
                        <td className="px-3 py-2.5 border-b border-[#21262d]/30">
                          <div className="flex items-center gap-1.5">
                            <span
                              onClick={(e) => { e.stopPropagation(); openHealthPopup(t); }}
                              className={`text-[11px] font-bold tracking-wide cursor-pointer hover:underline decoration-dotted underline-offset-2 ${isActive ? "text-[#d29922]" : "text-[#58a6ff]"}`}
                            >{t}</span>
                            {netShares > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#d29922] inline-block shrink-0" title={`${netShares} shares`} />
                            )}
                            {openOrders.length > 0 && (
                              <span className="text-[8px] font-bold text-[#d29922] bg-[#d29922]/15 px-1 py-0.5 rounded leading-none shrink-0" title={`${openOrders.length} open contract${openOrders.length > 1 ? "s" : ""}`}>{openOrders.length}</span>
                            )}
                          </div>
                          <span className="text-[9px] text-[#8b949e] truncate block max-w-[160px]">{health?.name ?? ""}</span>
                        </td>
                        {/* Sector */}
                        <td className="px-3 py-2.5 border-b border-[#21262d]/30 whitespace-nowrap">
                          {health?.sector ? (
                            <span className="text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded">{health.sector}</span>
                          ) : (
                            <span className="text-[10px] text-[#30363d]">—</span>
                          )}
                        </td>
                        {/* Health */}
                        <td className="px-3 py-2.5 text-center border-b border-[#21262d]/30">
                          {health ? (
                            <div className="inline-flex items-center gap-1.5">
                              <div className="w-10 h-1 rounded-full bg-[#21262d] overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${health.health_score}%`,
                                    backgroundColor: health.health_score >= 70 ? '#3fb950' : health.health_score >= 40 ? '#d29922' : '#f85149',
                                  }}
                                />
                              </div>
                              <span className={`text-[10px] font-bold tabular-nums leading-none ${healthScoreColor(health.health_score)}`}>
                                {health.health_score}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#30363d]">—</span>
                          )}
                        </td>
                        {/* Price */}
                        <td className="px-3 py-2.5 text-right border-b border-[#21262d]/30 whitespace-nowrap">
                          <span className="text-[11px] text-[#f0f6fc] font-semibold tabular-nums">{md ? `$${md.price.toFixed(2)}` : "—"}</span>
                        </td>
                        {/* Low (52W + Day) */}
                        <td className="px-3 py-2.5 text-right border-b border-[#21262d]/30 whitespace-nowrap">
                          {md ? (
                            <div className="space-y-0.5">
                              <div className="text-[9px] tabular-nums leading-none"><span className="text-[#484f58] font-medium">52W</span> <span className="text-[#8b949e]">${md.week52_low.toFixed(2)}</span></div>
                              <div className="text-[9px] tabular-nums leading-none"><span className="text-[#484f58] font-medium">Day</span> <span className="text-[#8b949e]">${md.daily_low.toFixed(2)}</span></div>
                            </div>
                          ) : <span className="text-[10px] text-[#30363d]">—</span>}
                        </td>
                        {/* High (52W + Day) */}
                        <td className="px-3 py-2.5 text-right border-b border-[#21262d]/30 whitespace-nowrap">
                          {md ? (
                            <div className="space-y-0.5">
                              <div className="text-[9px] tabular-nums leading-none"><span className="text-[#484f58] font-medium">52W</span> <span className="text-[#8b949e]">${md.week52_high.toFixed(2)}</span></div>
                              <div className="text-[9px] tabular-nums leading-none"><span className="text-[#484f58] font-medium">Day</span> <span className="text-[#8b949e]">${md.daily_high.toFixed(2)}</span></div>
                            </div>
                          ) : <span className="text-[10px] text-[#30363d]">—</span>}
                        </td>
                        {/* Earnings */}
                        <td className="px-3 py-2.5 border-b border-[#21262d]/30 whitespace-nowrap">
                          <div className="space-y-0.5">
                            {nextEarnings ? (
                              <div className="text-[9px] tabular-nums leading-none">
                                <span className={`font-semibold ${nextEarnings.days_until <= 14 ? "text-[#d29922]" : "text-[#c9d1d9]"}`}>{nextEarnings.days_until}d</span>
                                <span className="text-[#484f58] ml-1">{nextEarnings.earnings_date}</span>
                              </div>
                            ) : <span className="text-[9px] text-[#30363d]">—</span>}
                            {lastEarnings && (
                              <div className="text-[9px] tabular-nums leading-none">
                                <span className={lastEarnings.beat === true ? "text-[#3fb950]" : lastEarnings.beat === false ? "text-[#f85149]" : "text-[#484f58]"}>
                                  {lastEarnings.beat === true ? "Beat" : lastEarnings.beat === false ? "Miss" : "—"} {lastEarnings.fiscal_quarter}
                                </span>
                                {lastEarnings.eps_surprise != null && (
                                  <span className={`ml-1 ${lastEarnings.eps_surprise >= 0 ? "text-[#3fb950]/70" : "text-[#f85149]/70"}`}>
                                    {lastEarnings.eps_surprise >= 0 ? "+" : ""}{lastEarnings.eps_surprise.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        {/* Analyst */}
                        <td className="px-3 py-2.5 border-b border-[#21262d]/30 whitespace-nowrap">
                          <span className={`text-[10px] font-semibold ${
                            consensus.includes("Buy") ? "text-[#3fb950]" : consensus === "Hold" ? "text-[#d29922]" : consensus.includes("Sell") ? "text-[#f85149]" : "text-[#30363d]"
                          }`}>{consensus}</span>
                        </td>
                        {/* Remove */}
                        <td className="px-1 py-2.5 text-center border-b border-[#21262d]/30 w-7">
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFromWatchlist(t); }}
                            className="opacity-0 group-hover:opacity-100 text-[#30363d] hover:text-[#f85149] transition-all duration-150 p-0.5 rounded"
                            title="Remove"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                      {/* Expanded detail panel */}
                      {isActive && (
                        <tr><td colSpan={10} className="p-0 border-b border-[#30363d]">
                        <div className="bg-[#0d1117]/95 backdrop-blur-sm">

                {/* Detail sub-tabs — underline style */}
                <div className="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-[#21262d] bg-[#161b22]/50 overflow-x-auto">
                  {(["position", "option", "order", "technicals"] as const).map((tab) => {
                    const label = { position: "Position", option: "Options", order: "Contracts", technicals: "Technicals" }[tab];
                    const icon = {
                      position: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>,
                      option: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>,
                      order: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>,
                      technicals: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
                    }[tab];
                    const isTabActive = watchDetailTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => setWatchDetailTab(tab)}
                        className={`relative whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-0 ${
                          isTabActive
                            ? "text-[#f0f6fc]"
                            : "text-[#8b949e] hover:text-[#c9d1d9]"
                        }`}
                      >
                        {icon}
                        {label}
                        {tab === "order" && (() => { const oc = orders.filter(o => o.ticker === selectedWatch && o.status === "open").length; return oc > 0 ? <span className="text-[8px] font-bold tabular-nums text-[#58a6ff] bg-[#58a6ff]/10 rounded-full px-1.5 py-0.5 leading-none">{oc}</span> : null; })()}
                        {isTabActive && <span className="absolute bottom-0 inset-x-1.5 h-[2px] rounded-full bg-[#d29922]" />}
                      </button>
                    );
                  })}
                </div>

                {/* Tab content */}
                <div className="p-5 bg-[#0d1117] h-[540px] flex flex-col overflow-y-scroll">

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
                      (form.elements.namedItem("type") as HTMLSelectElement).value = "";
                      (form.elements.namedItem("date") as HTMLInputElement).value = today;
                      (form.elements.namedItem("quantity") as HTMLInputElement).value = "";
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
                    const netCashFlow = totalSellProceeds - totalBuyCost;

                    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

                    return (
                      <div className="space-y-3 p-1">
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
                              className="flex-none px-2.5 py-1 rounded bg-[#238636] hover:bg-[#2ea043] border border-[#238636] text-[10px] font-semibold text-white transition-colors flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                              Add
                            </button>
                            <button
                              type="reset"
                              className="flex-none px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[10px] font-semibold text-[#8b949e] transition-colors flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                              Reset
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
                                  <td className={`px-2.5 py-2 text-right tabular-nums font-bold ${netCashFlow >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                                    {netCashFlow >= 0 ? "+" : ""}${netCashFlow.toLocaleString(undefined, {maximumFractionDigits: 2})}
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
                        <div className="flex-1 min-w-0 min-h-0 rounded border border-[#21262d] overflow-hidden flex flex-col bg-[#0d1117]">
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
                                                <td colSpan={10} className="h-0 p-0 relative">
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
                                            <td colSpan={10} className="h-0 p-0 relative">
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
                                available_cash: 100000,
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
                                            <th className="px-2 py-1.5 text-right font-medium">Trend</th>
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
                                                <td className="px-2 py-1.5 text-right">
                                                  {r.trend_signal ? (
                                                    <span className={`text-[8px] font-medium px-1 py-0.5 rounded-full ${(r.trend_score ?? 0) > 2 ? "bg-[#3fb950]/10 text-[#3fb950]" : (r.trend_score ?? 0) < -2 ? "bg-[#f85149]/10 text-[#f85149]" : "bg-[#21262d] text-[#484f58]"}`} title={r.trend_signal}>
                                                      {(r.trend_score ?? 0) > 0 ? "▲" : (r.trend_score ?? 0) < 0 ? "▼" : "—"}
                                                    </span>
                                                  ) : <span className="text-[9px] text-[#30363d]">—</span>}
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
                                                <td className="px-2 py-1.5 text-right">
                                                  {r.trend_signal ? (
                                                    <span className={`text-[8px] font-medium px-1 py-0.5 rounded-full ${(r.trend_score ?? 0) > 2 ? "bg-[#3fb950]/10 text-[#3fb950]" : (r.trend_score ?? 0) < -2 ? "bg-[#f85149]/10 text-[#f85149]" : "bg-[#21262d] text-[#484f58]"}`} title={r.trend_signal}>
                                                      {(r.trend_score ?? 0) > 0 ? "▲" : (r.trend_score ?? 0) < 0 ? "▼" : "—"}
                                                    </span>
                                                  ) : <span className="text-[9px] text-[#30363d]">—</span>}
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
                                  <th className="px-2 py-1.5 text-center font-medium"></th>
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
                                      <td className="px-2 py-1.5 text-center">
                                        <button
                                          onClick={() => setOrders(prev => prev.filter(x => x.id !== o.id))}
                                          className="rounded p-0.5 text-[#484f58] hover:text-[#f85149] hover:bg-[#f85149]/10 transition-colors focus:outline-none"
                                          title="Delete contract"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
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

                  {/* ── Technicals tab ── */}
                  {watchDetailTab === "technicals" && (() => {
                    if (watchTechnicalsLoading) {
                      return (
                        <div className="flex items-center justify-center h-40">
                          <div className="animate-spin w-5 h-5 border-2 border-[#30363d] border-t-[#58a6ff] rounded-full" />
                        </div>
                      );
                    }
                    if (!watchTechnicals) {
                      return (
                        <div className="flex flex-col items-center justify-center h-40 text-center">
                          <svg className="w-6 h-6 text-[#484f58] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                          </svg>
                          <p className="text-[10px] text-[#484f58]">No trend signal detected</p>
                          <p className="text-[9px] text-[#30363d] mt-1">Insufficient criteria for a wheel-favorable setup</p>
                        </div>
                      );
                    }
                    const sig = watchTechnicals;
                    const isCall = sig.direction === "call";
                    // Wheel-oriented: bullish = CSP favorable, bearish = CC favorable
                    const wheelAction = isCall ? "Sell CSP" : "Sell CC";
                    const wheelDesc = isCall ? "CSP-Favorable — Uptrend Pullback to Support" : "CC-Favorable — Downtrend Retrace to Resistance";
                    const wheelColor = isCall ? "text-[#d29922]" : "text-[#58a6ff]";
                    const wheelBg = isCall ? "bg-[#d29922]/10 border-[#d29922]/30" : "bg-[#58a6ff]/10 border-[#58a6ff]/30";
                    const strengthPct = (sig.criteria_met / 6) * 100;
                    const strengthColor = sig.criteria_met >= 5 ? "bg-[#3fb950]" : sig.criteria_met >= 3 ? "bg-[#d29922]" : "bg-[#f85149]";

                    return (
                      <div className="space-y-4">
                        {/* Signal header */}
                        <div className={`flex items-center gap-3 p-3 rounded-lg border ${wheelBg}`}>
                          <div className={`text-sm font-black ${wheelColor}`}>
                            {wheelAction}
                          </div>
                          <div className="flex-1">
                            <div className="text-[11px] text-[#c9d1d9] font-semibold">
                              {wheelDesc}
                            </div>
                            <div className="text-[10px] text-[#8b949e] mt-0.5">
                              {sig.criteria_met}/6 criteria met
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-[#c9d1d9] font-bold tabular-nums">${sig.price.toFixed(2)}</div>
                            <div className="text-[9px] text-[#8b949e]">Current Price</div>
                          </div>
                        </div>

                        {/* Wheel context explanation */}
                        <div className={`px-3 py-2 rounded-lg border ${isCall ? "bg-[#3fb950]/5 border-[#3fb950]/20" : "bg-[#f85149]/5 border-[#f85149]/20"}`}>
                          <p className="text-[10px] text-[#c9d1d9] leading-relaxed">
                            {isCall
                              ? "Stock is in an uptrend pulling back to EMA support. Selling puts here means if assigned, you buy at a strong support level. Low risk of the stock continuing down through your strike."
                              : "Stock is in a downtrend retracing to EMA resistance. Selling covered calls here means the stock is unlikely to rally through your strike. Maximises premium capture with low assignment risk."}
                          </p>
                        </div>

                        {/* Strength bar */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-[#8b949e] uppercase tracking-widest font-medium">Signal Strength</span>
                            <span className="text-[10px] text-[#c9d1d9] font-bold tabular-nums">{sig.criteria_met}/6</span>
                          </div>
                          <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: `${strengthPct}%` }} />
                          </div>
                        </div>

                        {/* Indicators grid */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-2.5">
                            <div className="text-[9px] text-[#8b949e] uppercase tracking-widest mb-1">50-DMA</div>
                            <div className="text-[12px] text-[#c9d1d9] font-bold tabular-nums">${sig.dma_50.toFixed(2)}</div>
                            <div className={`text-[9px] mt-0.5 ${sig.dma_slope > 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                              {sig.dma_slope > 0 ? "▲" : "▼"} Slope {sig.dma_slope > 0 ? "+" : ""}{sig.dma_slope.toFixed(3)}/day
                            </div>
                          </div>
                          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-2.5">
                            <div className="text-[9px] text-[#8b949e] uppercase tracking-widest mb-1">RSI (14)</div>
                            <div className={`text-[12px] font-bold tabular-nums ${sig.rsi > 70 ? "text-[#f85149]" : sig.rsi < 30 ? "text-[#3fb950]" : "text-[#c9d1d9]"}`}>{sig.rsi.toFixed(1)}</div>
                            <div className="text-[9px] text-[#8b949e] mt-0.5">
                              {sig.rsi > 70 ? "Overbought — avoid CSPs" : sig.rsi < 30 ? "Oversold — CSP opportunity" : sig.rsi > 50 ? "Favors selling puts" : "Favors selling calls"}
                            </div>
                          </div>
                          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-2.5">
                            <div className="text-[9px] text-[#8b949e] uppercase tracking-widest mb-1">9 EMA / 21 EMA</div>
                            <div className="text-[12px] text-[#c9d1d9] font-bold tabular-nums">${sig.ema_9.toFixed(2)} / ${sig.ema_21.toFixed(2)}</div>
                            <div className="text-[9px] text-[#8b949e] mt-0.5">
                              {sig.ema_9 > sig.ema_21 ? "9 above 21 — CSP-favorable" : "9 below 21 — CC-favorable"}
                            </div>
                          </div>
                          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-2.5">
                            <div className="text-[9px] text-[#8b949e] uppercase tracking-widest mb-1">Volume</div>
                            <div className={`text-[12px] font-bold ${sig.volume_increasing ? "text-[#3fb950]" : "text-[#8b949e]"}`}>
                              {sig.volume_increasing ? "Increasing ▲" : "Not increasing"}
                            </div>
                            <div className="text-[9px] text-[#8b949e] mt-0.5">
                              {sig.volume_increasing ? "Confirms momentum" : "Weak confirmation"}
                            </div>
                          </div>
                        </div>

                        {/* Criteria checklist */}
                        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-3">
                          <div className="text-[9px] text-[#8b949e] uppercase tracking-widest font-medium mb-2">Criteria Checklist</div>
                          <div className="space-y-1.5">
                            {sig.notes.map((note, i) => {
                              const isPassed = !note.toLowerCase().includes("not ") && !note.toLowerCase().includes("no ") && !note.includes("< 50") && !note.includes("> 50") ? 
                                (isCall ? !note.includes("< 50") : !note.includes("> 50")) : false;
                              // Simple heuristic: if it starts with "Price above/below" or contains positive language, it's a pass
                              const isPositive = note.startsWith("Price above") || note.startsWith("Price below") ||
                                note.includes("sloping up") || note.includes("sloping down") ||
                                note.includes("Pullback to") || note.includes("Retrace to") ||
                                note.includes("Bounce candle confirmed") || note.includes("Rejection candle confirmed") ||
                                (isCall ? note.includes("RSI") && note.includes("> 50") : note.includes("RSI") && note.includes("< 50")) ||
                                note === "Volume increasing";
                              return (
                                <div key={i} className="flex items-start gap-2">
                                  <span className={`shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${isPositive ? "bg-[#3fb950]/20 text-[#3fb950]" : "bg-[#f85149]/15 text-[#f85149]"}`}>
                                    {isPositive ? "✓" : "✗"}
                                  </span>
                                  <span className="text-[10px] text-[#c9d1d9]">{note}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Candle confirmation */}
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${sig.candle_confirmed ? "bg-[#3fb950]/5 border-[#3fb950]/20" : "bg-[#21262d] border-[#30363d]"}`}>
                          <span className={`text-[10px] font-medium ${sig.candle_confirmed ? "text-[#3fb950]" : "text-[#8b949e]"}`}>
                            {isCall ? "Bounce" : "Rejection"} Candle: {sig.candle_confirmed ? "Confirmed ✓" : "Not confirmed"}
                          </span>
                        </div>

                        {/* Exit condition — reframed for wheel */}
                        <div className="bg-[#d29922]/5 border border-[#d29922]/20 rounded-lg p-3">
                          <div className="text-[9px] text-[#d29922] uppercase tracking-widest font-medium mb-1">When to Avoid This Trade</div>
                          <p className="text-[10px] text-[#c9d1d9] leading-relaxed">
                            {isCall
                              ? `Don't sell CSPs if price loses the 9/21 EMA ($${sig.ema_9.toFixed(2)}/$${sig.ema_21.toFixed(2)}) — the uptrend support has failed and puts become risky.`
                              : `Don't sell CCs if price reclaims the 9/21 EMA ($${sig.ema_9.toFixed(2)}/$${sig.ema_21.toFixed(2)}) — the stock may be reversing upward and you risk assignment.`}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                        </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
                  </tbody>
                </table>
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
