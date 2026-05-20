"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DiscoveryItem, FinancialHealth, AnalystTrend, SearchResult, StockMarketData, OptionsChain, EarningsCalendar, EarningsResult, WheelRecommendation, PositionTransaction, OptionsOrder, EmaPullbackSignal } from "@/lib/types";
import { getDiscovery, getBatchData, prefetchDiscovery, searchTickers, getOptionsChains, getTechnicals } from "@/lib/api";
import { useLocalStorageState } from "@/lib/hooks";
import CloseContractModal from "./CloseContractModal";
import TradeDetailModal from "./TradeDetailModal";
import { SCREENERS, SIGNAL_SCREENER_IDS } from "./Discovery/constants";
import type { SortField, SortDir } from "./Discovery/constants";
import SignalsTab from "./Discovery/SignalsTab";
import ScreenersTab from "./Discovery/ScreenersTab";
import SearchTab from "./Discovery/SearchTab";
import WatchlistTab from "./Discovery/WatchlistTab";

export default function DiscoveryTab() {
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
  const [signalSort, setSignalSort] = useState<{ field: "ticker" | "price" | "health" | "chains" | "analyst" | "sector" | "strength" | "volume" | "candle"; dir: SortDir }>({ field: "ticker", dir: "asc" });
  const [signalHealth, setSignalHealth] = useState<Record<string, FinancialHealth>>({});
  const [signalChains, setSignalChains] = useState<Record<string, number>>({});
  const [signalAnalyst, setSignalAnalyst] = useState<Record<string, AnalystTrend>>({});

  // ── Watchlist state ──
  const [watchlist, setWatchlist] = useLocalStorageState<string[]>("watchlist", []);
  const [watchInput, setWatchInput] = useState("");
  const [selectedWatch, setSelectedWatch] = useState<string | null>(null);
  const [watchSortField, setWatchSortField] = useState<"ticker" | "price" | "health" | "name" | "sector" | "analyst" | "positions">("ticker");
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

  const addToWatchlist = useCallback((ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setWatchlist((prev) => prev.includes(t) ? prev : [...prev, t]);
    setWatchInput("");
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
    prefetchDiscovery().catch(() => {});
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
      .catch(() => {});
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

  async function scanSignals() {
    setSignalLoading(true);
    setSignalResults([]);
    setSignalScanned(true);
    try {
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

      const strong = allSignals.filter((s) => s.criteria_met >= 5);
      strong.sort((a, b) => b.criteria_met - a.criteria_met || a.ticker.localeCompare(b.ticker));
      setSignalResults(strong);

      if (strong.length > 0) {
        getBatchData(strong.map((s) => s.ticker))
          .then((batch) => {
            setSignalHealth(batch.financials);
            const analysts: Record<string, AnalystTrend> = {};
            Object.entries(batch.analyst_trends).forEach(([ticker, trends]) => {
              const current = trends.find(t => t.period === "0m") || trends[0];
              if (current) analysts[ticker] = current;
            });
            setSignalAnalyst(analysts);
          })
          .catch(() => {});

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
      .catch(() => {});
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
    const ratingScores = sortField === "rating"
      ? new Map(sourceItems.map(item => [item.ticker, getRatingScore(item, aData)]))
      : null;
    return [...sourceItems].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "rank": cmp = a.rank - b.rank; break;
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "price": cmp = a.price - b.price; break;
        case "health": cmp = (hData[a.ticker]?.health_score ?? -1) - (hData[b.ticker]?.health_score ?? -1); break;
        case "rating": cmp = (ratingScores!.get(a.ticker) ?? Infinity) - (ratingScores!.get(b.ticker) ?? Infinity); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const sortedItems = sortItems(items, healthData, analystData);
  const totalPages = Math.ceil(sortedItems.length / PAGE_SIZE);
  const paginatedItems = sortedItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
            leftTab === "watchlist" ? "bg-[#30363d] text-[#c9d1d9]" : "text-[#8b949e] hover:text-[#c9d1d9]"
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
            leftTab === "screeners" ? "bg-[#30363d] text-[#c9d1d9]" : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
          Screeners
          <span className="text-[9px] bg-[#21262d] text-[#8b949e] px-1.5 py-0.5 rounded-full">{SCREENERS.length}</span>
        </button>
        <button
          onClick={() => { setLeftTab("signals"); if (!signalScanned) scanSignals(); }}
          className={`tab-btn flex items-center gap-1.5 ${
            leftTab === "signals" ? "bg-[#30363d] text-[#c9d1d9]" : "text-[#8b949e] hover:text-[#c9d1d9]"
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
        <button
          onClick={() => setLeftTab("search")}
          className={`tab-btn flex items-center gap-1.5 ${
            leftTab === "search" ? "bg-[#30363d] text-[#c9d1d9]" : "text-[#8b949e] hover:text-[#c9d1d9]"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          Search
        </button>
      </div>

      {/* ── Signals Tab ── */}
      {leftTab === "signals" && (
        <SignalsTab
          signalResults={signalResults}
          signalLoading={signalLoading}
          signalSort={signalSort}
          setSignalSort={setSignalSort}
          signalHealth={signalHealth}
          signalChains={signalChains}
          signalAnalyst={signalAnalyst}
          positions={positions}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          removeFromWatchlist={removeFromWatchlist}
          setSelectedWatch={setSelectedWatch}
          setWatchDetailTab={setWatchDetailTab}
          scanSignals={scanSignals}
        />
      )}

      {/* ── Screeners Tab ── */}
      {leftTab === "screeners" && (
        <ScreenersTab
          activeScreener={activeScreener}
          loading={loading}
          error={error}
          items={items}
          healthData={healthData}
          analystData={analystData}
          sortField={sortField}
          sortDir={sortDir}
          toggleSort={toggleSort}
          paginatedItems={paginatedItems}
          totalPages={totalPages}
          page={page}
          setPage={setPage}
          sortedItemsLength={sortedItems.length}
          PAGE_SIZE={PAGE_SIZE}
          loadScreener={loadScreener}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          removeFromWatchlist={removeFromWatchlist}
          setSelectedWatch={setSelectedWatch}
          setWatchDetailTab={setWatchDetailTab}
          resultsRef={resultsRef}
          tableScrollRef={tableScrollRef}
        />
      )}

      {/* ── Search Tab ── */}
      {leftTab === "search" && (
        <SearchTab
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          searchLoading={searchLoading}
          searchAsItems={searchAsItems}
          searchHealthData={searchHealthData}
          searchAnalystData={searchAnalystData}
          sortField={sortField}
          sortDir={sortDir}
          toggleSort={toggleSort}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          removeFromWatchlist={removeFromWatchlist}
          setSelectedWatch={setSelectedWatch}
          setWatchDetailTab={setWatchDetailTab}
          tableScrollRef={tableScrollRef}
        />
      )}

      {/* ── Watchlist Tab ── */}
      {leftTab === "watchlist" && (
        <WatchlistTab
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          watchInput={watchInput}
          setWatchInput={setWatchInput}
          addToWatchlist={addToWatchlist}
          removeFromWatchlist={removeFromWatchlist}
          selectedWatch={selectedWatch}
          setSelectedWatch={setSelectedWatch}
          setWatchDetailTab={setWatchDetailTab}
          watchSortField={watchSortField}
          setWatchSortField={setWatchSortField}
          watchSortDir={watchSortDir}
          setWatchSortDir={setWatchSortDir}
          setWatchRefreshKey={setWatchRefreshKey}
          watchBatch={watchBatch}
          positions={positions}
          orders={orders}
        />
      )}

      {/* ── Trade Detail Modal ── */}
      {selectedWatch && (
        <TradeDetailModal
          ticker={selectedWatch}
          onClose={() => setSelectedWatch(null)}
          watchBatch={watchBatch}
          watchDetailTab={watchDetailTab}
          setWatchDetailTab={setWatchDetailTab}
          watchOptionsSubTab={watchOptionsSubTab}
          setWatchOptionsSubTab={setWatchOptionsSubTab}
          watchOptionsExp={watchOptionsExp}
          setWatchOptionsExp={setWatchOptionsExp}
          watchOptions={watchOptions}
          watchOptionsLoading={watchOptionsLoading}
          watchRecs={watchRecs}
          setWatchRecs={setWatchRecs}
          watchRecsLoading={watchRecsLoading}
          setWatchRecsLoading={setWatchRecsLoading}
          watchTechnicals={watchTechnicals}
          watchTechnicalsLoading={watchTechnicalsLoading}
          positions={positions}
          setPositions={setPositions}
          orders={orders}
          setOrders={setOrders}
          addOrder={addOrder}
          openCloseModal={openCloseModal}
        />
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
