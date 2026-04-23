"use client";

import { useState } from "react";

const POPULAR_TICKERS = ["AAPL", "MSFT", "TSLA", "NVDA", "AMZN", "GOOGL", "META", "SPY"];

interface Props {
  selected: string[];
  onChange: (tickers: string[]) => void;
}

export default function TickerSelector({ selected, onChange }: Props) {
  const [input, setInput] = useState("");

  function toggle(ticker: string) {
    console.log("Toggling ticker:", ticker, "Current selected:", selected);
    if (selected.includes(ticker)) {
      const updated = selected.filter((t) => t !== ticker);
      console.log("Removing ticker, new list:", updated);
      onChange(updated);
    } else {
      const updated = [...selected, ticker];
      console.log("Adding ticker, new list:", updated);
      onChange(updated);
    }
  }

  function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const ticker = input.trim().toUpperCase();
    console.log("Adding ticker:", ticker, "Current selected:", selected);
    
    if (ticker.length === 0) {
      console.log("Empty ticker, skipping");
      return;
    }
    
    if (selected.includes(ticker)) {
      console.log("Ticker already selected");
      alert(`${ticker} is already selected`);
      return;
    }
    
    const newTickers = [...selected, ticker];
    console.log("New tickers array:", newTickers);
    onChange(newTickers);
    setInput("");
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-2xl font-bold text-slate-900">
          📊 Select Tickers
        </h2>
      </div>
      <p className="text-sm text-slate-500 mb-6 font-medium">
        Choose which stocks to analyze for options opportunities
      </p>

      {/* Selected Tickers Display */}
      {selected.length > 0 && (
        <div className="mb-8 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl">
          <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest mb-3">
            Selected Tickers ({selected.length})
          </p>
          <div className="flex flex-wrap gap-2.5">
            {selected.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white border border-indigo-700 text-sm font-bold px-4 py-2 rounded-full shadow-md"
              >
                {t}
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  className="hover:opacity-80 leading-none font-bold text-lg"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Popular picks */}
      <div className="mb-7">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">
          Popular
        </p>
        <div className="flex flex-wrap gap-2.5">
          {POPULAR_TICKERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition ${
                selected.includes(t)
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Custom input */}
      <div className="mt-8">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">
          Add Custom Ticker
        </p>
        <form onSubmit={addCustom} className="flex gap-3">
          <input
            required
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="NVDA, GOOGL, COIN..."
            maxLength={6}
            className="flex-1 border border-slate-300 rounded-lg px-4 py-3 text-sm uppercase font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold px-8 py-3 rounded-lg transition shadow-md hover:shadow-lg whitespace-nowrap"
          >
            + Add
          </button>
        </form>
      </div>
    </div>
  );
}
