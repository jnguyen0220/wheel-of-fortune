"use client";

import { useState, useEffect, useMemo } from "react";
import type { OptionsChain, OptionsContract, EarningsCalendar, FinancialHealth } from "@/lib/types";
import { getFinancialHealth } from "@/lib/api";
import { healthScoreColor, earningsDotInfo, nextEarningsDays, earningsDaysColor, earningsDaysLabel } from "@/lib/format";
import TickerLink from "./TickerLink";

export interface StrategyFilters {
  dte_min: number;
  dte_max: number;
  min_open_interest: number;
  cc_delta_min: number;
  cc_delta_max: number;
  csp_delta_min: number;
  csp_delta_max: number;
  min_annualised_roc: number;
  max_annualised_roc: number;
}

export const DEFAULT_FILTERS: StrategyFilters = {
  dte_min: 14,
  dte_max: 45,
  min_open_interest: 100,
  cc_delta_min: 20,
  cc_delta_max: 35,
  csp_delta_min: 20,
  csp_delta_max: 35,
  min_annualised_roc: 12,
  max_annualised_roc: 120,
};

interface Props {
  chains: OptionsChain[];
  earningsCalendar?: Record<string, EarningsCalendar[]>;
}

export default function OptionsTab({ chains, earningsCalendar }: Props) {
  const [activeTicker, setActiveTicker] = useState<string>("");
  const [activeType, setActiveType] = useState<"CALL" | "PUT">("CALL");
  const [activeExpiration, setActiveExpiration] = useState<string>("");
  const [healthData, setHealthData] = useState<Record<string, FinancialHealth>>({});

  const sortedChains = useMemo(
    () => [...chains].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    [chains],
  );

  useEffect(() => {
    if (sortedChains.length > 0) {
      const tickers = sortedChains.map((c) => c.ticker);
      getFinancialHealth(tickers).then(setHealthData).catch(() => {});
    }
  }, [sortedChains]);

  useEffect(() => {
    if (sortedChains.length > 0 && !sortedChains.find((c) => c.ticker === activeTicker)) {
      setActiveTicker(sortedChains[0].ticker);
    }
  }, [sortedChains, activeTicker]);

  const activeChain = sortedChains.find((c) => c.ticker === activeTicker);

  const filteredContracts = useMemo(
    () => activeChain?.contracts.filter((c) => c.option_type === activeType) ?? [],
    [activeChain, activeType],
  );

  const sorted = useMemo(
    () =>
      [...filteredContracts].sort((a, b) =>
        activeType === "PUT" ? b.strike - a.strike : a.strike - b.strike,
      ),
    [filteredContracts, activeType],
  );

  const grouped = useMemo(() => {
    const g: Record<string, OptionsContract[]> = {};
    for (const c of sorted) {
      if (!g[c.expiration]) g[c.expiration] = [];
      g[c.expiration].push(c);
    }
    return g;
  }, [sorted]);

  const expirations = useMemo(
    () =>
      Object.keys(grouped).sort(
        (a, b) => (grouped[a][0]?.dte ?? 0) - (grouped[b][0]?.dte ?? 0),
      ),
    [grouped],
  );

  useEffect(() => {
    if (expirations.length > 0 && !expirations.includes(activeExpiration)) {
      setActiveExpiration(expirations[0]);
    }
  }, [expirations, activeExpiration]);

  const activeContracts = grouped[activeExpiration] ?? [];
  const activeDte = activeContracts[0]?.dte;
  const underlying = activeChain?.underlying_price ?? 0;

  // Summary stats for the active chain
  const totalCallContracts = activeChain?.contracts.filter((c) => c.option_type === "CALL").length ?? 0;
  const totalPutContracts = activeChain?.contracts.filter((c) => c.option_type === "PUT").length ?? 0;
  const putCallRatio = totalCallContracts > 0 ? (totalPutContracts / totalCallContracts).toFixed(2) : "—";

  if (chains.length === 0) {
    return (
      <section className="card-lg p-12 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#21262d] flex items-center justify-center">
          <svg className="w-6 h-6 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
        </div>
        <p className="text-[#8b949e] text-sm mb-1">No options data loaded</p>
        <p className="text-[#484f58] text-xs">
          Click <span className="text-[#58a6ff] font-medium">Option Chain</span> in the Portfolio tab to fetch live data.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Ticker tabs + summary stats ── */}
      <section className="card-lg">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          {/* Ticker selector */}
          <div className="flex items-center gap-2">
            {sortedChains.map((chain) => {
              const dot = earningsDotInfo(earningsCalendar, chain.ticker);
              return (
              <button
                key={chain.ticker}
                onClick={() => { setActiveTicker(chain.ticker); setActiveExpiration(""); }}
                className={activeTicker === chain.ticker
                    ? "ticker-tab-active text-[#c9d1d9]"
                    : "ticker-tab-inactive"
                }
                title={dot ? `Earnings in ${dot.days}d` : undefined}
              >
                {chain.ticker}
                {dot && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse opacity-90 ${dot.color}`} />
                )}
              </button>
              );
            })}
          </div>

          {/* Stats pills */}
          {activeChain && (
            <div className="flex items-center gap-3">
              <div className="stat-pill">
                <span className="stat-pill-label">Last</span>
                <span className="stat-pill-value">${underlying.toFixed(2)}</span>
              </div>
              {(() => {
                const health = healthData[activeTicker];
                if (!health) return null;
                return (
                  <div
                    className="stat-pill"
                  >
                    <span className="stat-pill-label">Health</span>
                    <span className={`text-xs font-bold tabular-nums ${healthScoreColor(health.health_score)}`}>{health.health_score}</span>
                  </div>
                );
              })()}
              {(() => {
                const total = activeChain.contracts.length;
                const color = total >= 500 ? "text-[#3fb950]" : total >= 200 ? "text-[#d29922]" : "text-[#f85149]";
                return (
                  <div className="stat-pill" title={`${total} contracts available`}>
                    <span className="stat-pill-label">Activity</span>
                    <span className={`text-xs font-bold tabular-nums ${color}`}>{total}</span>
                  </div>
                );
              })()}
              {(() => {
                const days = nextEarningsDays(earningsCalendar, activeTicker);
                if (days === undefined) return null;
                return (
                  <div className="stat-pill">
                    <span className="stat-pill-label">ER</span>
                    <span className={`text-xs font-bold tabular-nums ${earningsDaysColor(days)}`}>{earningsDaysLabel(days)}</span>
                  </div>
                );
              })()}
              <div className="stat-pill">
                <span className="stat-pill-label">P/C</span>
                <span className="stat-pill-value">{putCallRatio}</span>
              </div>
              <div className="stat-pill">
                <span className="text-[10px] text-[#238636] uppercase font-medium">Calls</span>
                <span className="text-xs font-medium text-[#8b949e] tabular-nums">{totalCallContracts}</span>
                <span className="text-[#30363d] mx-0.5">|</span>
                <span className="text-[10px] text-[#da3633] uppercase font-medium">Puts</span>
                <span className="text-xs font-medium text-[#8b949e] tabular-nums">{totalPutContracts}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Controls bar: Type toggle + Expiry + DTE slider + Recommendations ── */}
      <section className="card-lg">
        <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Call / Put toggle */}
          <div className="flex rounded-md overflow-hidden border border-[#30363d]">
            {(["CALL", "PUT"] as const).map((type_) => (
              <button
                key={type_}
                onClick={() => setActiveType(type_)}
                className={`px-4 py-1.5 text-xs font-semibold transition-all ${
                  activeType === type_
                    ? type_ === "CALL"
                      ? "bg-[#238636] text-white"
                      : "bg-[#da3633] text-white"
                    : "bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                {type_ === "CALL" ? "Calls" : "Puts"}
              </button>
            ))}
          </div>

          {/* Vertical divider */}
          <div className="w-px h-6 bg-[#30363d]" />

          {/* Expiry pills */}
          {expirations.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {expirations.map((exp) => {
                const dte = grouped[exp][0]?.dte;
                const isActive = activeExpiration === exp;
                return (
                  <button
                    key={exp}
                    onClick={() => setActiveExpiration(exp)}
                    className={`whitespace-nowrap px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      isActive
                        ? "bg-[#30363d] text-[#c9d1d9] ring-1 ring-[#484f58]"
                        : "text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
                    }`}
                  >
                    <span className="tabular-nums">{exp}</span>
                    <span className={`ml-1 text-[10px] tabular-nums ${isActive ? "text-[#58a6ff]" : "opacity-50"}`}>{dte}d</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Contract count badge */}
          <span className="text-[11px] text-[#484f58] tabular-nums">
            {filteredContracts.length} contracts
          </span>
        </div>
      </section>

      {/* ── No contracts message ── */}
      {expirations.length === 0 && activeChain && (
        <section className="card-lg p-8 text-center">
          <p className="text-[#8b949e] text-sm">
            No {activeType === "CALL" ? "call" : "put"} contracts found for <span className="font-semibold text-[#c9d1d9]">{activeTicker}</span>.
          </p>
        </section>
      )}

      {/* ── Options chain table ── */}
      {activeContracts.length > 0 && (
        <section className="card-lg">
          <div className="px-4 py-2.5 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${activeType === "CALL" ? "bg-[#238636]" : "bg-[#da3633]"}`} />
              <TickerLink ticker={activeTicker} className="text-xs font-semibold text-[#58a6ff] hover:underline cursor-pointer" />
              <span className="text-[#30363d]">·</span>
              <span className="text-xs text-[#8b949e]">{activeExpiration}</span>
              <span className="text-[#30363d]">·</span>
              <span className="text-xs text-[#8b949e] tabular-nums">{activeDte} DTE</span>
            </div>
            <span className="text-[11px] text-[#484f58] tabular-nums">{activeContracts.length} strike{activeContracts.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#0d1117]">
                  <th className="text-left px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">Strike</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">Bid</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">Ask</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">Last</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">Mid</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">Vol</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">OI</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">IV</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">&Delta;</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">&Theta;</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">&Gamma;</th>
                  <th className="text-right px-3 py-2 font-semibold text-[#8b949e] text-[11px] uppercase tracking-wider">Vega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {(() => {
                  const COL_COUNT = 12;
                  let priceRowInserted = false;
                  const rows: React.ReactNode[] = [];

                  activeContracts.forEach((c, i) => {
                    if (!priceRowInserted) {
                      const isOtm =
                        activeType === "CALL"
                          ? c.strike > underlying
                          : c.strike < underlying;
                      if (isOtm) {
                        priceRowInserted = true;
                        rows.push(
                          <tr key="__price__">
                            <td colSpan={COL_COUNT} className="px-0 py-0">
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1f6feb10]">
                                <div className="flex-1 h-px bg-[#1f6feb40]" />
                                <span className="text-[11px] font-bold text-[#58a6ff] tabular-nums whitespace-nowrap">${underlying.toFixed(2)}</span>
                                <div className="flex-1 h-px bg-[#1f6feb40]" />
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    }

                    const itm =
                      activeType === "CALL"
                        ? c.strike <= underlying
                        : c.strike >= underlying;
                    const mid = ((c.bid + c.ask) / 2);

                    rows.push(
                      <tr
                        key={`${c.strike}-${i}`}
                        className={`transition-colors ${
                          itm
                            ? "bg-[#d2992210] hover:bg-[#d2992220]"
                            : "hover:bg-[#1c2128]"
                        }`}
                      >
                        <td className="px-3 py-1.5 font-bold text-[#c9d1d9] tabular-nums">{c.strike.toFixed(2)}</td>
                        <td className="text-right px-3 py-1.5 text-[#3fb950] tabular-nums">{c.bid.toFixed(2)}</td>
                        <td className="text-right px-3 py-1.5 text-[#f85149] tabular-nums">{c.ask.toFixed(2)}</td>
                        <td className="text-right px-3 py-1.5 text-[#c9d1d9] tabular-nums">{c.last.toFixed(2)}</td>
                        <td className="text-right px-3 py-1.5 text-[#c9d1d9] tabular-nums font-medium">{mid.toFixed(2)}</td>
                        <td className="text-right px-3 py-1.5 text-[#8b949e] tabular-nums">{c.volume.toLocaleString()}</td>
                        <td className="text-right px-3 py-1.5 text-[#8b949e] tabular-nums">{c.open_interest.toLocaleString()}</td>
                        <td className="text-right px-3 py-1.5 text-[#d2a8ff] tabular-nums">{(c.implied_volatility * 100).toFixed(1)}%</td>
                        <td className="text-right px-3 py-1.5 text-[#8b949e] tabular-nums">{c.delta.toFixed(3)}</td>
                        <td className="text-right px-3 py-1.5 text-[#8b949e] tabular-nums">{c.theta.toFixed(3)}</td>
                        <td className="text-right px-3 py-1.5 text-[#8b949e] tabular-nums">{c.gamma.toFixed(4)}</td>
                        <td className="text-right px-3 py-1.5 text-[#8b949e] tabular-nums">{c.vega.toFixed(3)}</td>
                      </tr>
                    );
                  });

                  if (!priceRowInserted && activeContracts.length > 0) {
                    rows.push(
                      <tr key="__price__">
                        <td colSpan={COL_COUNT} className="px-0 py-0">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1f6feb10]">
                            <div className="flex-1 h-px bg-[#1f6feb40]" />
                            <span className="text-[11px] font-bold text-[#58a6ff] tabular-nums whitespace-nowrap">${underlying.toFixed(2)}</span>
                            <div className="flex-1 h-px bg-[#1f6feb40]" />
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return rows;
                })()}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
