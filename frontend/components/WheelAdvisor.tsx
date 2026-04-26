"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AnalystTrend,
  EarningsCalendar,
  EarningsResult,
  LlmPrompt,
  StockHolding,
  WheelRecommendation,
} from "@/lib/types";
import {
  getAnalystTrends,
  getEarningsCalendar,
  getEarningsHistory,
  getInventory,
  getRecommendations,
} from "@/lib/api";
import InventoryForm from "./InventoryForm";
import LlmAnalysis from "./LlmAnalysis";

export default function WheelAdvisor() {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [availableCash, setAvailableCash] = useState<number>(0);
  const [llmPrompt, setLlmPrompt] = useState<LlmPrompt | null>(null);
  const [recommendations, setRecommendations] = useState<WheelRecommendation[]>([]);
  const [earningsCalendar, setEarningsCalendar] = useState<Record<string, EarningsCalendar[]>>({});
  const [earningsHistory, setEarningsHistory] = useState<Record<string, EarningsResult[]>>({});
  const [analystTrends, setAnalystTrends] = useState<Record<string, AnalystTrend[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickersWithoutOptions, setTickersWithoutOptions] = useState<string[]>([]);
  const [selectedDteMax, setSelectedDteMax] = useState<number>(45);
  const [selectedDteMin, setSelectedDteMin] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<"inventory" | "ai">(
    "inventory",
  );

  // Ollama model list — fetched once, passed to LlmAnalysis
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ollama-models")
      .then((r) => r.json())
      .then((data: { models: string[] }) => {
        setOllamaModels(data.models ?? []);
      })
      .catch(() => setOllamaModels([]))
      .finally(() => setOllamaModelsLoading(false));
  }, []);

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

  async function runRecommendations() {
    const tickers = [...new Set(holdings.map((h) => h.ticker))];
    if (tickers.length === 0) {
      setError("Add tickers first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [result, earnings, history, trends] = await Promise.all([
        getRecommendations({
          inventory: { holdings },
          tickers,
          available_cash: availableCash > 0 ? availableCash : undefined,
          dte_min: selectedDteMin,
          dte_max: selectedDteMax,
        }),
        getEarningsCalendar(tickers).catch(() => ({} as Record<string, EarningsCalendar[]>)),
        getEarningsHistory(tickers).catch(() => ({} as Record<string, EarningsResult[]>)),
        getAnalystTrends(tickers).catch(() => ({} as Record<string, AnalystTrend[]>)),
      ]);
      setLlmPrompt(result.llm_prompt);
      setRecommendations(result.recommendations ?? []);
      setTickersWithoutOptions(result.tickers_without_options ?? []);
      setEarningsCalendar(earnings);
      setEarningsHistory(history);
      setAnalystTrends(trends);
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
    <div className="min-h-screen bg-[#0d1117]">
      {/* Header */}
      <header className="bg-[#161b22] border-b border-[#30363d] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <div className="w-7 h-7 bg-[#3fb950] rounded flex items-center justify-center">
            <svg className="w-4 h-4 text-[#0d1117]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#c9d1d9]">Wheel Advisor</h1>
            <p className="text-[10px] text-[#8b949e]">Options income strategy</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 pt-4">
        {/* Tab nav */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex bg-[#161b22] border border-[#30363d] rounded p-0.5">
            {(
              [
                { key: "inventory", label: "Portfolio" },
                { key: "ai", label: "Trade Desk" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                disabled={key === "ai" && !llmPrompt}
                className={`px-4 py-1.5 text-xs font-medium rounded transition ${
                  activeTab === key
                    ? "bg-[#30363d] text-[#c9d1d9]"
                    : "text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 disabled:cursor-not-allowed"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="pb-12">
          <div className={activeTab === "inventory" ? "" : "hidden"}>
            {error && (
              <p className="mb-4 text-[#f85149] text-xs font-medium bg-[#f8514915] px-3 py-1.5 rounded border border-[#f8514930]">{error}</p>
            )}

            <InventoryForm
              holdings={holdings}
              onChanged={refreshInventory}
              availableCash={availableCash}
              onCashChanged={setAvailableCash}
              onGenerate={runRecommendations}
              generating={loading}
              dteMin={selectedDteMin}
              dteMax={selectedDteMax}
              onDteRangeChanged={(min, max) => { setSelectedDteMin(min); setSelectedDteMax(max); }}
            />
          </div>

          <div className={activeTab === "ai" ? "" : "hidden"}>
            {llmPrompt && <LlmAnalysis prompt={llmPrompt} recommendations={recommendations} ollamaModels={ollamaModels} ollamaModelsLoading={ollamaModelsLoading} earningsCalendar={earningsCalendar} earningsHistory={earningsHistory} analystTrends={analystTrends} tickersWithoutOptions={tickersWithoutOptions} />}
          </div>
        </div>
      </div>
    </div>
  );
}
