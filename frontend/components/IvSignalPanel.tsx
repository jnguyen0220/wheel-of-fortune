"use client";

import React from "react";
import type { IvSignal } from "@/lib/types";

interface IvSignalPanelProps {
  signal: IvSignal | null;
  loading: boolean;
}

export default function IvSignalPanel({ signal, loading }: IvSignalPanelProps) {
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
        <p className="text-[10px] text-[#484f58]">No IV signal detected</p>
        <p className="text-[9px] text-[#30363d] mt-1">Insufficient data for IV analysis</p>
      </div>
    );
  }

  const score = signal.premium_score;
  const isActionable = score >= 50;
  const legLabel = signal.favored_leg === "csp" ? "CSP" : signal.favored_leg === "cc" ? "CC" : "CSP / CC";
  const regimeLabel = signal.regime === "range_bound" ? "Range-Bound" : signal.regime === "trending" ? "Trending" : "Volatile";
  const actionColor = isActionable ? (signal.favored_leg === "csp" ? "text-[#d29922]" : signal.favored_leg === "cc" ? "text-[#58a6ff]" : "text-[#3fb950]") : "text-[#8b949e]";
  const actionBg = isActionable
    ? (signal.favored_leg === "csp" ? "bg-[#d29922]/10 border-[#d29922]/30" : signal.favored_leg === "cc" ? "bg-[#58a6ff]/10 border-[#58a6ff]/30" : "bg-[#3fb950]/10 border-[#3fb950]/30")
    : "bg-[#21262d] border-[#30363d]";
  const strengthPct = score;
  const strengthColor = score >= 70 ? "bg-[#3fb950]" : score >= 50 ? "bg-[#d29922]" : "bg-[#f85149]";

  return (
    <div className="space-y-4">
      {/* Signal header */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${actionBg}`}>
        <div className="flex-1">
          <div className={`text-[11px] font-bold uppercase tracking-wide ${actionColor}`}>
            {isActionable ? `Sell ${legLabel}` : "Hold — Low IV"}
          </div>
          <div className="text-[9px] text-[#8b949e] mt-0.5">
            {isActionable ? signal.action : "IV conditions unfavorable for premium selling"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-bold text-[#f0f6fc] tabular-nums">{Math.round(score)}</div>
          <div className="text-[8px] text-[#484f58] uppercase">Score</div>
        </div>
      </div>

      {/* Score bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-[#8b949e]">Premium Score</span>
          <span className="text-[10px] font-bold text-[#f0f6fc] tabular-nums">{Math.round(score)}/100</span>
        </div>
        <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: `${strengthPct}%` }} />
        </div>
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#161b22] rounded-lg p-2.5 border border-[#21262d]">
          <div className="text-[8px] text-[#484f58] uppercase mb-1">IV Rank</div>
          <div className="text-[13px] font-bold text-[#f0f6fc] tabular-nums">{Math.round(signal.iv_rank)}%</div>
        </div>
        <div className="bg-[#161b22] rounded-lg p-2.5 border border-[#21262d]">
          <div className="text-[8px] text-[#484f58] uppercase mb-1">IV/HV Ratio</div>
          <div className="text-[13px] font-bold text-[#f0f6fc] tabular-nums">{signal.iv_hv_ratio.toFixed(2)}</div>
        </div>
        <div className="bg-[#161b22] rounded-lg p-2.5 border border-[#21262d]">
          <div className="text-[8px] text-[#484f58] uppercase mb-1">ATM IV</div>
          <div className="text-[13px] font-bold text-[#f0f6fc] tabular-nums">{(signal.atm_iv * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-[#161b22] rounded-lg p-2.5 border border-[#21262d]">
          <div className="text-[8px] text-[#484f58] uppercase mb-1">HV 20</div>
          <div className="text-[13px] font-bold text-[#f0f6fc] tabular-nums">{(signal.hv_20 * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-[#161b22] rounded-lg p-2.5 border border-[#21262d]">
          <div className="text-[8px] text-[#484f58] uppercase mb-1">Regime</div>
          <div className="text-[13px] font-bold text-[#f0f6fc]">{regimeLabel}</div>
        </div>
        <div className="bg-[#161b22] rounded-lg p-2.5 border border-[#21262d]">
          <div className="text-[8px] text-[#484f58] uppercase mb-1">RSI</div>
          <div className="text-[13px] font-bold text-[#f0f6fc] tabular-nums">{signal.rsi.toFixed(1)}</div>
        </div>
        <div className="bg-[#161b22] rounded-lg p-2.5 border border-[#21262d]">
          <div className="text-[8px] text-[#484f58] uppercase mb-1">Price vs SMA20</div>
          <div className={`text-[13px] font-bold tabular-nums ${signal.price >= signal.sma_20 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{((signal.price - signal.sma_20) / signal.sma_20 * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-[#161b22] rounded-lg p-2.5 border border-[#21262d]">
          <div className="text-[8px] text-[#484f58] uppercase mb-1">Price vs SMA50</div>
          <div className={`text-[13px] font-bold tabular-nums ${signal.price >= signal.sma_50 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{((signal.price - signal.sma_50) / signal.sma_50 * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* Criteria notes */}
      {signal.notes.length > 0 && (
        <div className="bg-[#161b22] rounded-lg p-3 border border-[#21262d]">
          <div className="text-[9px] text-[#484f58] uppercase font-bold mb-2">Signal Components ({signal.criteria_met}/5)</div>
          <ul className="space-y-1">
            {signal.notes.map((note, i) => {
              const isMet = /elevated|rich|overpriced|squeeze|consolidat|balanced|stable regime/i.test(note);
              return (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-[#8b949e]">
                  <span className={`mt-0.5 ${isMet ? "text-[#3fb950]" : "text-[#484f58]"}`}>{isMet ? "✓" : "○"}</span>
                  <span>{note}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
