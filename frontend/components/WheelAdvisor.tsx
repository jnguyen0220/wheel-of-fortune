"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  LlmPrompt,
  RecommendationResponse,
  StockHolding,
} from "@/lib/types";
import {
  getInventory,
  getMarketData,
  getRecommendations,
} from "@/lib/api";
import InventoryForm from "./InventoryForm";
import LlmAnalysis from "./LlmAnalysis";

export default function WheelAdvisor() {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [availableCash, setAvailableCash] = useState<number>(0);
  const [minPremiumAbs, setMinPremiumAbs] = useState<number>(0.25);
  const [minPremiumPct, setMinPremiumPct] = useState<number>(0.0015);
  const [watchlist, setWatchlist] = useState<{ ticker: string; price: number | null }[]>([]);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [llmPrompt, setLlmPrompt] = useState<LlmPrompt | null>(null);
  const [validStrikes, setValidStrikes] = useState<Record<string, Record<string, number[]>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inventory" | "ai">(
    "inventory",
  );

  const refreshInventory = useCallback(async () => {
    try {
      const inv = await getInventory();
      setHoldings(inv.holdings);
    } catch (err) {
      console.error("Failed to refresh inventory:", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshInventory();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshInventory]);

  async function addWatchlistTicker(e: React.FormEvent) {
    e.preventDefault();
    const tickers = watchlistInput
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;
    setWatchlistInput("");

    const newTickers = tickers.filter(
      t => !watchlist.some(w => w.ticker === t) && !holdings.some(h => h.ticker === t)
    );
    if (newTickers.length === 0) return;

    // Optimistically add all with null price, then fetch
    setWatchlist(prev => [...prev, ...newTickers.map(t => ({ ticker: t, price: null }))]);
    try {
      const data = await getMarketData(newTickers);
      setWatchlist(prev => prev.map(w => newTickers.includes(w.ticker) ? { ...w, price: data[w.ticker]?.price ?? null } : w));
    } catch {
      // leave price as null — not critical
    }
  }

  function removeWatchlistTicker(t: string) {
    setWatchlist(prev => prev.filter(w => w.ticker !== t));
  }

  async function runRecommendations() {
    const holdingTickers = holdings.map((h) => h.ticker);
    const tickers = [...new Set([...holdingTickers, ...watchlist.map(w => w.ticker)])];
    if (tickers.length === 0) {
      setError("Add holdings or watchlist tickers first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result: RecommendationResponse = await getRecommendations({
        inventory: { holdings },
        tickers,
        available_cash: availableCash,
        min_premium_abs: minPremiumAbs,
        min_premium_pct: minPremiumPct,
      });
      setLlmPrompt(result.llm_prompt);
      setValidStrikes(result.valid_strikes ?? {});
      setActiveTab("ai");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch recommendations",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow">
            <span className="text-white font-bold text-lg">💰</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Wheel Advisor</h1>
            <p className="text-xs text-slate-500 font-medium">Systematic options income strategy</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 pt-8">
        {/* Tab nav + run button in one row */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
            {(
              [
                { key: "inventory", label: "Portfolio Inventory", icon: "📋" },
                { key: "ai", label: "AI Analysis", icon: "🤖" },
              ] as const
            ).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                disabled={key === "ai" && !llmPrompt}
                className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition ${
                  activeTab === key
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                <span className="mr-1.5">{icon}</span>
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={runRecommendations}
            disabled={loading || (holdings.length === 0 && watchlist.length === 0)}
            className="ml-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-8 py-2.5 rounded-lg transition shadow disabled:shadow-none text-sm"
          >
            {loading ? "🔄 Generating…" : "✨ Generate Recommendations"}
          </button>

          {holdings.length === 0 && watchlist.length === 0 && (
            <p className="text-slate-400 text-sm">Add holdings or watchlist tickers first</p>
          )}
          {error && (
            <p className="text-red-600 text-sm font-semibold bg-red-50 px-4 py-2 rounded-lg border border-red-300">{error}</p>
          )}
        </div>

        {/* Tab content — always mounted, hidden via CSS to preserve state */}
        <div className="pb-20">
          <div className={activeTab === "inventory" ? "" : "hidden"}>
            <InventoryForm
              holdings={holdings}
              onChanged={refreshInventory}
              availableCash={availableCash}
              onCashChanged={setAvailableCash}
              minPremiumAbs={minPremiumAbs}
              minPremiumPct={minPremiumPct}
              onMinPremiumAbsChanged={setMinPremiumAbs}
              onMinPremiumPctChanged={setMinPremiumPct}
              watchlist={watchlist}
              watchlistInput={watchlistInput}
              onWatchlistInputChange={setWatchlistInput}
              onAddWatchlistTicker={addWatchlistTicker}
              onRemoveWatchlistTicker={removeWatchlistTicker}
            />
          </div>

          <div className={activeTab === "ai" ? "" : "hidden"}>
            {llmPrompt && <LlmAnalysis prompt={llmPrompt} autoRun={true} validStrikes={validStrikes} holdings={holdings} />}
          </div>
        </div>
      </div>
    </div>
  );
}
