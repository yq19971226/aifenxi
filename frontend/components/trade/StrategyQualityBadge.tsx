"use client";

import { useTranslations } from "next-intl";

interface Props {
  isWorthTaking: boolean;
  confidence: number;
}

export function StrategyQualityBadge({ isWorthTaking, confidence }: Props) {
  const t = useTranslations("analysis.strategyQuality");
  let qualityKey: string;
  let colorClass: string;

  if (isWorthTaking && confidence >= 0.7) {
    qualityKey = "excellent";
    colorClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  } else if (isWorthTaking) {
    qualityKey = "reference";
    colorClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  } else {
    qualityKey = "caution";
    colorClass = "bg-red-500/10 text-red-400 border-red-500/20";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {t("prefix")}{t(qualityKey)}
    </span>
  );
}

