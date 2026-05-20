"use client";

import { useCallback, useEffect, useState } from "react";
import type { PositionTransaction, OptionsOrder } from "@/lib/types";
import { useLocalStorageState } from "@/lib/hooks";
import { useContractExpiration } from "@/lib/useContractExpiration";
import DiscoveryTab from "./DiscoveryTab";
import MyPositionsTab from "./MyPositionsTab";
import MyContractsTab from "./MyContractsTab";
import { HealthPopupProvider } from "./HealthPopupContext";

function DisclaimerPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#161b22] border-b border-[#30363d] px-6 py-4 flex items-center gap-2 z-10">
          <svg className="w-5 h-5 text-[#d29922] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <h2 className="text-sm font-bold text-[#d29922] uppercase tracking-widest">Important Legal Disclaimer</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-[11px] text-[#8b949e] leading-relaxed">
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest mb-1.5">No Financial Advice</h4>
                <p>
                  This application is provided strictly for educational and informational purposes only. Nothing contained herein constitutes financial, investment, tax, or trading advice, nor any other form of professional advice. The data, analyses, options strategies, and recommendations presented should not be construed as a recommendation or solicitation to buy, sell, or hold any security, financial product, or instrument.
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest mb-1.5">Risk Disclosure</h4>
                <p>
                  Trading options and other financial instruments involves <strong className="text-[#f85149]">substantial risk of loss</strong> and is not suitable for all investors. Options are complex financial instruments and can result in the loss of your entire investment. Past performance is not indicative of future results. Consult with a qualified financial advisor before making any investment decisions.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest mb-1.5">No Warranty</h4>
                <p>
                  The creators, developers, and operators of this application make no representations or warranties, express or implied, regarding the accuracy, completeness, reliability, or timeliness of any information provided. Market data may be delayed or inaccurate. All information is provided &ldquo;as is&rdquo; without warranty of any kind.
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-[#c9d1d9] uppercase tracking-widest mb-1.5">Limitation of Liability</h4>
                <p>
                  By using this application, you acknowledge that: (a) you are solely responsible for your own investment decisions and any resulting gains or losses; (b) the creators and operators shall not be liable for any direct, indirect, incidental, consequential, or punitive damages; and (c) you use this application entirely at your own risk.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#21262d] text-[10px] text-[#6e7681] text-center space-y-1">
            <p>&copy; {new Date().getFullYear()} Wheel Advisor. For educational use only. Not a registered investment advisor.</p>
            <p className="text-[9px] uppercase tracking-wider">This application does not provide personalized investment advice</p>
          </div>
        </div>

        {/* Footer button */}
        <div className="sticky bottom-0 bg-[#161b22] border-t border-[#30363d] px-6 py-4 flex justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 text-xs font-semibold text-[#0d1117] bg-[#d29922] hover:bg-[#e3b341] rounded-lg transition-colors"
          >
            I Understand &amp; Accept
          </button>
        </div>
      </div>
    </div>
  );
}
export default function WheelAdvisor() {
  type TopTab = "explore" | "positions" | "contracts";
  const validTabs: TopTab[] = ["explore", "positions", "contracts"];
  const [activeTab, setActiveTab] = useState<TopTab>("explore");

  // Auto-close/assign expired contracts at the top level (always active)
  useContractExpiration();

  // Read positions & orders for badge counts
  const [badgePositions] = useLocalStorageState<Record<string, PositionTransaction[]>>("wof-positions", {});
  const [badgeOrders] = useLocalStorageState<OptionsOrder[]>("wof-orders", []);
  const openPositionCount = Object.values(badgePositions).filter(txns => {
    const buys = txns.filter(t => t.type === "buy").reduce((s, t) => s + t.quantity, 0);
    const sells = txns.filter(t => t.type === "sell").reduce((s, t) => s + t.quantity, 0);
    return buys - sells > 0;
  }).length;
  const openOrderCount = badgeOrders.filter(o => o.status === "open").length;

  const switchTab = useCallback((tab: TopTab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  }, []);

  // Sync tab from hash on mount and on popstate (back/forward)
  useEffect(() => {
    const syncHash = () => {
      const h = window.location.hash.replace("#", "") as TopTab;
      if (validTabs.includes(h)) setActiveTab(h);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("disclaimer_accepted");
    if (!accepted) {
      setDisclaimerOpen(true);
    }
  }, []);

  const handleDisclaimerClose = useCallback(() => {
    localStorage.setItem("disclaimer_accepted", "1");
    setDisclaimerOpen(false);
  }, []);

  return (
    <HealthPopupProvider>
    <div className="h-screen flex flex-col bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <header className="bg-[#161b22] border-b border-[#30363d] sticky top-0 z-20 shadow-sm shadow-black/20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-linear-to-br from-[#3fb950] to-[#2ea043] rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-4.5 h-4.5 text-[#0d1117]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#c9d1d9] tracking-tight">Wheel Advisor</h1>
              <p className="text-[10px] text-[#8b949e]">Options Income Strategy</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[9px] font-medium text-[#d29922] bg-[#d299220a] border border-[#d2992230] px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            Not financial advice. For educational and informational purposes only. <button onClick={() => setDisclaimerOpen(true)} className="underline underline-offset-2 hover:text-[#e3b341] transition-colors cursor-pointer">Read full disclaimer</button>
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col max-w-7xl w-full mx-auto px-6 pt-4">
        {/* Tab nav */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="tab-group">
            {([
                { key: "explore", label: "Explore", badge: 0, badgeColor: "" },
                { key: "positions", label: "My Positions", badge: openPositionCount, badgeColor: "bg-[#3fb950]/15 text-[#3fb950]" },
                { key: "contracts", label: "My Contracts", badge: openOrderCount, badgeColor: "bg-[#58a6ff]/10 text-[#58a6ff]" },
              ] as const
            ).map(({ key, label, badge, badgeColor }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={`tab-btn ${
                  activeTab === key
                    ? "bg-[#30363d] text-[#c9d1d9]"
                    : "text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {key === "explore" ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  ) : key === "positions" ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                    </svg>
                  )}
                  {label}
                  {badge > 0 && (
                    <span className={`min-w-[16px] h-[16px] inline-flex items-center justify-center rounded-full text-[8px] font-bold tabular-nums px-1.5 leading-none ${badgeColor}`}>
                      {badge}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 pb-2">
          <div className={`${activeTab === "explore" ? "flex flex-col" : "hidden"} h-full min-h-0`}>
            <DiscoveryTab />
          </div>

          {/* ── My Positions tab ── */}
          <div className={`${activeTab === "positions" ? "flex flex-col" : "hidden"} h-full min-h-0`}>
            <MyPositionsTab />
          </div>

          {/* ── My Contracts tab ── */}
          <div className={`${activeTab === "contracts" ? "flex flex-col" : "hidden"} h-full min-h-0`}>
            <MyContractsTab />
          </div>
        </div>
      </div>

      {/* Minimal footer */}
      <footer className="mt-auto border-t border-[#21262d] py-3">
        <p className="text-center text-[10px] text-[#6e7681]">
          &copy; {new Date().getFullYear()} Wheel Advisor &middot; For educational use only &middot;{" "}
          <button onClick={() => setDisclaimerOpen(true)} className="underline underline-offset-2 hover:text-[#8b949e] transition-colors cursor-pointer">
            Legal Disclaimer
          </button>
        </p>
      </footer>

      {/* Disclaimer popup */}
      <DisclaimerPopup open={disclaimerOpen} onClose={handleDisclaimerClose} />
    </div>
    </HealthPopupProvider>
  );
}
