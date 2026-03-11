"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  Clock,
  Database,
  Shield
} from "lucide-react";

import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";
import {
  formatCachedTime,
  modeLabel,
} from "./helpers";
import { cn } from "@/lib/utils";
import { useConsensusData } from "./UnifiedSections";

// ── Technical Blueprint Style Card ─────────────────────────

export function UnifiedResultCard({ report }: { report: AnalysisReportType }) {
  const t = useTranslations("consensus");
  const strategy = report.strategy;

  const rawSignal = strategy?.direction === "long" ? "bullish" : strategy?.direction === "short" ? "bearish" : report.signal;

  const signalConfig = {
    bullish: {
      color: "text-bull",
      borderColor: "border-bull/20",
      bg: "bg-bull-muted",
      icon: TrendingUp,
      label: t("signals.bullish")
    },
    bearish: {
      color: "text-bear",
      borderColor: "border-bear/20",
      bg: "bg-bear-muted",
      icon: TrendingDown,
      label: t("signals.bearish")
    },
    neutral: {
      color: "text-muted-foreground",
      borderColor: "border-border",
      bg: "bg-muted",
      icon: Minus,
      label: t("signals.neutral")
    }
  }[rawSignal] || {
    color: "text-muted-foreground",
    borderColor: "border-border",
    bg: "bg-muted",
    icon: Minus,
    label: t("signals.neutral")
  };

  const confidence = ((report.confidence ?? 0) * 100).toFixed(0);
  const { avgConf } = useConsensusData(report.sections);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-bg-card backdrop-blur-sm overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded bg-bg-elevated border border-border">
            {/* Symbol Logo Placeholder - In real app use Image */}
            <span className="text-sm font-bold font-mono">{report.symbol.substring(0, 1)}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold font-mono tracking-tight">{report.symbol}</h3>
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded border border-border bg-bg-surface">
                {t("card.perp")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              <span>{modeLabel(report.mode)}</span>
              <span>•</span>
              <span className="font-mono">{(report.execution_time_ms / 1000).toFixed(2)}s</span>
            </div>
          </div>
        </div>

        {/* Signal Badge - Outlined Tag Style */}
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-bold tracking-wide",
          signalConfig.borderColor,
          signalConfig.color,
          "bg-transparent" // No background for cleaner look
        )}>
          <signalConfig.icon size={16} strokeWidth={2.5} />
          <span>{signalConfig.label}</span>
          <span className="opacity-50 mx-1">|</span>
          <span className="font-mono">{confidence}%</span>
        </div>
      </div>

      {/* ── Key Metrics Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-b border-border bg-bg-surface/30">
        <MetricItem
          label={t("card.consensus")}
          value={`${(avgConf * 100).toFixed(0)}%`}
          sub={t("card.agreement")}
        />
        <MetricItem
          label={t("card.riskLevel")}
          value="—"
          sub={t("card.assessment")}
        />
        <MetricItem
          label={t("card.support")}
          value={formatPrice(report.strategy?.entry_low ?? report.strategy?.entry_high)}
          sub={t("card.keyLevel")}
          fontMono
        />
        <MetricItem
          label={t("card.resistance")}
          value={formatPrice(report.strategy?.targets?.[0] ?? report.strategy?.entry_high)}
          sub={t("card.keyLevel")}
          fontMono
        />
      </div>

      {/* ── Content Body ── */}
      <div className="p-5 space-y-5">
        {/* Reasoning */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
            <Activity size={14} />
            {t("card.analysisReasoning")}
          </h4>
          <p className="text-base leading-relaxed text-foreground/90">
            {report.strategy?.reasoning ?? "—"}
          </p>
        </div>

        {/* Key Findings List */}
        {report.key_findings && report.key_findings.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Database size={14} />
              {t("card.keyFindings")}
            </h4>
            <ul className="grid gap-2">
              {report.key_findings.slice(0, 3).map((finding, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground items-start">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Footer Metadata ── */}
      <div className="px-4 py-2.5 bg-bg-surface border-t border-border flex items-center justify-between text-xs text-muted-foreground font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <Clock size={12} />
            {t("card.updated")}: {formatCachedTime(report.timestamp)}
          </span>
          <span className="flex items-center gap-1.5">
            <Shield size={12} />
            {t("card.engine")}
          </span>
        </div>
        <div>
          {t("card.id")}: {(report as { report_id?: string }).report_id?.substring(0, 8) ?? report.timestamp.slice(0, 19).replace(/[-:T]/g, "").slice(0, 8)}
        </div>
      </div>
    </motion.div>
  );
}

function MetricItem({ label, value, sub, valueColor = "text-foreground", fontMono = false }: { label: string, value: string | number, sub: string, valueColor?: string, fontMono?: boolean }) {
  return (
    <div className="p-3 flex flex-col items-center justify-center text-center">
      <span className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{label}</span>
      <span className={cn("text-base font-bold", valueColor, fontMono && "font-mono")}>{value}</span>
      <span className="text-xs text-muted-foreground/80">{sub}</span>
    </div>
  );
}

function formatPrice(val: number | string | null | undefined) {
  if (val == null) return "---";
  return typeof val === "number" ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val);
}
