"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  ChevronDown,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { ReportSection } from "@/lib/api/analysis";
import type { StrategyData } from "@/lib/types/strategy";
import {
  formatDirection,
  formatPrice,
  getSectionIcon,
  isConsensusAgentSection,
  localizeText,
} from "./helpers";
import { StrategyRangeBar } from "./StrategyCard";
import { useTranslations } from "next-intl";

// ── Strategy price grid ────────────────────────────────────

export function StrategyPriceSection({
  strategy,
  isFallback,
}: {
  strategy: StrategyData;
  isFallback: boolean;
}) {
  const t = useTranslations("consensus.ui");
  const dir = strategy.direction ?? "neutral";
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        {dir === "long" ? (
          <TrendingUp className="h-4 w-4 text-emerald-400" />
        ) : dir === "short" ? (
          <TrendingDown className="h-4 w-4 text-red-400" />
        ) : null}
        <span
          className={`text-sm font-bold ${
            dir === "long"
              ? "text-emerald-400"
              : dir === "short"
                ? "text-red-400"
                : "text-zinc-400"
          }`}
        >
          {formatDirection(dir)}
        </span>
        {isFallback && (
          <span className="text-xs text-amber-400/70">{t("entryPrice")}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(strategy.entry_low != null || strategy.entry_high != null) && (
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-xs text-zinc-500 mb-1">{t("entryZone")}</p>
            <p className="text-sm font-mono font-semibold text-zinc-200">
              {strategy.entry_low != null ? formatPrice(strategy.entry_low) : "—"} ~{" "}
              {strategy.entry_high != null ? formatPrice(strategy.entry_high) : "—"}
            </p>
          </div>
        )}
        {strategy.stop_loss != null && (
          <div className="rounded-lg bg-red-500/[0.04] px-3 py-2">
            <p className="text-xs text-red-400/70 mb-1">{t("stopLoss")}</p>
            <p className="text-sm font-mono font-semibold text-red-400">
              {formatPrice(strategy.stop_loss)}
            </p>
          </div>
        )}
        {strategy.targets && strategy.targets.length > 0 && (
          <div className="rounded-lg bg-emerald-500/[0.04] px-3 py-2">
            <p className="text-xs text-emerald-400/70 mb-1">{t("targets")}</p>
            <div className="flex gap-2 flex-wrap">
              {strategy.targets.map((tp, i) => (
                <span
                  key={i}
                  className="text-sm font-mono font-semibold text-emerald-400"
                >
                  T{i + 1}: {formatPrice(tp)}
                </span>
              ))}
            </div>
          </div>
        )}
        {(strategy.risk_reward_ratio ?? 0) > 0 && (
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-xs text-zinc-500 mb-1">{t("riskReward")}</p>
            <p className="text-sm font-mono font-semibold text-zinc-200">
              1 : {(strategy.risk_reward_ratio ?? 0).toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {strategy.stop_loss != null && strategy.entry_low != null && strategy.entry_high != null && (
        <StrategyRangeBar
          stopLoss={strategy.stop_loss}
          entryLow={strategy.entry_low}
          entryHigh={strategy.entry_high}
          targets={strategy.targets || []}
          direction={strategy.direction}
        />
      )}
    </div>
  );
}

// ── AI consensus section ───────────────────────────────────

interface ConsensusCounts {
  bullish: number;
  bearish: number;
  neutral: number;
}

export function useConsensusData(sections: ReportSection[]) {
  const agentSections = sections.filter(
    (s) =>
      s.status === "completed" && s.data?.signal && isConsensusAgentSection(s.title),
  );
  const counts: ConsensusCounts = { bullish: 0, bearish: 0, neutral: 0 };
  let confSum = 0;
  let confCount = 0;
  for (const s of agentSections) {
    const sig = String(s.data.signal);
    if (sig === "bullish") counts.bullish++;
    else if (sig === "bearish") counts.bearish++;
    else counts.neutral++;
    const c = s.data.confidence;
    if (typeof c === "number" && c > 0) {
      confSum += c;
      confCount++;
    }
  }
  const avgConf = confCount > 0 ? confSum / confCount : 0;
  return { agentSections, counts, avgConf };
}

export function ConsensusSection({
  agentSections,
  counts,
  avgConf,
}: {
  agentSections: ReportSection[];
  counts: ConsensusCounts;
  avgConf: number;
}) {
  const [showAgents, setShowAgents] = useState(false);
  const t = useTranslations("consensus.ui");

  if (agentSections.length === 0) return null;

  const handleJump = (title: string) => {
    window.dispatchEvent(new CustomEvent("analysis:jump-to-section", { detail: title }));
  };

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => setShowAgents((v) => !v)}
        aria-expanded={showAgents}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 text-sm">
          <Bot className="h-3.5 w-3.5 text-indigo-400" />
          <span className="font-medium text-zinc-300">
            {t("agentCount", { count: agentSections.length })}
          </span>
          <span className="text-zinc-500">·</span>
          <span className="font-mono text-zinc-400">
            {(avgConf * 100).toFixed(0)}%
          </span>
          <span className="text-zinc-500">·</span>
          <span className="text-xs">
            {counts.bullish > 0 && (
              <span className="text-emerald-400">{t("bullishCount", { count: counts.bullish })}</span>
            )}
            {counts.bullish > 0 &&
              (counts.bearish > 0 || counts.neutral > 0) &&
              " "}
            {counts.bearish > 0 && (
              <span className="text-red-400">{t("bearishCount", { count: counts.bearish })}</span>
            )}
            {counts.bearish > 0 && counts.neutral > 0 && " "}
            {counts.neutral > 0 && (
              <span className="text-zinc-500">{t("neutralCount", { count: counts.neutral })}</span>
            )}
          </span>
        </div>
        <motion.div
          animate={{ rotate: showAgents ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {showAgents && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2.5 flex flex-wrap gap-2">
              {agentSections.map((s) => {
                const sig = String(s.data.signal);
                const conf =
                  typeof s.data.confidence === "number"
                    ? s.data.confidence
                    : null;
                const iconInfo = getSectionIcon(s.title);
                const IconComp = iconInfo.icon;
                const color =
                  sig === "bullish"
                    ? "text-emerald-400"
                    : sig === "bearish"
                      ? "text-red-400"
                      : "text-zinc-500";
                return (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => handleJump(s.title)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-sm transition-colors hover:bg-white/[0.08]"
                    title={t("collapseSection", { title: s.title })}
                  >
                    <IconComp className={`h-3 w-3 ${iconInfo.color}`} />
                    <span className="text-zinc-300">{s.title}</span>
                    <span className={`font-bold ${color}`}>
                      {sig === "bullish"
                        ? "▲"
                        : sig === "bearish"
                          ? "▼"
                          : "●"}
                    </span>
                    {conf !== null && conf > 0 && (
                      <span className="text-xs font-mono text-zinc-500">
                        {(conf * 100).toFixed(0)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Key findings extractor ─────────────────────────────────

export function useKeyFindings(sections: ReportSection[], limit = 10) {
  return sections
    .filter(
      (s) =>
        s.status === "completed" && Array.isArray(s.data?.key_findings),
    )
    .flatMap((s) =>
      (s.data.key_findings as string[]).slice(0, 3).map((f) => ({
        text: localizeText(String(f)),
        signal: String(s.data.signal || "neutral"),
        source: s.title,
      })),
    )
    .slice(0, limit);
}
