"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { FinancialHealth } from "@/lib/types";
import { getFinancialHealth } from "@/lib/api";

interface HealthPopupContextValue {
  openHealthPopup: (ticker: string) => void;
}

const HealthPopupContext = createContext<HealthPopupContextValue>({
  openHealthPopup: () => {},
});

export function useHealthPopup() {
  return useContext(HealthPopupContext);
}

export function HealthPopupProvider({ children }: { children: React.ReactNode }) {
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, FinancialHealth>>({});
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef<Set<string>>(new Set());

  const openHealthPopup = useCallback((ticker: string) => {
    const t = ticker.toUpperCase();
    setActiveTicker(t);
    if (!cache[t] && !fetchingRef.current.has(t)) {
      fetchingRef.current.add(t);
      setLoading(true);
      getFinancialHealth([t])
        .then((data) => {
          setCache((prev) => ({ ...prev, ...data }));
        })
        .catch(() => {})
        .finally(() => {
          fetchingRef.current.delete(t);
          setLoading(false);
        });
    }
  }, [cache]);

  // Also prefetch when provider mounts — no-op, let individual opens fetch
  const close = useCallback(() => setActiveTicker(null), []);

  const health = activeTicker ? cache[activeTicker] : null;

  return (
    <HealthPopupContext.Provider value={{ openHealthPopup }}>
      {children}

      {/* Global health popup */}
      {activeTicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={close}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {loading && !health ? (
              <div className="flex items-center justify-center py-12 gap-2 text-[#8b949e] text-xs">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Loading…
              </div>
            ) : health ? (
              <>
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#21262d]">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-[#c9d1d9]">{activeTicker}</span>
                      <span className={`text-xs font-bold tabular-nums ${
                        health.health_score >= 80 ? "text-[#3fb950]" : health.health_score >= 65 ? "text-[#56d364]" : health.health_score >= 45 ? "text-[#d29922]" : health.health_score >= 25 ? "text-[#db6d28]" : "text-[#f85149]"
                      }`}>
                        {health.health_score}/100 · {health.verdict}
                      </span>
                    </div>
                    {health.name && (
                      <span className="text-xs text-[#8b949e]">{health.name}</span>
                    )}
                  </div>
                  <button onClick={close} className="text-[#484f58] hover:text-[#c9d1d9] transition">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
                  {(health.strengths.length > 0 || health.concerns.length > 0) ? (
                    <div className="space-y-4">
                      {health.strengths.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-[#3fb950] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Strengths
                          </h4>
                          <ul className="space-y-1.5">
                            {health.strengths.map((s, i) => (
                              <li key={i} className="text-xs text-[#c9d1d9] flex items-start gap-2 leading-relaxed">
                                <span className="text-[#3fb950] mt-0.5 shrink-0">•</span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {health.concerns.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-semibold text-[#d29922] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                            </svg>
                            Concerns
                          </h4>
                          <ul className="space-y-1.5">
                            {health.concerns.map((c, i) => (
                              <li key={i} className="text-xs text-[#c9d1d9] flex items-start gap-2 leading-relaxed">
                                <span className="text-[#d29922] mt-0.5 shrink-0">•</span>
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[#484f58] italic">No strengths or concerns identified.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-12 text-[#8b949e] text-xs">
                No data available for {activeTicker}
              </div>
            )}
          </div>
        </div>
      )}
    </HealthPopupContext.Provider>
  );
}
