"use client";

import { useHealthPopup } from "./HealthPopupContext";

interface TickerLinkProps {
  ticker: string;
  className?: string;
}

export default function TickerLink({ ticker, className }: TickerLinkProps) {
  const { openHealthPopup } = useHealthPopup();
  return (
    <button
      type="button"
      onClick={() => openHealthPopup(ticker)}
      className={className ?? "text-[#58a6ff] hover:underline font-bold cursor-pointer"}
    >
      {ticker}
    </button>
  );
}
