"use client";

import { AlertTriangle } from "lucide-react";
import { localizeText } from "@/components/analysis/helpers";

export function MinorityWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {"少数派警告"}
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
