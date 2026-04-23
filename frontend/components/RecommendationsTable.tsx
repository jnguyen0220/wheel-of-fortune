"use client";

import { useState, useEffect } from "react";
import type { WheelRecommendation, StockMarketData } from "@/lib/types";

interface Props {
  recommendations: WheelRecommendation[];
  marketData: Record<string, StockMarketData>;
}

const LEG_LABELS: Record<WheelRecommendation["leg"], string> = {
  cash_secured_put: "Cash-Secured Put",
  covered_call: "Covered Call",
};

const LEG_COLORS: Record<WheelRecommendation["leg"], string> = {
  cash_secured_put: "bg-purple-100 text-purple-700 border border-purple-300",
  covered_call: "bg-cyan-100 text-cyan-700 border border-cyan-300",
};

export default function RecommendationsTable({ recommendations, marketData }: Props) {
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());
  const [activeLegTab, setActiveLegTab] = useState<Record<string, string>>({});

  // Group by ticker, then by leg
  const groupedData = recommendations.reduce(
    (acc, rec) => {
      if (!acc[rec.ticker]) {
        acc[rec.ticker] = {};
      }
      if (!acc[rec.ticker][rec.leg]) {
        acc[rec.ticker][rec.leg] = [];
      }
      acc[rec.ticker][rec.leg].push(rec);
      return acc;
    },
    {} as Record<string, Record<string, WheelRecommendation[]>>
  );

  // Auto-expand all tickers whenever the recommendations change
  useEffect(() => {
    const tickers = Object.keys(groupedData);
    if (tickers.length === 0) return;
    const timer = setTimeout(() => {
      setExpandedTickers(new Set(tickers));
      setActiveLegTab((prev) => {
        const next = { ...prev };
        const LEG_ORDER: WheelRecommendation["leg"][] = ["cash_secured_put", "covered_call"];
        tickers.forEach((ticker) => {
          if (!next[ticker]) {
            const available = Object.keys(groupedData[ticker]) as WheelRecommendation["leg"][];
            next[ticker] = LEG_ORDER.find((l) => available.includes(l)) ?? available[0];
          }
        });
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [groupedData]);

  const toggleTicker = (ticker: string) => {
    const newSet = new Set(expandedTickers);
    if (newSet.has(ticker)) {
      newSet.delete(ticker);
    } else {
      newSet.add(ticker);
      // Set default active leg for this ticker
      if (!activeLegTab[ticker]) {
        const available = Object.keys(groupedData[ticker]) as WheelRecommendation["leg"][];
        const LEG_ORDER: WheelRecommendation["leg"][] = ["cash_secured_put", "covered_call"];
        const defaultLeg = LEG_ORDER.find((l) => available.includes(l)) ?? available[0];
        setActiveLegTab((prev) => ({ ...prev, [ticker]: defaultLeg }));
      }
    }
    setExpandedTickers(newSet);
  };

  const setLegTab = (ticker: string, leg: string) => {
    setActiveLegTab((prev) => ({ ...prev, [ticker]: leg }));
  };

  let rankCounter = 1;

  return (
    <div className="space-y-4">
      {Object.entries(groupedData).map(([ticker, legGroups]) => (
        <div key={ticker} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
          {/* Ticker Level */}
          <button
            onClick={() => toggleTicker(ticker)}
            className="w-full bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-100 hover:from-indigo-100 hover:via-blue-100 hover:to-indigo-200 px-8 py-5 flex items-center justify-between transition-colors border-b border-indigo-200"
          >
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold text-indigo-500 w-6 text-center">
                {expandedTickers.has(ticker) ? "−" : "+"}
              </span>
              <div className="text-left">
                <span className="text-2xl font-bold text-indigo-900">{ticker}</span>
                {Object.entries(legGroups).sort(([a], [b]) => {
                  const order: WheelRecommendation["leg"][] = ["cash_secured_put", "covered_call"];
                  return order.indexOf(a as WheelRecommendation["leg"]) - order.indexOf(b as WheelRecommendation["leg"]);
                }).map(([leg, recs]) => (
                  <span key={leg} className={`text-xs ml-2 font-semibold px-2 py-0.5 rounded-full ${
                    leg === "cash_secured_put"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-cyan-100 text-cyan-700"
                  }`}>
                    {leg === "cash_secured_put" ? "CSP" : "CC"} {recs.length}
                  </span>
                ))}
              </div>
            </div>

            {/* Market Data Display */}
            {marketData[ticker] && (
              <div className="flex items-center gap-6 text-xs ml-4">
                <div className="text-right">
                  <p className="text-indigo-400 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Price</p>
                  <p className="font-bold text-indigo-900 text-base tabular-nums">${marketData[ticker].price.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-indigo-400 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Low</p>
                  <div className="flex flex-col items-end gap-0.5 tabular-nums font-medium">
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">52W</span>
                      ${marketData[ticker].week52_low.toFixed(2)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-orange-500">
                      <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">Day</span>
                      ${marketData[ticker].daily_low.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-indigo-400 text-[10px] font-semibold uppercase tracking-widest mb-0.5">High</p>
                  <div className="flex flex-col items-end gap-0.5 tabular-nums font-medium">
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">52W</span>
                      ${marketData[ticker].week52_high.toFixed(2)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">Day</span>
                      ${marketData[ticker].daily_high.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </button>

          {/* Leg Tabs & Options Table */}
          {expandedTickers.has(ticker) && (
            <div>
              {/* Tab Bar */}
              <div className="flex gap-1 bg-slate-100 px-6 pt-4 border-b border-slate-200">
                {(Object.entries(legGroups) as [WheelRecommendation["leg"], WheelRecommendation[]][]).sort(([a], [b]) => {
                  const order: WheelRecommendation["leg"][] = ["cash_secured_put", "covered_call"];
                  return order.indexOf(a) - order.indexOf(b);
                }).map(([leg, recs]) => {
                  const isActive = activeLegTab[ticker] === leg;
                  return (
                    <button
                      key={leg}
                      onClick={() => setLegTab(ticker, leg)}
                      className={`px-4 py-3 text-sm font-semibold rounded-t-lg transition ${
                        isActive
                          ? `${LEG_COLORS[leg as WheelRecommendation["leg"]]} shadow-md`
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                      }`}
                    >
                      {LEG_LABELS[leg as WheelRecommendation["leg"]]}
                      <span className="ml-1.5 opacity-70">
                        ({recs.length} strike{recs.length !== 1 ? "s" : ""})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* CSP Cash Allocated Summary */}
              {activeLegTab[ticker] === "cash_secured_put" && legGroups["cash_secured_put"] && (() => {
                const totalCash = legGroups["cash_secured_put"].reduce(
                  (sum, rec) => sum + rec.contract.strike * 100 * rec.contracts_allocated,
                  0
                );
                return (
                  <div className="bg-purple-50 border-b border-purple-200 px-6 py-2 flex items-center gap-2 text-sm">
                    <span className="text-purple-500 font-semibold uppercase tracking-wide text-[10px]">Cash Required</span>
                    <span className="font-bold text-purple-900 tabular-nums">
                      ${totalCash.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-purple-400 text-xs">(if all {legGroups["cash_secured_put"].length} executed — pick one per ticker)</span>
                  </div>
                );
              })()}

              {/* Active Leg Table */}
              {activeLegTab[ticker] && legGroups[activeLegTab[ticker]] && (
                <div className="bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-300">
                        <tr>
                          <th className="px-6 py-3 text-left font-bold text-slate-700">
                            Rank
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Strike
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Contracts
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Expiry
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            DTE
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Mid
                          </th>
                          {activeLegTab[ticker] === "cash_secured_put" && (
                            <th className="px-6 py-3 text-right font-bold text-slate-700">
                              Collateral
                            </th>
                          )}
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Ann. ROC
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Delta
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            IV
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Theta
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Open Int.
                          </th>
                          <th className="px-6 py-3 text-right font-bold text-slate-700">
                            Quality
                          </th>
                          <th className="px-6 py-3 text-left font-bold text-slate-700">
                            Rationale
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {legGroups[activeLegTab[ticker]].map((rec, recIndex) => {
                          const { contract: c, leg } = rec;
                          const mid = (c.bid + c.ask) / 2;
                          const ivPct = (c.implied_volatility * 100).toFixed(0);

                          const scoreColor =
                            rec.quality_score >= 70
                              ? "text-green-600 font-bold"
                              : rec.quality_score >= 50
                              ? "text-amber-600 font-bold"
                              : "text-red-600 font-bold";

                          const rowRank = rankCounter++;

                          return (
                            <tr
                              key={`${ticker}-${leg}-${c.strike}-${recIndex}`}
                              className="hover:bg-slate-50 transition-colors"
                            >
                              <td className="px-6 py-3 font-bold text-slate-400">
                                #{rowRank}
                              </td>
                              <td className="px-6 py-3 text-right text-slate-800 font-bold">
                                ${c.strike.toFixed(2)}
                              </td>
                              <td className="px-6 py-3 text-right font-bold">
                                <span className="inline-flex items-center gap-1 text-indigo-700">
                                  {rec.contracts_allocated}
                                  <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide">×100</span>
                                </span>
                              </td>
                              <td className="px-6 py-3 text-right text-slate-700 font-medium">
                                {c.expiration}
                              </td>
                              <td className="px-6 py-3 text-right text-slate-700 font-bold">
                                {c.dte}d
                              </td>
                              <td className="px-6 py-3 text-right text-slate-700 font-medium">
                                ${mid.toFixed(2)}
                              </td>
                              {leg === "cash_secured_put" && (
                                <td className="px-6 py-3 text-right text-purple-700 font-semibold tabular-nums">
                                  <div>${(c.strike * 100 * rec.contracts_allocated).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                  <div className="text-[10px] font-normal text-purple-400">${c.strike.toFixed(2)} × {rec.contracts_allocated} × 100</div>
                                </td>
                              )}
                              <td className="px-6 py-3 text-right font-bold text-indigo-600">
                                {rec.annualised_roc.toFixed(1)}%
                              </td>
                              <td className="px-6 py-3 text-right text-slate-700 font-medium">
                                {c.delta.toFixed(2)}
                              </td>
                              <td className="px-6 py-3 text-right text-slate-700 font-medium">
                                {ivPct}%
                              </td>
                              <td className="px-6 py-3 text-right text-slate-700 font-medium">
                                ${c.theta.toFixed(3)}
                              </td>
                              <td className="px-6 py-3 text-right text-slate-700 font-medium">
                                {c.open_interest.toLocaleString()}
                              </td>
                              <td
                                className={`px-6 py-3 text-right text-lg ${scoreColor}`}
                              >
                                {rec.quality_score.toFixed(0)}/100
                              </td>
                              <td className="px-6 py-3 text-slate-600 text-xs max-w-xs line-clamp-2 font-medium">
                                {rec.rationale}
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
          )}
        </div>
      ))}
    </div>
  );
}
