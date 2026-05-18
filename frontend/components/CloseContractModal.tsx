"use client";

import { useCallback, useRef, useState } from "react";
import type { OptionsOrder } from "@/lib/types";

interface CloseContractModalProps {
  order: OptionsOrder;
  onConfirm: (closePremium: number, closeDate: string) => void;
  onCancel: () => void;
}

export default function CloseContractModal({ order, onConfirm, onCancel }: CloseContractModalProps) {
  const [premiumInput, setPremiumInput] = useState("");
  const [closeDate, setCloseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const premiumRef = useRef<HTMLInputElement>(null);

  const handleConfirm = useCallback(() => {
    const cp = parseFloat(premiumInput);
    if (isNaN(cp) || cp < 0) return;
    onConfirm(cp, closeDate);
  }, [premiumInput, closeDate, onConfirm]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="border-b border-[#30363d] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f85149]/10 border border-[#f85149]/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#f85149]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#c9d1d9]">Close Contract</h2>
              <p className="text-[10px] text-[#8b949e] mt-0.5">Buy back or expire worthless</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-[#484f58] hover:text-[#c9d1d9] transition-colors p-1 rounded hover:bg-[#21262d]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contract Summary */}
        <div className="px-6 py-4 border-b border-[#21262d]">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Ticker</div>
              <div className="text-[12px] font-bold text-[#c9d1d9]">{order.ticker}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Type</div>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                order.leg === "CC"
                  ? "bg-[#58a6ff]/10 text-[#58a6ff] border border-[#58a6ff]/20"
                  : "bg-[#d2a8ff]/10 text-[#d2a8ff] border border-[#d2a8ff]/20"
              }`}>{order.leg === "CC" ? "Covered Call" : "Cash-Secured Put"}</span>
            </div>
            <div>
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Strike</div>
              <div className="text-[12px] font-bold text-[#c9d1d9] tabular-nums">${order.strike.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-1">Premium Sold</div>
              <div className="text-[12px] font-bold text-[#3fb950] tabular-nums">${order.premium.toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-[10px] text-[#8b949e]">
            <span>Expiration: <span className="text-[#c9d1d9] font-medium tabular-nums">{order.expiration}</span></span>
            <span>Contracts: <span className="text-[#c9d1d9] font-medium">{order.contracts}</span></span>
            <span>Total collected: <span className="text-[#3fb950] font-medium tabular-nums">${(order.premium * order.contracts * 100).toLocaleString()}</span></span>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-[#8b949e] uppercase tracking-wider font-medium mb-1.5">
                Buy-Back Premium <span className="normal-case tracking-normal text-[#484f58]">(per share)</span>
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#484f58]">$</span>
                <input
                  ref={premiumRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={premiumInput}
                  onChange={e => setPremiumInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
                  placeholder="0.00"
                  autoFocus
                  className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] text-[12px] text-[#c9d1d9] pl-6 pr-3 py-2 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 tabular-nums placeholder:text-[#30363d]"
                />
              </div>
              <p className="text-[9px] text-[#484f58] mt-1.5">Enter 0 if expired worthless</p>
            </div>
            <div>
              <label className="block text-[10px] text-[#8b949e] uppercase tracking-wider font-medium mb-1.5">Close Date</label>
              <input
                type="date"
                value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
                className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] text-[12px] text-[#c9d1d9] px-3 py-2 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 tabular-nums"
              />
            </div>
          </div>

          {/* P&L Preview */}
          {premiumInput !== "" && !isNaN(parseFloat(premiumInput)) && (
            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg px-4 py-3">
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider font-medium mb-2">P&L Preview</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[9px] text-[#8b949e]">Sold</div>
                  <div className="text-[11px] text-[#3fb950] font-bold tabular-nums">
                    ${(order.premium * order.contracts * 100).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-[#8b949e]">Buy-Back</div>
                  <div className="text-[11px] text-[#f85149] font-bold tabular-nums">
                    ${(parseFloat(premiumInput) * order.contracts * 100).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-[#8b949e]">Net P&L</div>
                  {(() => {
                    const net = (order.premium - parseFloat(premiumInput)) * order.contracts * 100;
                    return (
                      <div className={`text-[11px] font-bold tabular-nums ${net >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                        {net >= 0 ? "+" : ""}${net.toLocaleString()}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#30363d] px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setPremiumInput("0")}
            className="text-[10px] text-[#8b949e] hover:text-[#c9d1d9] transition-colors underline underline-offset-2"
          >
            Expired Worthless
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onCancel}
              className="rounded-lg border border-[#30363d] bg-transparent hover:bg-[#21262d] text-[11px] text-[#c9d1d9] font-medium px-4 py-2 transition-colors focus:outline-none"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={premiumInput === "" || isNaN(parseFloat(premiumInput)) || parseFloat(premiumInput) < 0}
              className="rounded-lg bg-[#f85149] hover:bg-[#f85149]/90 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] text-white font-semibold px-4 py-2 transition-colors focus:outline-none focus:ring-1 focus:ring-[#f85149]"
            >
              Close Contract
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
