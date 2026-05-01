"use client";

import { useState, useEffect, useMemo } from "react";
import type { NewsItem } from "@/lib/types";
import { getNews } from "@/lib/api";
import TickerLink from "./TickerLink";

interface StockNewsProps {
  onAddTicker: (ticker: string) => void;
  onAddTickers: (tickers: string[]) => void;
  onRemoveTicker?: (ticker: string) => void;
  existingTickers: string[];
}

export default function StockNews({ onAddTicker, onRemoveTicker, existingTickers }: StockNewsProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getNews()
      .then((items) => {
        if (!cancelled) setNews(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load news");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    for (const item of news) {
      const list = map.get(item.ticker) || [];
      if (list.length < 5) list.push(item);
      map.set(item.ticker, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [news]);

  function timeAgo(ts: number): string {
    const now = Date.now() / 1000;
    const diff = now - ts;
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  const existingSet = new Set(existingTickers.map(t => t.toUpperCase()));
  const activeArticles = activeTicker ? (grouped.find(([t]) => t === activeTicker)?.[1] || []) : [];

  const dateRangeLabel = useMemo(() => {
    if (news.length === 0) return "";
    const timestamps = news.map(n => n.published_at);
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    const fmt = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return min === max ? fmt(max) : `${fmt(min)} – ${fmt(max)}`;
  }, [news]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-[#8b949e] text-xs">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        Loading news…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-[#f85149] text-xs">{error}</div>
    );
  }

  if (news.length === 0) {
    return (
      <div className="text-center py-8 text-[#8b949e] text-xs">
        No recent news found.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold text-[#c9d1d9]">Stock News</h3>
        {dateRangeLabel && <span className="text-[10px] text-[#8b949e]">{dateRangeLabel}</span>}
      </div>
      <div className="flex gap-3 min-h-[300px]">
      {/* Master table */}
      <div className="w-[200px] shrink-0 border border-[#21262d] rounded overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#0d1117] border-b border-[#21262d]">
          <svg className="w-3 h-3 text-[#8b949e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
          <span className="text-[10px] font-semibold text-[#8b949e] uppercase flex-1">Ticker</span>
        </div>
        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {grouped.map(([ticker]) => (
            <div
              key={ticker}
              onClick={() => setActiveTicker(ticker)}
              className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition text-xs border-b border-[#21262d] last:border-b-0 ${
                activeTicker === ticker ? "bg-[#161b22]" : "hover:bg-[#0d1117]"
              }`}
            >
              <input
                type="checkbox"
                checked={existingSet.has(ticker)}
                onChange={(e) => { e.stopPropagation(); existingSet.has(ticker) ? onRemoveTicker?.(ticker) : onAddTicker(ticker); }}
                onClick={(e) => e.stopPropagation()}
                className="w-3 h-3 rounded border-[#30363d] bg-[#0d1117] text-[#3fb950] focus:ring-0 focus:ring-offset-0"
              />
              <span onClick={(e) => { e.stopPropagation(); setActiveTicker(ticker); }}>
                <TickerLink ticker={ticker} className="font-bold text-[11px] flex-1 text-[#58a6ff] hover:underline text-left" />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 border border-[#21262d] rounded overflow-hidden flex flex-col">
        {activeTicker ? (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-b border-[#21262d]">
              <span className="text-xs font-bold text-[#c9d1d9]">{activeTicker}</span>
              <span className="text-[10px] text-[#484f58]">{activeArticles.length} article{activeArticles.length !== 1 ? "s" : ""}</span>
              {!existingSet.has(activeTicker) && (
                <button
                  type="button"
                  onClick={() => onAddTicker(activeTicker)}
                  className="ml-auto text-[10px] font-medium text-[#58a6ff] hover:text-white transition"
                >
                  + Add to Portfolio
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#21262d]">
              {activeArticles.map((item, i) => (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 px-3 py-2.5 hover:bg-[#0d1117] transition group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#c9d1d9] group-hover:text-white leading-snug line-clamp-2 transition">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-[#8b949e] mt-0.5">
                      {item.publisher} · {timeAgo(item.published_at)}
                    </p>
                  </div>
                  <svg className="w-3 h-3 text-[#484f58] group-hover:text-[#8b949e] shrink-0 mt-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-[#8b949e] text-xs">
            Select a ticker to view articles
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
