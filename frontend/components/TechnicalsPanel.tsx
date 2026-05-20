"use client";

import React from "react";
import type { EmaPullbackSignal } from "@/lib/types";

interface TechnicalsPanelProps {
  signal: EmaPullbackSignal | null;
  loading: boolean;
}

export default function TechnicalsPanel({ signal, loading }: TechnicalsPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin w-5 h-5 border-2 border-[#30363d] border-t-[#58a6ff] rounded-full" />
      </div>
    );
  }
  if (!signal) {
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

  const sig = signal;
  const isCall = sig.direction === "call";

  // Determine action: only recommend selling when signal is strong enough (>=5 criteria)
  const isActionable = sig.criteria_met >= 5;
  const wheelAction = isActionable ? (isCall ? "Sell CSP" : "Sell CC") : "Hold — Do Nothing";
  const wheelDesc = isActionable
    ? (isCall ? "CSP-Favorable — Uptrend Pullback to Support" : "CC-Favorable — Downtrend Retrace to Resistance")
    : "Signal Too Weak — Wait for Better Setup";
  const wheelColor = isActionable ? (isCall ? "text-[#d29922]" : "text-[#58a6ff]") : "text-[#8b949e]";
  const wheelBg = isActionable
    ? (isCall ? "bg-[#d29922]/10 border-[#d29922]/30" : "bg-[#58a6ff]/10 border-[#58a6ff]/30")
    : "bg-[#21262d] border-[#30363d]";
  const strengthPct = (sig.criteria_met / 6) * 100;
  const strengthColor = sig.criteria_met >= 5 ? "bg-[#3fb950]" : sig.criteria_met >= 4 ? "bg-[#d29922]" : "bg-[#f85149]";

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

      {/* Price vs EMA comparison */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-3">
        <div className="text-[9px] text-[#8b949e] uppercase tracking-widest font-medium mb-2">Price vs Key Levels</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[9px] text-[#8b949e]">EMA20</div>
            <div className="text-[11px] text-[#c9d1d9] font-bold tabular-nums">${(sig.ema_20 ?? sig.ema_21).toFixed(2)}</div>
            <div className={`text-[9px] ${sig.price > (sig.ema_20 ?? sig.ema_21) ? "text-[#3fb950]" : "text-[#f85149]"}`}>
              {((sig.price - (sig.ema_20 ?? sig.ema_21)) / (sig.ema_20 ?? sig.ema_21) * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[#8b949e]">Price</div>
            <div className="text-[11px] text-[#c9d1d9] font-bold tabular-nums">${sig.price.toFixed(2)}</div>
            <div className="text-[9px] text-[#8b949e]">Current</div>
          </div>
          <div>
            <div className="text-[9px] text-[#8b949e]">EMA50</div>
            <div className="text-[11px] text-[#c9d1d9] font-bold tabular-nums">${sig.dma_50.toFixed(2)}</div>
            <div className={`text-[9px] ${sig.price > sig.dma_50 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
              {((sig.price - sig.dma_50) / sig.dma_50 * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Wheel context explanation */}
      <div className={`px-3 py-2 rounded-lg border ${!isActionable ? "bg-[#21262d] border-[#30363d]" : isCall ? "bg-[#3fb950]/5 border-[#3fb950]/20" : "bg-[#f85149]/5 border-[#f85149]/20"}`}>
        <p className="text-[10px] text-[#c9d1d9] leading-relaxed">
          {!isActionable
            ? `Only ${sig.criteria_met}/6 criteria met — not enough confluence to act. Hold current positions and wait for price to establish a clearer setup near EMA20 ($${(sig.ema_20 ?? sig.ema_21).toFixed(2)}).`
            : isCall
            ? "Stock is above EMA50 (uptrend) and pulling back to EMA20 support. Selling puts here means if assigned, you buy at a level that aligns with your 14-25 DTE contract window."
            : "Stock is below EMA50 (downtrend) and retracing to EMA20 resistance. Selling covered calls here means the stock is unlikely to rally through your strike within 14-25 days."}
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
          <div className="text-[9px] text-[#8b949e] uppercase tracking-widest mb-1">EMA50 (Trend)</div>
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
          <div className="text-[9px] text-[#8b949e] uppercase tracking-widest mb-1">EMA20 (Entry)</div>
          <div className="text-[12px] text-[#c9d1d9] font-bold tabular-nums">${(sig.ema_20 ?? sig.ema_21)?.toFixed(2) ?? "—"}</div>
          <div className="text-[9px] text-[#8b949e] mt-0.5">
            {sig.price > (sig.ema_20 ?? sig.ema_21 ?? 0) ? "Price above EMA20 — CSP-favorable" : "Price below EMA20 — CC-favorable"}
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
            const isPositive = note.startsWith("Price above") || note.startsWith("Price below") ||
              note.includes("sloping up") || note.includes("sloping down") ||
              note.includes("Pullback to") || note.includes("Retrace to") ||
              note.includes("Bounce candle confirmed") || note.includes("Rejection candle confirmed") ||
              (isCall ? note.includes("RSI") && note.includes("> 50") : note.includes("RSI") && note.includes("< 50")) ||
              note === "Volume increasing";
            void isPassed;
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
            ? `Don't sell CSPs if price loses EMA20 ($${(sig.ema_20 ?? sig.ema_21)?.toFixed(2) ?? "?"}) — the pullback has deepened past entry support and puts become risky.`
            : `Don't sell CCs if price reclaims EMA20 ($${(sig.ema_20 ?? sig.ema_21)?.toFixed(2) ?? "?"}) — the stock may be reversing upward and you risk assignment.`}
        </p>
      </div>
    </div>
  );
}
