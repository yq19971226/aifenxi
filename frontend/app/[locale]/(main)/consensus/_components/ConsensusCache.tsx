"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { mapConfidenceLabel } from "@/lib/utils/confidence";
import type { ConsensusReport } from "@/lib/api/consensus";
import { SIGNAL_COLORS, formatTimestamp } from "./consensus-config";
import { ModelCard } from "./ModelCard";
import { WeightDonut } from "./WeightDonut";
import { DivergenceGauge } from "./DivergenceGauge";
import { MinorityWarnings } from "./MinorityWarnings";

interface Props {
  report: ConsensusReport;
  canStart: boolean;
  onRefresh: () => void;
}

export function ConsensusCache({ report, canStart, onRefresh }: Props) {
  const t = useTranslations("consensus");
  const locale = useLocale();
  
  return (
    <div className="space-y-6 relative z-10">
      {/* Re-analyze from cache */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={!canStart}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={12} />
        {t("actions.refresh")}
      </button>

      {/* Consensus summary */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              {t("summary.consensusSignal")}
            </span>
            <span
              className={`text-3xl font-bold ${
                (SIGNAL_COLORS[report.consensus_signal] ?? SIGNAL_COLORS.neutral).text
              }`}
            >
              {t(`signals.${report.consensus_signal}`)}
            </span>
          </div>

          <div className="hidden sm:block h-12 w-px bg-white/[0.08]" />

          <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              {t("summary.consensusConfidence")}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-zinc-200">
                {(report.consensus_confidence * 100).toFixed(0)}%
              </span>
              <span className="text-xs text-zinc-500">
                {mapConfidenceLabel(report.consensus_confidence)}
              </span>
            </div>
          </div>

          <div className="hidden sm:block h-12 w-px bg-white/[0.08]" />

          <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              {t("summary.lastUpdate")}
            </span>
            <span className="font-mono text-sm text-zinc-400 mt-2">
              {formatTimestamp(report.timestamp, locale)}
            </span>
          </div>
        </div>
      </div>

      {/* Model cards 2x2 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 relative z-10">
        {report.model_votes.map((vote) => (
          <ModelCard key={vote.model_key} vote={vote} />
        ))}
      </div>

      {/* Weight donut + divergence */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 relative z-10">
        <WeightDonut weights={report.weights} />
        <DivergenceGauge divergence={report.divergence} />
      </div>

      {/* Minority warnings */}
      <div className="relative z-10">
        <MinorityWarnings warnings={report.minority_warnings} />
      </div>
    </div>
  );
}
