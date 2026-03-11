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

  const confidenceValue = Math.min(95, Math.round((report.confidence ?? 0) * 100));
  const confidence = confidenceValue.toString();
  const { avgConf } = useConsensusData(report.sections);

  const glowClass = rawSignal === "bullish" ? "glow-green" : rawSignal === "bearish" ? "glow-red" : "";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "glass-card bg-grid group relative overflow-hidden transition-all duration-500",
        glowClass
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between p-5 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-zinc-900 border border-white/[0.08] shadow-inner">
            <span className="text-lg font-black font-mono text-zinc-400 group-hover:text-white transition-colors">
               {report.symbol.substring(0, 1)}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold font-mono tracking-tight text-white group-hover:glow-text transition-all">
                {report.symbol}
              </h3>
              <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.02] font-bold uppercase tracking-widest">
                {t("card.perp")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
              <span className="bg-zinc-800/50 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{modeLabel(report.mode)}</span>
              <span className="opacity-30">•</span>
              <span className="font-mono text-[10px] opacity-70">{t("card.latency").toUpperCase()}: {(report.execution_time_ms / 1000).toFixed(2)}s</span>
            </div>
          </div>
        </div>

        {/* Signal Badge - Premium Plate Style */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-2 rounded-lg border-2 font-black tracking-tighter uppercase transition-all duration-500",
          rawSignal === 'bullish' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]' :
          rawSignal === 'bearish' ? 'border-red-500/30 bg-red-500/10 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.1)]' :
          'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
        )}>
          <signalConfig.icon size={18} strokeWidth={3} className="animate-pulse" />
          <div className="flex flex-col leading-none">
            <span className="text-xs opacity-70 mb-0.5">{t("card.decision").toUpperCase()}</span>
            <span className="text-base">{signalConfig.label}</span>
          </div>
          <div className="h-8 w-px bg-current opacity-20 mx-1" />
          <div className="flex flex-col leading-none">
            <span className="text-xs opacity-70 mb-0.5">{t("card.score").toUpperCase()}</span>
            <span className="text-base font-mono">{confidence}%</span>
          </div>
        </div>
      </div>

      {/* ── Key Metrics Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-b border-border bg-bg-surface/30">
        <MetricItem
          label={t("card.consensus")}
          value={confidenceValue > 0 ? `${confidence}%` : "—"}
          sub={t("card.agreement")}
          fontMono
        />
        <MetricItem
          label={t("card.riskReward")}
          value={report.strategy?.risk_reward_ratio ? `${report.strategy.risk_reward_ratio}` : "—"}
          sub={t("card.riskReward")}
          fontMono
        />
        <MetricItem
          label={t("card.entryZone")}
          value={report.strategy?.entry_low ? `${formatPrice(report.strategy.entry_low)} - ${formatPrice(report.strategy.entry_high)}` : "—"}
          sub={t("card.entryRange")}
          fontMono
        />
        <MetricItem
          label={t("card.stopLoss")}
          value={formatPrice(report.strategy?.stop_loss)}
          sub={t("card.safetyLevel")}
          valueColor="text-bear"
          fontMono
        />
      </div>

      {/* ── Content Body ── */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
        {/* Left: Reasoning & Findings */}
        <div className="space-y-5">
          <div>
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
              <Activity size={12} />
              {t("card.analysisReasoning")}
            </h4>
            <div className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-lg">
              <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
                {report.strategy?.reasoning || t("progress.analyzing")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Shield size={10} /> {t("card.validUntil")}
              </p>
              <p className="text-xs font-mono text-zinc-400">
                {report.strategy?.valid_until ? new Date(report.strategy.valid_until).toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Database size={10} /> {t("card.source")}
              </p>
              <p className="text-xs font-mono text-zinc-400">
                Axiom Swarm • Epoch V5
              </p>
            </div>
          </div>
        </div>

        {/* Right: Targets (High Precision) */}
        <div className="bg-zinc-950/50 rounded-xl border border-white/[0.05] p-5 flex flex-col justify-between">
           <div>
             <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
               {t("card.tpTargets")}
             </h4>
             <div className="space-y-4">
               {report.strategy?.targets?.map((target: number, idx: number) => (
                 <div key={idx} className="relative pl-4 border-l-2 border-bull/30 py-0.5">
                   <div className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-bull" />
                   <div className="flex justify-between items-baseline mb-0.5">
                     <span className="text-[9px] font-bold text-zinc-600 uppercase">TP{idx+1}</span>
                     <span className="text-[9px] text-bull/60 font-mono">+{(((target / (report.strategy?.entry_high || target)) - 1) * 100).toFixed(1)}%</span>
                   </div>
                   <div className="text-lg font-mono font-bold leading-none tracking-tight text-white">
                     {formatPrice(target)}
                   </div>
                   <p className="text-[8px] text-zinc-500 uppercase mt-1">
                     {idx === 0 ? t("card.initialResistance") : idx === 1 ? t("card.secondaryExtension") : t("card.trendObjective")}
                   </p>
                 </div>
               )) || (
                 <div className="text-xs text-zinc-700 italic">{t("card.noData")}</div>
               )}
             </div>
           </div>

           <div className="mt-6 pt-4 border-t border-white/[0.05]">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[9px] text-zinc-600 uppercase font-bold mb-1">{t("card.assessment")}</p>
                  <p className="text-xs font-mono text-emerald-500 uppercase tracking-widest">{t("card.activeTracking")}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-zinc-600 uppercase font-bold mb-1">{t("card.confidence")}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-bull" style={{ width: `${confidence}%` }} />
                    </div>
                    <span className="text-[10px] font-mono font-bold">{confidence}%</span>
                  </div>
                </div>
              </div>
           </div>
        </div>
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
    <div className="p-4 lg:p-5 flex flex-col justify-center bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
      <div className="flex items-center gap-2 mb-2 opacity-70 group-hover:opacity-100 transition-opacity">
        <span className="w-1 h-3 rounded-sm bg-indigo-500/50" />
        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest leading-none">{label}</span>
      </div>
      <span className={cn("text-lg lg:text-xl font-bold tracking-tight text-white mb-0.5", valueColor !== "text-foreground" ? valueColor : "", fontMono && "font-mono")}>{value}</span>
      <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{sub}</span>
    </div>
  );
}

function formatPrice(val: number | string | null | undefined) {
  if (val == null) return "---";
  return typeof val === "number" ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val);
}
