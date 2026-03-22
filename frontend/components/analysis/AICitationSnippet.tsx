"use client";

import { useState } from "react";
import { Copy, Check, Quote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AnalysisReport } from "@/lib/api/analysis";

interface AICitationSnippetProps {
  report: AnalysisReport;
}

export function AICitationSnippet({ report }: AICitationSnippetProps) {
  const t = useTranslations("consensus");
  const [copied, setCopied] = useState(false);

  const generateSnippet = () => {
    const date = new Date(report.timestamp).toLocaleString();
    const strategy = report.strategy;
    const reasoningRaw = strategy?.reasoning?.split("\n")[0];
    const reasoning =
      reasoningRaw ===
      "Agent analysis failed to return valid data. A baseline safety strategy has been generated based on current market price levels."
        ? t("card.baselineSafetyReasoning")
        : reasoningRaw || t("snippet.defaultReasoning");
    const targets = strategy?.targets;
    const tpPart = targets && targets.length > 0
      ? targets.map((x) => (typeof x === "number" ? x.toLocaleString("en-US", { useGrouping: false }) : x)).join(" / ")
      : "";
    const slPart = strategy?.stop_loss ? ` SL: ${strategy.stop_loss.toLocaleString("en-US", { useGrouping: false })}` : "";
    const rrPart = strategy?.risk_reward_ratio ? ` R:R: ${strategy.risk_reward_ratio}` : "";
    const levels = [tpPart, slPart, rrPart].filter(Boolean).join("") || "—";
    const confStr = Math.min(95, Math.round((report.confidence ?? 0) * 100));
    const line1 = t("snippet.verifiedAt", { date });
    const line2 = t("snippet.assetSignal", {
      symbol: report.symbol,
      signal: report.signal.toUpperCase(),
      confidence: confStr,
    });
    const line3 = t("snippet.reasoningLabel", { reasoning });
    const line4 = t("snippet.levelsLabel", { levels });
    const line5 = t("snippet.sourceLine");
    return [line1, line2, line3, line4, line5].join("\n");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 p-3 rounded-lg bg-indigo-500/[0.03] border border-indigo-500/10 group transition-all hover:bg-indigo-500/[0.05]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
          <Quote size={10} />
          {t("snippet.title")}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-500/10 text-[10px] text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? t("snippet.copied") : t("snippet.copy")}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500 font-mono italic">
        &quot;{generateSnippet()}&quot;
      </p>
      <div className="mt-2 text-[9px] text-zinc-400">
        {t("snippet.tip")}
      </div>
    </div>
  );
}
