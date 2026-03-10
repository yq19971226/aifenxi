"use client";

import { useTranslations } from "next-intl";

export function DivergenceGauge({ divergence }: { divergence: number }) {
  const t = useTranslations("consensus");
  const pct = Math.min(Math.max(divergence, 0), 100);
  const color =
    pct <= 30 ? "var(--color-bull)" : pct <= 60 ? "var(--color-warn)" : "var(--color-bear)";

  const getLabel = () => {
    if (pct <= 30) return t("divergence.highConsensus");
    if (pct <= 60) return t("divergence.someDisagreement");
    return t("divergence.severeDisagreement");
  };

  return (
    <div className="card-surface rounded-lg p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {t("divergence.title")}
      </p>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-mono text-2xl font-bold" style={{ color }}>
          {pct.toFixed(1)}%
        </span>
        <span className="mb-0.5 text-sm text-zinc-500">
          {getLabel()}
        </span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, var(--color-bull) 0%, var(--color-warn) 50%, var(--color-bear) 100%)",
          }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
