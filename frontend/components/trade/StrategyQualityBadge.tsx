"use client";

interface Props {
  isWorthTaking: boolean;
  confidence: number;
}

export function StrategyQualityBadge({ isWorthTaking, confidence }: Props) {
  let label: string;
  let colorClass: string;

  if (isWorthTaking && confidence >= 0.7) {
    label = "策略质量：优质";
    colorClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  } else if (isWorthTaking) {
    label = "策略质量：可参考";
    colorClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  } else {
    label = "策略质量：谨慎";
    colorClass = "bg-red-500/10 text-red-400 border-red-500/20";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </span>
  );
}
