"use client";

import { useEffect, useState } from "react";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  Clock,
  Database,
  Shield,
  AlertTriangle,
  Swords,
  ChevronDown,
} from "lucide-react";

import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";
import {
  formatCachedTime,
  modeLabel,
} from "./helpers";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/api/auth";
import { useConsensusData } from "./UnifiedSections";
import { PositionCalculator } from "@/components/trade/PositionCalculator";
import { GridStrategyCard } from "@/components/trade/GridStrategyCard";
import { fromStrategy } from "@/lib/utils/position-sizing";
import type { StrategyData } from "@/lib/types/strategy";

interface ConsensusVote {
  model_key: string;
  label: string;
  signal: string;
  confidence: number;
  key_findings?: string[];
}

interface ConsensusDetail {
  model_votes: ConsensusVote[];
  weighted_score?: number;
  divergence?: number;
  consensus_signal?: string;
}

interface DefenseBrief {
  signal?: string;
  strategy_label?: string;
  intent?: string;
  consensus_ref?: { signal?: string };
}

// ── Technical Blueprint Style Card ─────────────────────────

export function UnifiedResultCard({ report }: { report: AnalysisReportType }) {
  const t = useTranslations("consensus");
  const strategy = report.strategy;
  const isBlocked = !!report.blocked_reason;

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

  // Confidence level classification — 使用后台动态阈值
  const confThresholdPct = Math.round((report.confidence_threshold ?? 0.50) * 100);
  const isLowConf = !isBlocked && (report.signal_insufficient === true || (confidenceValue > 0 && confidenceValue < confThresholdPct));
  const confBarColor = confidenceValue >= 60 ? "bg-bull" : confidenceValue >= confThresholdPct ? "bg-amber-400" : "bg-red-400";
  const glowClass = isBlocked || isLowConf ? "" : rawSignal === "bullish" ? "glow-green" : rawSignal === "bearish" ? "glow-red" : "";

  // P2-F: 获取对抗推演摘要
  const [defenseBrief, setDefenseBrief] = useState<DefenseBrief | null>(null);
  useEffect(() => {
    if (!report.symbol || isBlocked) return;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
    authFetch(`${API_BASE}/api/defense/latest?symbol=${encodeURIComponent(report.symbol)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.adversarial) {
          setDefenseBrief({
            signal: data.adversarial?.signal,
            strategy_label: data.adversarial?.strategy_label,
            intent: data.adversarial?.intent,
            consensus_ref: data.consensus_ref,
          });
        }
      })
      .catch(() => {});
  }, [report.symbol, isBlocked]);

  // P3-A: 获取共识投票详情
  const [consensusDetail, setConsensusDetail] = useState<ConsensusDetail | null>(null);
  const [votesOpen, setVotesOpen] = useState(false);
  useEffect(() => {
    if (!report.symbol || isBlocked) return;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
    authFetch(`${API_BASE}/api/consensus/latest?symbol=${encodeURIComponent(report.symbol)}`)
      .then((res: Response) => res.ok ? res.json() : null)
      .then((data: Record<string, unknown> | null) => {
        if (data?.model_votes) {
          setConsensusDetail({
            model_votes: data.model_votes as ConsensusVote[],
            weighted_score: data.weighted_score as number | undefined,
            divergence: data.divergence as number | undefined,
            consensus_signal: data.consensus_signal as string | undefined,
          });
        }
      })
      .catch(() => {});
  }, [report.symbol, isBlocked]);

  // P2-A: 数据源健康状态
  interface DsSource { domain: string; status: string; ok: number; warn: number; err: number; }
  const [dsHealth, setDsHealth] = useState<{ status: string; sources: DsSource[] } | null>(null);
  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
    authFetch(`${API_BASE}/api/system/datasource-health`)
      .then((res: Response) => res.ok ? res.json() : null)
      .then((data: { status: string; sources: DsSource[] } | null) => {
        if (data && Array.isArray(data.sources)) setDsHealth(data);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="flex items-center justify-between p-5 border-b border-border bg-bg-surface/50">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-bg-elevated border border-border shadow-inner">
            <span className="text-lg font-black font-mono text-zinc-300 group-hover:text-white transition-colors">
               {report.symbol.substring(0, 1)}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold font-mono tracking-tight text-white group-hover:glow-text transition-all">
                {report.symbol}
              </h3>
              <span className="text-[10px] text-zinc-400 px-2 py-0.5 rounded border border-border bg-bg-surface font-bold uppercase tracking-widest leading-none">
                {t("card.perp")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1.5 font-medium">
              <span className="bg-bg-elevated px-2 py-0.5 rounded text-[10px] text-zinc-300 uppercase font-bold tracking-wider leading-none">
                {modeLabel(report.mode)}
              </span>
              <span className="opacity-30">•</span>
              <span className="font-mono text-xs opacity-80">
                {t("card.latency").toUpperCase()}: {(report.execution_time_ms / 1000).toFixed(2)}s
              </span>
            </div>
          </div>
        </div>

        {/* Signal Badge - Premium Plate Style */}
        {/* P0-A: Low confidence → gray/muted badge, no pulse, dashed border */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-2 rounded-lg font-black tracking-tighter uppercase transition-all duration-500",
          isLowConf || isBlocked
            ? 'border-[1.5px] border-dashed border-zinc-600/40 bg-zinc-700/10 text-zinc-500'
            : rawSignal === 'bullish' ? 'border-[1.5px] border-bull/30 bg-bull/10 text-bull shadow-[0_0_20px_rgba(16,185,129,0.1)]' :
              rawSignal === 'bearish' ? 'border-[1.5px] border-bear/30 bg-bear/10 text-bear shadow-[0_0_20px_rgba(239,68,68,0.1)]' :
              'border-[1.5px] border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
        )}>
          <signalConfig.icon size={18} strokeWidth={3} className={(!isLowConf && !isBlocked) ? "animate-pulse" : "opacity-50"} />
          <div className="flex flex-col leading-none">
            <span className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1">
              {t("card.decision")}
            </span>
            <span className={cn("text-base leading-none", (isLowConf || isBlocked) && "opacity-60")}>{signalConfig.label}</span>
          </div>
          <div className="h-8 w-px bg-current opacity-20 mx-2" />
          <div className="flex flex-col leading-none text-right">
            <span className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1">
              {t("card.score")}
            </span>
            <span className="text-base font-mono leading-none">{confidence}%</span>
          </div>
        </div>
      </div>

      {/* ── Blocked Reason Banner ── */}
      {isBlocked && (
        <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">
              {t("card.blockedTitle")}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {t(`card.blockedDesc_${report.blocked_reason}`)}
            </p>
          </div>
        </div>
      )}

      {/* ── Signal Insufficient / Low Confidence Banner ── */}
      {isLowConf && (
        <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">
              {t("card.signalInsufficientTitle")}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {t("card.signalInsufficientDesc", { threshold: confThresholdPct })}
            </p>
          </div>
        </div>
      )}

      {/* ── Confluence & Risk Tags ── */}
      {(() => {
        const TREND_TAG_MAP: Record<string, { key: string; color: string; bg: string }> = {
          "trend:resonant": { key: "card.tag_trend_resonant",  color: "#34d399", bg: "bg-emerald-500/10" },
          "trend:counter":  { key: "card.tag_trend_counter",  color: "#f87171", bg: "bg-red-500/10" },
          "trend:neutral":  { key: "card.tag_trend_neutral",  color: "#a1a1aa", bg: "bg-zinc-500/10" },
          "trend:stale":    { key: "card.tag_trend_stale",  color: "#71717a", bg: "bg-white/[0.04]" },
        };
        const WHALE_TAG_MAP: Record<string, { key: string; color: string; bg: string }> = {
          "whale:funding_rate_extreme": { key: "card.tag_whale_funding", color: "#fbbf24", bg: "bg-amber-500/10" },
          "whale:liquidation_surge":    { key: "card.tag_whale_liquidation",   color: "#f97316", bg: "bg-orange-500/10" },
          "whale:netflow_dump_risk":    { key: "card.tag_whale_netflow", color: "#a78bfa", bg: "bg-violet-500/10" },
          "whale:lsr_crowded":          { key: "card.tag_whale_crowded", color: "#f87171", bg: "bg-red-500/10" },
        };
        const ALL_TAG_MAP = { ...TREND_TAG_MAP, ...WHALE_TAG_MAP };
        const confluenceTags = (report.confluence_tags ?? []).map(
          (tag) => ALL_TAG_MAP[tag] ?? null
        ).filter(Boolean) as Array<{ key: string; color: string; bg: string }>;

        if (confluenceTags.length === 0 && !report.confluence_original_confidence) return null;

        return (
          <div className="mx-5 mt-4 flex flex-col gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.02] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mr-1">
                {t("card.confluenceLabel")}
              </span>
              {confluenceTags.map((tag, i) => (
                <span key={i} className={cn("text-xs font-bold rounded-md px-2 py-1 border border-white/5", tag.bg)} style={{ color: tag.color }}>
                  {t(tag.key)}
                </span>
              ))}
            </div>
            
            {report.confluence_original_confidence != null && Math.round(report.confluence_original_confidence * 100) !== confidenceValue && (
              <div className="text-xs text-zinc-400">
                {t("card.confluenceAdj", { from: Math.round(report.confluence_original_confidence * 100), to: confidenceValue })}
              </div>
            )}
          </div>
        );
      })()}

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

      {/* ── 庄家动态横幅 ── */}
      {(() => {
        const phaseSection = report.sections?.find(s => s.title === "操盘阶段");
        const phaseData = phaseSection?.data as { current_phase?: string; transition?: { from_phase?: string; to_phase?: string; reason?: string } } | undefined;
        const phase = phaseData?.current_phase;
        if (!phase || report.status === "blocked") return null;

        const PHASE_META: Record<string, { label: string; eng: string; color: string; border: string; bg: string; desc: string; emoji: string }> = {
          accumulation: { label: "吸筹", eng: "ACCUMULATION", color: "text-sky-400",    border: "border-sky-500/25",  bg: "bg-sky-500/[0.06]",     desc: "庄家正在低位建仓，逢低买入，市场暂处低迷",        emoji: "🟦" },
          testing:      { label: "试盘", eng: "TESTING",      color: "text-amber-400",  border: "border-amber-500/25",bg: "bg-amber-500/[0.06]",   desc: "庄家试探市场浮筹，小幅震荡试水，注意短期波动",     emoji: "🟡" },
          markup:       { label: "拉盘", eng: "MARKUP",       color: "text-emerald-400",border: "border-emerald-500/25",bg: "bg-emerald-500/[0.06]", desc: "庄家拉升价格吸引追多，主升浪阶段可顺势而为",       emoji: "🟢" },
          distribution: { label: "派发",  eng: "DISTRIBUTION", color: "text-orange-400", border: "border-orange-500/25",bg: "bg-orange-500/[0.06]",  desc: "庄家高位逐步出货，散户接盘，注意阻力位压力",       emoji: "🟠" },
          escape:       { label: "出逃",  eng: "ESCAPE",       color: "text-red-400",    border: "border-red-500/25",  bg: "bg-red-500/[0.06]",     desc: "庄家快速撤离，大量筹码涌入交易所，风险极高",       emoji: "🔴" },
          washout:      { label: "洗盘",  eng: "WASHOUT",      color: "text-violet-400", border: "border-violet-500/25",bg: "bg-violet-500/[0.06]", desc: "庄家制造恐慌，强制清洗浮筹，震荡后可能进入拉盘",   emoji: "🟣" },
        };

        const meta = PHASE_META[phase] ?? { label: phase, eng: phase.toUpperCase(), color: "text-zinc-300", border: "border-zinc-500/25", bg: "bg-zinc-500/[0.04]", desc: "", emoji: "⚪" };
        const transition = phaseData?.transition;

        return (
          <div className={`mx-5 mt-4 flex items-start gap-4 rounded-xl border ${meta.border} ${meta.bg} px-5 py-4`}>
            {/* Phase badge */}
            <div className="flex flex-col items-center shrink-0">
              <span className="text-2xl leading-none">{meta.emoji}</span>
              <span className={`text-[9px] font-mono font-bold mt-1.5 tracking-[0.2em] uppercase ${meta.color}`}>{meta.eng}</span>
            </div>
            {/* Divider */}
            <div className="w-px self-stretch bg-white/[0.06] shrink-0" />
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">庄家当前动作</span>
                {transition && (
                  <span className="text-[10px] font-mono text-zinc-600">
                    ↳ 刚从 <span className={`font-bold ${meta.color}`}>{PHASE_META[transition.from_phase ?? ""]?.label ?? transition.from_phase}</span> 转入
                  </span>
                )}
              </div>
              <p className={`text-sm font-black tracking-tight mb-1.5 ${meta.color}`}>
                {meta.label}中
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">{meta.desc}</p>
              {transition?.reason && (
                <p className="text-[11px] text-zinc-600 mt-1.5 font-mono">
                  依据: {transition.reason}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── P1-F: 体制-阶段冲突标签 ── */}
      {report.regime_conflict && report.regime_conflict_detail && (
        <div className="mx-5 mt-3 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">
                {t("card.regimeConflictTitle")}
              </span>
              {report.regime_original && report.regime_effective && report.regime_original !== report.regime_effective && (
                <span className="text-[9px] font-mono text-zinc-500">
                  {report.regime_original} → {report.regime_effective}
                </span>
              )}
              {report.phase_score_gap != null && (
                <span className={cn(
                  "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                  report.phase_score_gap >= 1.5
                    ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/10"
                    : report.phase_score_gap >= 0.5
                    ? "text-amber-400 border-amber-500/25 bg-amber-500/10"
                    : "text-orange-400 border-orange-500/25 bg-orange-500/10"
                )}>
                  {t("card.phaseConfidence")}: {report.phase_score_gap >= 1.5 ? t("card.phaseHigh") : report.phase_score_gap >= 0.5 ? t("card.phaseMedium") : t("card.phaseLow")}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {report.regime_conflict_detail}
            </p>
          </div>
        </div>
      )}

      {/* ── Content Body ── */}

      <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
        {/* Left: Reasoning & Findings */}
        <div className="space-y-5">
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
              <Activity size={14} className="text-zinc-500" />
              {t("card.analysisReasoning")}
            </h4>
            <div className="bg-bg-primary/50 border border-border/50 p-5 rounded-xl shadow-inner">
              <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
                {isBlocked
                  ? t(`card.blockedReasoning_${report.blocked_reason}`)
                  : report.strategy?.reasoning === "Agent analysis failed to return valid data. A baseline safety strategy has been generated based on current market price levels."
                    ? t("card.baselineSafetyReasoning")
                    : (report.strategy?.reasoning || t("progress.analyzing"))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-surface/50 p-3 rounded-lg border border-border/50">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 font-bold">
                <Shield size={10} /> {t("card.validUntil")}
              </p>
              <p className="text-xs font-mono font-medium text-zinc-300">
                {report.strategy?.valid_until ? new Date(report.strategy.valid_until).toLocaleString() : "—"}
              </p>
            </div>
            <div className="bg-bg-surface/50 p-3 rounded-lg border border-border/50">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 font-bold">
                <Database size={10} /> {t("card.source")}
              </p>
              <p className="text-xs font-mono font-medium text-zinc-300">
                {t("card.sourceLabel")}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Targets (High Precision) */}
        <div className="bg-bg-primary rounded-xl border border-border p-5 flex flex-col justify-between shadow-inner">
           <div>
             <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-[0.15em] mb-5">
               {t("card.tpTargets")}
             </h4>
             <div className="space-y-5">
               {report.strategy?.targets?.map((target: number, idx: number) => {
                 const profitPct = ((target / (report.strategy?.entry_high || target)) - 1) * 100;
                 const isLowProfit = profitPct < 0.5;
                 return (
                   <div key={idx} className="relative pl-4 border-l-[3px] border-bull/30 py-0.5 hover:border-bull transition-colors">
                     <div className="absolute -left-[5.5px] top-1.5 w-2 h-2 rounded-full bg-bull shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                     <div className="flex justify-between items-baseline mb-1">
                       {/* P0-B: TP → 止盈位 */}
                       <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t("card.tpLabel", { n: idx + 1 })}</span>
                       <span className={cn(
                         "text-xs font-mono font-bold px-1.5 rounded",
                         isLowProfit ? "text-amber-400 bg-amber-500/10" : "text-bull bg-bull/10"
                       )}>+{profitPct.toFixed(1)}%</span>
                     </div>
                     <div className="text-lg flex items-center font-mono font-black leading-none tracking-tight text-white mb-1">
                       {formatPrice(target)}
                     </div>
                     <div className="flex items-center gap-2">
                       <p className="text-[11px] text-zinc-500 font-medium">
                         {idx === 0 ? t("card.initialResistance") : idx === 1 ? t("card.secondaryExtension") : t("card.trendObjective")}
                       </p>
                       {/* P2-B: 止盈位利润不足警告 */}
                       {isLowProfit && idx === 0 && (
                         <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                           {t("card.lowProfitWarning")}
                         </span>
                       )}
                     </div>
                   </div>
                 );
               }) || (
                 <div className="text-xs text-zinc-600 italic bg-bg-surface p-3 rounded-lg">{t("card.noData")}</div>
               )}
             </div>
           </div>

           <div className="mt-6 pt-5 border-t border-border">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5">{t("card.assessment")}</p>
                  <p className={cn("text-xs font-mono uppercase tracking-widest font-bold", isLowConf ? "text-amber-400" : "text-emerald-400")}>{isLowConf ? t("card.signalInsufficient") : t("card.activeTracking")}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5">{t("card.confidence")}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${confBarColor}`} style={{ width: `${confidence}%` }} />
                    </div>
                    <span className="text-xs font-mono font-bold text-zinc-300">{confidence}%</span>
                  </div>
                </div>
              </div>
           </div>
        </div>
      </div>

      {/* ── Position Calculator ── */}
      {strategy && strategy.direction !== "neutral" && !strategy.is_fallback && (
        <div className="px-5 pb-5">
          <PositionCalculator
            input={fromStrategy(strategy as StrategyData)}
            isWorthTaking={strategy.is_worth_taking ?? true}
            confidence={report.confidence ?? 0.5}
            isFallback={strategy.is_fallback ?? false}
          />
        </div>
      )}

      {/* ── Grid Strategy Recommendation ── */}
      {report.mode !== "scalping" && strategy && strategy.direction !== "neutral" && !strategy.is_fallback && (
        <div className="px-5 pb-5">
          <GridStrategyCard report={report} />
        </div>
      )}

      {/* ── P2-F: 对抗推演摘要行 ── */}
      {defenseBrief && (
        <div className="mx-5 mb-1 flex items-center gap-3 rounded-lg border border-violet-500/15 bg-violet-500/[0.03] px-4 py-2.5">
          <Swords size={14} className="text-violet-400 shrink-0" />
          <div className="flex-1 min-w-0 text-xs font-medium">
            <span className="text-zinc-500">{t("card.defenseLabel")}</span>
            {defenseBrief.intent && (
              <span className="text-violet-300 ml-1.5">
                {t("card.defenseIntent")}{defenseBrief.intent}
              </span>
            )}
            {defenseBrief.strategy_label && (
              <span className="text-zinc-400 ml-1.5">· {defenseBrief.strategy_label}</span>
            )}
            {defenseBrief.signal && defenseBrief.consensus_ref?.signal && (
              defenseBrief.signal === defenseBrief.consensus_ref.signal ? (
                <span className="text-emerald-400 ml-1.5">· ✅ {t("card.defenseConsistent")}</span>
              ) : (
                <span className="text-amber-400 ml-1.5">· ⚠️ {t("card.defenseConflict")}</span>
              )
            )}
          </div>
          <a
            href={`/adversarial?symbol=${report.symbol}`}
            className="text-[10px] text-violet-400/70 hover:text-violet-300 font-mono uppercase tracking-wider shrink-0 transition-colors"
          >
            {t("card.defenseDetail")}
          </a>
        </div>
      )}

      {/* ── P3-A: 共识投票透明度面板 ── */}
      {consensusDetail && consensusDetail.model_votes.length > 0 && (
        <div className="mx-5 mb-1 rounded-lg border border-indigo-500/15 bg-indigo-500/[0.02] overflow-hidden">
          <button
            onClick={() => setVotesOpen(!votesOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-indigo-400">🤖</span>
              {t("card.votePanelTitle")}
            </span>
            <ChevronDown
              size={14}
              className={cn(
                "text-zinc-500 transition-transform duration-200",
                votesOpen && "rotate-180"
              )}
            />
          </button>
          {votesOpen && (
            <div className="px-4 pb-3 space-y-2 border-t border-indigo-500/10">
              {consensusDetail.model_votes.map((v) => (
                <div
                  key={v.model_key}
                  className="flex items-center gap-3 py-1.5 text-xs"
                >
                  <span className="w-[90px] font-medium text-zinc-300 shrink-0">
                    {v.label}
                  </span>
                  <span
                    className={cn(
                      "w-[40px] font-bold text-center shrink-0",
                      v.signal === "bullish" ? "text-emerald-400" :
                      v.signal === "bearish" ? "text-red-400" : "text-zinc-500"
                    )}
                  >
                    {v.signal === "bullish" ? "看多" : v.signal === "bearish" ? "看空" : "中性"}
                  </span>
                  <div className="flex-1 flex items-center gap-1.5">
                    <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          v.confidence >= 0.6 ? "bg-emerald-500" :
                          v.confidence >= 0.4 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${Math.round(v.confidence * 100)}%` }}
                      />
                    </div>
                    <span className="text-zinc-500 font-mono w-[32px] text-right">
                      {Math.round(v.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
              {/* 底部汇总: 加权分数 + 分歧度 */}
              <div className="flex items-center gap-4 pt-2 border-t border-indigo-500/10 text-[10px] text-zinc-500 font-mono">
                {consensusDetail.weighted_score != null && (
                  <span>
                    {t("card.weightedScore")}: <span className="text-zinc-300 font-bold">{consensusDetail.weighted_score.toFixed(2)}</span>
                  </span>
                )}
                {consensusDetail.divergence != null && (
                  <span>
                    {t("card.divergenceLabel")}: <span className="text-zinc-300 font-bold">{consensusDetail.divergence.toFixed(1)}%</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Footer Metadata ── */}
      <div className="px-5 py-3 bg-bg-surface border-t border-border flex items-center justify-between text-xs text-muted-foreground font-mono font-medium">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Clock size={12} className="text-zinc-500" />
            <span className="text-zinc-400">{t("card.updated")}:</span> {formatCachedTime(report.timestamp)}
          </span>
          <span className="flex items-center gap-1.5 text-zinc-500">
            <Shield size={12} />
            {t("card.engine")}
          </span>
          {/* P2-A: 数据源健康彩点 */}
          {dsHealth && Array.isArray(dsHealth.sources) && (
            <span className="flex items-center gap-1" title={`数据源: ${dsHealth.status}`}>
              <Database size={11} className="text-zinc-600" />
              {dsHealth.sources.map((s) => (
                <span
                  key={s.domain}
                  title={`${s.domain}: ${s.status} (✓${s.ok} ⚠${s.warn} ✗${s.err})`}
                  className={
                    s.status === "healthy"
                      ? "text-emerald-500 text-[10px] leading-none cursor-default"
                      : s.status === "degraded"
                      ? "text-amber-400 text-[10px] leading-none cursor-default"
                      : "text-red-400 text-[10px] leading-none cursor-default"
                  }
                >
                  ●
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="text-zinc-500">
          {t("card.id")}: <span className="text-zinc-400">{(report as { report_id?: string }).report_id?.substring(0, 8) ?? report.timestamp.slice(0, 19).replace(/[-:T]/g, "").slice(0, 8)}</span>
        </div>
      </div>
    </motion.div>
  );
}

function MetricItem({ label, value, sub, valueColor = "text-foreground", fontMono = false }: { label: string, value: string | number, sub: string, valueColor?: string, fontMono?: boolean }) {
  return (
    <div className="p-4 lg:p-5 flex flex-col justify-center bg-bg-primary/30 hover:bg-bg-surface transition-colors group">
      <div className="flex items-center gap-2 mb-2 lg:mb-3 opacity-70 group-hover:opacity-100 transition-opacity">
        <span className="w-1 h-3 rounded-sm bg-indigo-500/50" />
        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest leading-none">{label}</span>
      </div>
      <span className={cn("text-lg lg:text-2xl font-black tracking-tight text-white mb-1", valueColor !== "text-foreground" ? valueColor : "", fontMono && "font-mono")}>{value}</span>
      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{sub}</span>
    </div>
  );
}

function formatPrice(val: number | string | null | undefined) {
  if (val == null) return "---";
  return typeof val === "number" ? val.toLocaleString(undefined, { maximumFractionDigits: 2, useGrouping: false }) : String(val);
}
