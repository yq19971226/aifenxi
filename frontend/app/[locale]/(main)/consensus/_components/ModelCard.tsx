"use client";

import { useTranslations } from "next-intl";
import type { ModelVote } from "@/lib/api/consensus";
import { mapConfidenceLabel } from "@/lib/utils/confidence";
import { MODEL_COLORS, MODEL_NAMES, SIGNAL_COLORS } from "./consensus-config";
import { localizeText } from "@/components/analysis/helpers";

export function ModelCard({ vote }: { vote: ModelVote }) {
  const t = useTranslations("consensus");
  const colors = MODEL_COLORS[vote.model_key] ?? MODEL_COLORS.deepseek;
  const name = MODEL_NAMES[vote.model_key] ?? vote.model_key;
  const sigStyle = SIGNAL_COLORS[vote.signal] ?? SIGNAL_COLORS.neutral;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-1 h-4 rounded-full ${colors.bg}`} />
          <span className={`text-sm font-semibold ${colors.text}`}>{name}</span>
        </div>
        <span
          className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold ${sigStyle.text} ${sigStyle.bg}`}
        >
          {t(`signals.${vote.signal}`)}
        </span>
      </div>
      
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          {t("modelCard.confidence")}
        </span>
        <span className="font-mono text-xl font-bold text-zinc-200">
          {(vote.confidence * 100).toFixed(0)}%
        </span>
        <span className="text-xs text-zinc-500">
          {mapConfidenceLabel(vote.confidence)}
        </span>
      </div>
      
      {vote.reasoning && (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400 line-clamp-3">
          {localizeText(vote.reasoning)}
        </p>
      )}
      
      {vote.key_findings.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <ul className="space-y-1.5">
            {vote.key_findings.slice(0, 3).map((f, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${colors.bg}`}
                />
                <span className="line-clamp-2 leading-relaxed">{localizeText(f)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
