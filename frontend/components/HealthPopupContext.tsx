"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import type {
  FinancialHealth,
  StockMarketData,
  EarningsCalendar,
  EarningsResult,
  AnalystTrend,
  NewsItem,
} from "@/lib/types";
import {
  getFinancialHealth,
  getMarketData,
  getEarningsCalendar,
  getEarningsHistory,
  getAnalystTrends,
  getNews,
} from "@/lib/api";

interface HealthPopupContextValue {
  openHealthPopup: (ticker: string) => void;
}

const HealthPopupContext = createContext<HealthPopupContextValue>({
  openHealthPopup: () => {},
});

export function useHealthPopup() {
  return useContext(HealthPopupContext);
}

type PopupTab = "summary" | "financials" | "price" | "earnings" | "analyst" | "news";

interface TickerData {
  health?: FinancialHealth;
  marketData?: StockMarketData;
  earningsCalendar?: EarningsCalendar[];
  earningsHistory?: EarningsResult[];
  analystTrends?: AnalystTrend[];
  news?: NewsItem[];
}

export function HealthPopupProvider({ children }: { children: React.ReactNode }) {
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PopupTab>("summary");
  const [cache, setCache] = useState<Record<string, TickerData>>({});
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef<Set<string>>(new Set());

  const openHealthPopup = useCallback((ticker: string) => {
    const t = ticker.toUpperCase();
    setActiveTicker(t);
    setActiveTab("summary");
    if (!cache[t] && !fetchingRef.current.has(t)) {
      fetchingRef.current.add(t);
      setLoading(true);
      Promise.all([
        getFinancialHealth([t]).catch(() => ({}) as Record<string, FinancialHealth>),
        getMarketData([t]).catch(() => ({}) as Record<string, StockMarketData>),
        getEarningsCalendar([t]).catch(() => ({}) as Record<string, EarningsCalendar[]>),
        getEarningsHistory([t]).catch(() => ({}) as Record<string, EarningsResult[]>),
        getAnalystTrends([t]).catch(() => ({}) as Record<string, AnalystTrend[]>),
        getNews([t]).catch(() => [] as NewsItem[]),
      ]).then(([healthData, marketData, earningsCal, earningsHist, analyst, news]) => {
        setCache((prev) => ({
          ...prev,
          [t]: {
            health: healthData[t],
            marketData: marketData[t],
            earningsCalendar: earningsCal[t] ?? [],
            earningsHistory: earningsHist[t] ?? [],
            analystTrends: analyst[t] ?? [],
            news: Array.isArray(news) ? news.filter((n) => n.ticker === t) : [],
          },
        }));
      }).finally(() => {
        fetchingRef.current.delete(t);
        setLoading(false);
      });
    }
  }, [cache]);

  const close = useCallback(() => setActiveTicker(null), []);

  const data = activeTicker ? cache[activeTicker] : null;
  const health = data?.health;

  const tabs: { key: PopupTab; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "financials", label: "Financials" },
    { key: "price", label: "Price" },
    { key: "earnings", label: "Earnings" },
    { key: "analyst", label: "Analyst" },
    { key: "news", label: "News" },
  ];

  return (
    <HealthPopupContext.Provider value={{ openHealthPopup }}>
      {children}

      {activeTicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={close}>
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            {loading && !data ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#8b949e]">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span className="text-xs">Loading data…</span>
              </div>
            ) : data ? (
              <>
                {/* Header */}
                <div className="bg-[#161b22] px-6 py-4 border-b border-[#21262d]">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center">
                        <span className="text-sm font-bold text-[#c9d1d9]">{activeTicker.slice(0, 2)}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-base font-bold text-[#f0f6fc] tracking-tight">{activeTicker}</h2>
                          {health && (
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              health.health_score >= 80 ? "bg-[#3fb950]/15 text-[#3fb950]" :
                              health.health_score >= 65 ? "bg-[#56d364]/15 text-[#56d364]" :
                              health.health_score >= 45 ? "bg-[#d29922]/15 text-[#d29922]" :
                              health.health_score >= 25 ? "bg-[#db6d28]/15 text-[#db6d28]" :
                              "bg-[#f85149]/15 text-[#f85149]"
                            }`}>
                              <span className="tabular-nums">{health.health_score}</span>
                              <span className="opacity-60">/100</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {health?.name && (
                            <span className="text-xs text-[#8b949e]">{health.name}</span>
                          )}
                          {health?.name && health?.verdict && <span className="text-[#30363d]">·</span>}
                          {health && (
                            <span className="text-xs text-[#8b949e]">{health.verdict}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={close} className="mt-0.5 p-1.5 rounded-md text-[#484f58] hover:text-[#c9d1d9] hover:bg-[#21262d] transition">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Quick stats row */}
                  {(data.marketData || health) && (
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#21262d]">
                      {data.marketData && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-bold text-[#f0f6fc] tabular-nums">${data.marketData.price.toFixed(2)}</span>
                        </div>
                      )}
                      {data.marketData && (
                        <>
                          <div className="h-4 w-px bg-[#21262d]" />
                          <div className="text-[10px] text-[#8b949e]">
                            <span className="text-[#484f58]">52W </span>
                            <span className="tabular-nums">${data.marketData.week52_low.toFixed(0)} – ${data.marketData.week52_high.toFixed(0)}</span>
                          </div>
                        </>
                      )}
                      {health?.trailing_pe != null && (
                        <>
                          <div className="h-4 w-px bg-[#21262d]" />
                          <div className="text-[10px] text-[#8b949e]">
                            <span className="text-[#484f58]">P/E </span>
                            <span className="tabular-nums">{health.trailing_pe.toFixed(1)}</span>
                          </div>
                        </>
                      )}
                      {health?.revenue_growth != null && (
                        <>
                          <div className="h-4 w-px bg-[#21262d]" />
                          <div className="text-[10px] text-[#8b949e]">
                            <span className="text-[#484f58]">Rev Growth </span>
                            <span className={`tabular-nums ${health.revenue_growth >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                              {health.revenue_growth >= 0 ? "+" : ""}{(health.revenue_growth * 100).toFixed(1)}%
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Tab navigation */}
                <div className="bg-[#0d1117] px-6 py-2.5 border-b border-[#21262d]">
                  <div className="flex bg-[#161b22] border border-[#30363d] rounded-md p-0.5">
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded transition-all whitespace-nowrap ${
                          activeTab === tab.key
                            ? "bg-[#30363d] text-[#f0f6fc] shadow-sm"
                            : "text-[#8b949e] hover:text-[#c9d1d9]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="px-6 py-5 max-h-[50vh] overflow-y-auto bg-[#0d1117]">
                  {activeTab === "summary" && <SummaryTab health={health} />}
                  {activeTab === "financials" && <FinancialsTab health={health} />}
                  {activeTab === "price" && <PriceTab marketData={data.marketData} />}
                  {activeTab === "earnings" && (
                    <EarningsTab calendar={data.earningsCalendar} history={data.earningsHistory} />
                  )}
                  {activeTab === "analyst" && <AnalystTab trends={data.analystTrends} />}
                  {activeTab === "news" && <NewsTab news={data.news} />}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-16 text-[#8b949e] text-xs">
                No data available for {activeTicker}
              </div>
            )}
          </div>
        </div>
      )}
    </HealthPopupContext.Provider>
  );
}

// ── Tab Components ───────────────────────────────────────────────────────────

function SummaryTab({ health }: { health?: FinancialHealth }) {
  if (!health) return <EmptyState>No summary data available.</EmptyState>;
  if (health.strengths.length === 0 && health.concerns.length === 0) {
    return <EmptyState>No strengths or concerns identified.</EmptyState>;
  }
  return (
    <div className="space-y-4">
      {health.strengths.length > 0 && (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <h4 className="text-[10px] font-semibold text-[#3fb950] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Strengths
          </h4>
          <ul className="space-y-2">
            {health.strengths.map((s, i) => (
              <li key={i} className="text-xs text-[#c9d1d9] flex items-start gap-2.5 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] mt-1.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {health.concerns.length > 0 && (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <h4 className="text-[10px] font-semibold text-[#d29922] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Concerns
          </h4>
          <ul className="space-y-2">
            {health.concerns.map((c, i) => (
              <li key={i} className="text-xs text-[#c9d1d9] flex items-start gap-2.5 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d29922] mt-1.5 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, fmt }: { label: string; value: number | null | undefined; fmt?: (v: number) => string }) {
  const formatted = value != null ? (fmt ? fmt(value) : value.toLocaleString()) : "—";
  return (
    <div className="flex justify-between items-center py-2 border-b border-[#21262d]/60 last:border-0">
      <span className="text-[11px] text-[#8b949e]">{label}</span>
      <span className="text-[11px] text-[#f0f6fc] font-medium tabular-nums">{formatted}</span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
      <h4 className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-8 text-xs text-[#484f58]">
      {children}
    </div>
  );
}

function FinancialsTab({ health }: { health?: FinancialHealth }) {
  if (!health) return <EmptyState>No financial data available.</EmptyState>;
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtM = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    return `$${v.toLocaleString()}`;
  };
  const fmtR = (v: number) => `${v.toFixed(2)}`;
  return (
    <div className="grid grid-cols-2 gap-3">
      <SectionCard title="Income">
        <MetricRow label="Revenue" value={health.revenue} fmt={fmtM} />
        <MetricRow label="Revenue Growth" value={health.revenue_growth} fmt={fmtPct} />
        <MetricRow label="Net Income" value={health.net_income} fmt={fmtM} />
        <MetricRow label="EPS" value={health.earnings_per_share} fmt={fmtR} />
      </SectionCard>
      <SectionCard title="Margins">
        <MetricRow label="Profit Margin" value={health.profit_margin} fmt={fmtPct} />
        <MetricRow label="Operating Margin" value={health.operating_margin} fmt={fmtPct} />
      </SectionCard>
      <SectionCard title="Balance Sheet">
        <MetricRow label="Total Cash" value={health.total_cash} fmt={fmtM} />
        <MetricRow label="Total Debt" value={health.total_debt} fmt={fmtM} />
        <MetricRow label="Debt/Equity" value={health.debt_to_equity} fmt={fmtR} />
        <MetricRow label="Current Ratio" value={health.current_ratio} fmt={fmtR} />
      </SectionCard>
      <SectionCard title="Returns & Cash Flow">
        <MetricRow label="ROE" value={health.return_on_equity} fmt={fmtPct} />
        <MetricRow label="ROA" value={health.return_on_assets} fmt={fmtPct} />
        <MetricRow label="Free Cash Flow" value={health.free_cash_flow} fmt={fmtM} />
        <MetricRow label="Op. Cash Flow" value={health.operating_cash_flow} fmt={fmtM} />
      </SectionCard>
      <div className="col-span-2">
        <SectionCard title="Valuation">
          <div className="grid grid-cols-2 gap-x-6">
            <MetricRow label="Trailing P/E" value={health.trailing_pe} fmt={fmtR} />
            <MetricRow label="Forward P/E" value={health.forward_pe} fmt={fmtR} />
            <MetricRow label="Price/Book" value={health.price_to_book} fmt={fmtR} />
            <MetricRow label="PEG Ratio" value={health.peg_ratio} fmt={fmtR} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function PriceTab({ marketData }: { marketData?: StockMarketData }) {
  if (!marketData) return <EmptyState>No price data available.</EmptyState>;
  const fmtPrice = (v: number) => `$${v.toFixed(2)}`;
  const pctOf52 = marketData.week52_high > marketData.week52_low
    ? ((marketData.price - marketData.week52_low) / (marketData.week52_high - marketData.week52_low) * 100)
    : 0;
  return (
    <div className="space-y-4">
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5 text-center">
        <div className="text-3xl font-bold text-[#f0f6fc] tabular-nums">{fmtPrice(marketData.price)}</div>
        <div className="text-[10px] text-[#484f58] mt-1 uppercase tracking-wider">Current Price</div>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
        <h4 className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-3">Today&apos;s Range</h4>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#8b949e] tabular-nums w-16 text-right">{fmtPrice(marketData.daily_low)}</span>
          <div className="flex-1 h-2 bg-[#21262d] rounded-full relative overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-linear-to-r from-[#21262d] to-[#58a6ff] rounded-full"
              style={{
                width: `${marketData.daily_high > marketData.daily_low
                  ? ((marketData.price - marketData.daily_low) / (marketData.daily_high - marketData.daily_low) * 100)
                  : 50}%`,
              }}
            />
          </div>
          <span className="text-[11px] text-[#8b949e] tabular-nums w-16">{fmtPrice(marketData.daily_high)}</span>
        </div>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
        <h4 className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-3">52-Week Range</h4>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#8b949e] tabular-nums w-16 text-right">{fmtPrice(marketData.week52_low)}</span>
          <div className="flex-1 h-2 bg-[#21262d] rounded-full relative overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-linear-to-r from-[#21262d] to-[#3fb950] rounded-full"
              style={{ width: `${pctOf52}%` }}
            />
          </div>
          <span className="text-[11px] text-[#8b949e] tabular-nums w-16">{fmtPrice(marketData.week52_high)}</span>
        </div>
        <p className="text-[10px] text-[#484f58] text-center mt-2.5">Position: {pctOf52.toFixed(0)}% from 52-week low</p>
      </div>
    </div>
  );
}

function EarningsTab({ calendar, history }: { calendar?: EarningsCalendar[]; history?: EarningsResult[] }) {
  const hasCalendar = calendar && calendar.length > 0;
  const hasHistory = history && history.length > 0;
  const sorted = hasHistory ? [...history!].sort((a, b) => b.report_date.localeCompare(a.report_date)) : [];
  if (!hasCalendar && !hasHistory) {
    return <EmptyState>No earnings data available.</EmptyState>;
  }

  // Compute streak
  let streak = 0;
  for (const e of sorted) {
    if (e.beat === true) streak++;
    else break;
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-2.5">
        {hasCalendar && (
          <div className="flex items-center gap-2 text-[11px]">
            <svg className="w-3.5 h-3.5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span className="text-[#8b949e]">Next:</span>
            <span className="text-[#f0f6fc] font-medium">{calendar![0].earnings_date}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              calendar![0].days_until <= 7 ? "bg-[#d29922]/15 text-[#d29922]" : "bg-[#21262d] text-[#8b949e]"
            }`}>
              in {calendar![0].days_until}d
            </span>
          </div>
        )}
        {streak > 0 && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[#3fb950] font-semibold">{streak} beat streak</span>
          </div>
        )}
      </div>

      {/* History table */}
      {hasHistory && (
        <div className="border border-[#21262d] rounded-lg overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-[#161b22] text-[10px] text-[#484f58] uppercase">
                <th className="text-left font-semibold px-3 py-2">Quarter</th>
                <th className="text-right font-semibold px-3 py-2">EPS Est</th>
                <th className="text-right font-semibold px-3 py-2">EPS Act</th>
                <th className="text-right font-semibold px-3 py-2">Surprise</th>
                <th className="text-center font-semibold px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 8).map((e, i) => (
                <tr key={i} className="border-t border-[#21262d]/60 hover:bg-[#161b22]/50">
                  <td className="px-3 py-1.5 text-[#c9d1d9] font-medium">{e.fiscal_quarter}</td>
                  <td className="px-3 py-1.5 text-right text-[#8b949e] tabular-nums">{e.eps_estimate != null ? `$${e.eps_estimate.toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-1.5 text-right text-[#c9d1d9] tabular-nums font-medium">{e.eps_actual != null ? `$${e.eps_actual.toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {e.eps_surprise != null ? (
                      <span className={e.eps_surprise >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>
                        {e.eps_surprise >= 0 ? "+" : ""}{e.eps_surprise.toFixed(2)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      e.beat === true ? "bg-[#3fb950]/15 text-[#3fb950]" :
                      e.beat === false ? "bg-[#f85149]/15 text-[#f85149]" :
                      "bg-[#21262d] text-[#484f58]"
                    }`}>
                      {e.beat === true ? "BEAT" : e.beat === false ? "MISS" : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnalystTab({ trends }: { trends?: AnalystTrend[] }) {
  if (!trends || trends.length === 0) {
    return <EmptyState>No analyst data available.</EmptyState>;
  }

  // Compute overall consensus from the most recent period
  const latest = trends[0];
  const totalLatest = latest.strong_buy + latest.buy + latest.hold + latest.sell + latest.strong_sell;
  const bullish = latest.strong_buy + latest.buy;
  const bearish = latest.sell + latest.strong_sell;
  const consensus = totalLatest > 0
    ? bullish / totalLatest >= 0.7 ? "Strong Buy"
    : bullish / totalLatest >= 0.5 ? "Buy"
    : bearish / totalLatest >= 0.5 ? "Sell"
    : bearish / totalLatest >= 0.7 ? "Strong Sell"
    : "Hold"
    : "N/A";
  const consensusColor = consensus === "Strong Buy" || consensus === "Buy"
    ? "text-[#3fb950]" : consensus === "Hold"
    ? "text-[#d29922]" : consensus === "N/A"
    ? "text-[#484f58]" : "text-[#f85149]";
  const bullPct = totalLatest > 0 ? ((bullish / totalLatest) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-3">
      {/* Compact consensus bar at top */}
      <div className="flex items-center gap-3 bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-2.5">
        <span className={`text-[11px] font-bold ${consensusColor}`}>{consensus}</span>
        <div className="flex-1 flex h-1.5 rounded-full overflow-hidden gap-px">
          {bullish > 0 && <div className="bg-[#3fb950] rounded-sm" style={{ width: `${bullPct}%` }} />}
          {latest.hold > 0 && <div className="bg-[#d29922] rounded-sm" style={{ width: `${((latest.hold / totalLatest) * 100).toFixed(0)}%` }} />}
          {bearish > 0 && <div className="bg-[#f85149] rounded-sm" style={{ width: `${((bearish / totalLatest) * 100).toFixed(0)}%` }} />}
        </div>
        <span className="text-[10px] text-[#8b949e] tabular-nums">{bullPct}% bullish</span>
        <span className="text-[10px] text-[#484f58]">·</span>
        <span className="text-[10px] text-[#484f58] tabular-nums">{totalLatest} analysts</span>
      </div>

      {/* Table */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Period</th>
              <th className="text-center py-2.5 px-2 text-[10px] font-semibold text-[#2ea043] uppercase tracking-wider">Strong Buy</th>
              <th className="text-center py-2.5 px-2 text-[10px] font-semibold text-[#3fb950] uppercase tracking-wider">Buy</th>
              <th className="text-center py-2.5 px-2 text-[10px] font-semibold text-[#d29922] uppercase tracking-wider">Hold</th>
              <th className="text-center py-2.5 px-2 text-[10px] font-semibold text-[#db6d28] uppercase tracking-wider">Sell</th>
              <th className="text-center py-2.5 px-2 text-[10px] font-semibold text-[#f85149] uppercase tracking-wider">Strong Sell</th>
              <th className="text-center py-2.5 px-3 text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody>
            {trends.map((t, i) => {
              const total = t.strong_buy + t.buy + t.hold + t.sell + t.strong_sell;
              return (
                <tr key={i} className="border-b border-[#21262d]/50 last:border-0 hover:bg-[#1c2128] transition-colors">
                  <td className="py-2 px-3 text-[#c9d1d9] font-medium">{t.period}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-[#2ea043] font-medium">{t.strong_buy || "—"}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-[#3fb950] font-medium">{t.buy || "—"}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-[#d29922] font-medium">{t.hold || "—"}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-[#db6d28] font-medium">{t.sell || "—"}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-[#f85149] font-medium">{t.strong_sell || "—"}</td>
                  <td className="py-2 px-3 text-center tabular-nums text-[#8b949e]">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewsTab({ news }: { news?: NewsItem[] }) {
  if (!news || news.length === 0) {
    return <EmptyState>No recent news available.</EmptyState>;
  }
  return (
    <div className="space-y-2">
      {news.slice(0, 8).map((item, i) => {
        const date = new Date(item.published_at * 1000);
        const ago = formatTimeAgo(date);
        return (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-[#161b22] border border-[#21262d] rounded-lg p-3.5 hover:border-[#30363d] hover:bg-[#1c2128] transition-all"
          >
            <div className="text-[11px] text-[#c9d1d9] leading-relaxed line-clamp-2 group-hover:text-[#f0f6fc] transition-colors">{item.title}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-medium text-[#8b949e]">{item.publisher}</span>
              <span className="w-1 h-1 rounded-full bg-[#30363d]" />
              <span className="text-[10px] text-[#484f58]">{ago}</span>
            </div>
          </a>
        );
      })}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
