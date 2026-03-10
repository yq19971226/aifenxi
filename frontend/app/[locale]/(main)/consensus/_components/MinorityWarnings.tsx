"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { localizeText } from "@/components/analysis/helpers";

export function MinorityWarnings({ warnings }: { warnings: string[] }) {
  const t = useTranslations("consensus");
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {t("minority.title")}
      </p>
      {warnings.map((w, i) => (
        <div
          key={i}
          className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5"
        >
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm leading-relaxed text-amber-300">{localizeText(w)}</p>
        </div>
      ))}
    </div>
  );
}
