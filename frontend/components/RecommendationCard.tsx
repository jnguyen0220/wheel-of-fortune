"use client";

import type { WheelRecommendation } from "@/lib/types";

interface Props {
  rec: WheelRecommendation;
  rank: number;
}

const LEG_LABELS: Record<WheelRecommendation["leg"], string> = {
  cash_secured_put: "Cash-Secured Put",
  covered_call: "Covered Call",
};

const LEG_COLORS: Record<WheelRecommendation["leg"], string> = {
  cash_secured_put:
    "bg-purple-100 text-purple-700 border border-purple-200",
  covered_call: "bg-sky-100 text-sky-700 border border-sky-200",
};

export default function RecommendationCard({ rec, rank }: Props) {
  const { contract: c, leg } = rec;
  const mid = (c.bid + c.ask) / 2;
  const ivPct = (c.implied_volatility * 100).toFixed(0);

  const scoreColor =
    rec.quality_score >= 70
      ? "text-green-600"
      : rec.quality_score >= 50
      ? "text-yellow-600"
      : "text-red-500";

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-gray-300">
            #{rank}
          </span>
          <div>
            <p className="text-lg font-bold text-gray-900">{rec.ticker}</p>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LEG_COLORS[leg]}`}
            >
              {LEG_LABELS[leg]}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${scoreColor}`}>
            {rec.quality_score.toFixed(0)}
            <span className="text-xs font-normal text-gray-400">/100</span>
          </p>
          <p className="text-xs text-gray-400">Quality</p>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Metric label="Strike" value={`$${c.strike.toFixed(0)}`} />
        <Metric label="Expiry" value={c.expiration} />
        <Metric label="DTE" value={`${c.dte}d`} />
        <Metric label="Mid Premium" value={`$${mid.toFixed(2)}`} />
        <Metric
          label="Ann. ROC"
          value={`${rec.annualised_roc.toFixed(1)}%`}
          highlight
        />
        <Metric label="Delta" value={c.delta.toFixed(2)} />
        <Metric label="IV" value={`${ivPct}%`} />
        <Metric label="Theta" value={`$${c.theta.toFixed(3)}`} />
        <Metric label="Open Int." value={c.open_interest.toLocaleString()} />
      </div>

      {/* Rationale */}
      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          Engine Rationale
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">{rec.rationale}</p>
      </div>

      {rec.shares_held >= 100 && leg === "covered_call" && (
        <p className="mt-2 text-xs text-sky-600">
          ✓ You hold {rec.shares_held} shares — covered call eligible
        </p>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p
        className={`text-sm font-semibold ${highlight ? "text-green-600" : "text-gray-800"}`}
      >
        {value}
      </p>
    </div>
  );
}
