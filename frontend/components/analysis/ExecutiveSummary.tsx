"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRightLeft,
  Database,
  Minus,
  Shield,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { AnalysisReport as AnalysisReportType, ReportSection } from "@/lib/api/analysis";
import type { StrategyData } from "@/lib/types/strategy";
import {
  formatCachedTime,
  formatPrice,
  getSignalStyle,
  isFallbackReasoning,
  modeLabel,
} from "./helpers";
import { ConfidenceRing, StrategyCard } from "./StrategyCard";
import { AccentBorderCard } from "./AccentBorderCard";
import type { AccentType } from "./AccentBorderCard";
import { AnalysisStatusBanner } from "./StatusBanner";
import { PositionCalculator } from "@/components/trade/PositionCalculator";
import { fromStrategy } from "@/lib/utils/position-sizing";

// ── Action advice banner (compact — details already in StrategyCard) ──

function ActionAdviceBanner({ strategy }: { strategy: StrategyData }) {
  const dir = strategy.direction;
  if (strategy.is_fallback || dir === "neutral") return null;

  const isLong = dir === "long";
  const accentType: AccentType = isLong ? "action-long" : "action-short";
  const entryStr = strategy.entry_low && strategy.entry_high
    ? ` · 入场 ${formatPrice(strategy.entry_low)} ~ ${formatPrice(strategy.entry_high)}`
    : "";
  const title = `建议${isLong ? "做多" : "做空"}${entryStr}`;

  return (
    <AccentBorderCard type={accentType} title={title} icon={isLong ? TrendingUp : TrendingDown}>
      <p className="text-sm text-zinc-400">
        止损 <span className="font-mono font-medium text-red-400">{formatPrice(strategy.stop_loss)}</span>
        {strategy.targets.length > 0 && (
          <>
            <span className="mx-2 text-zinc-500">·</span>
            目标 <span className="font-mono font-medium text-emerald-400">{formatPrice(strategy.targets[0])}</span>
            {strategy.targets.length > 1 && <span className="text-zinc-500"> +{strategy.targets.length - 1}</span>}
          </>
        )}
      </p>
    </AccentBorderCard>
  );
}

// ── Risk card (风险色条) ─────────────────────────────────────

function RiskCard({ sections }: { sections: ReportSection[] }) {
  const riskSection = sections.find((s) => s.title === "风险评估" && s.status === "completed");
  if (!riskSection) return null;

  const riskLevel = String(riskSection.data?.risk_level || "low");
  if (riskLevel === "low") return null;

  const keyRisks = Array.isArray(riskSection.data?.key_risks) ? (riskSection.data.key_risks as string[]) : [];
  const recommendations = Array.isArray(riskSection.data?.recommendations) ? (riskSection.data.recommendations as string[]) : [];

  const accentType: AccentType = riskLevel === "high" ? "risk-high" : "risk-medium";
  const title = riskLevel === "high" ? "高风险警告" : "风险提示";

  return (
    <AccentBorderCard type={accentType} title={title} icon={Shield}>
      <div className="space-y-1.5">
        {keyRisks.map((r, i) => (
          <p key={i} className="text-sm text-zinc-300 flex items-start gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${riskLevel === "high" ? "bg-red-400" : "bg-amber-400"}`} />
            {r}
          </p>
        ))}
        {recommendations.length > 0 && (
          <p className="text-sm text-zinc-400 mt-1">
            建议: {recommendations[0]}
          </p>
        )}
      </div>
    </AccentBorderCard>
  );
}

// ── Executive summary (Layer 1) ──────────────────────────────

export function ExecutiveSummary({ report }: { report: AnalysisReportType }) {
  const signalStyle = getSignalStyle(report.signal);

  return (
    <div className="space-y-4">
      {/* Hero signal */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`rounded-lg border p-5 relative overflow-hidden ${signalStyle.bg} ${signalStyle.border}`}
      >
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${signalStyle.bg} border ${signalStyle.border}`}>
              {report.signal === "bullish" ? (
                <TrendingUp className="h-6 w-6 text-emerald-400" />
              ) : report.signal === "bearish" ? (
                <TrendingDown className="h-6 w-6 text-red-400" />
              ) : (
                <Minus className="h-6 w-6 text-zinc-400" />
              )}
            </div>
            <div>
              <p className={`text-lg font-bold ${signalStyle.text}`}>{signalStyle.label}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-medium text-zinc-300">{report.symbol}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-sm text-zinc-500">{modeLabel(report.mode)}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-xs font-mono text-zinc-500">{(report.execution_time_ms / 1000).toFixed(1)}s</span>
              </div>
            </div>
          </div>
          <ConfidenceRing
            value={report.confidence}
            color={report.signal === "bullish" ? "emerald" : report.signal === "bearish" ? "red" : "zinc"}
          />
        </div>

        {/* Market regime strip */}
        {report.market_regime && (
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-3 relative z-10">
            {report.market_regime === "ranging" ? (
              <ArrowRightLeft className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            ) : report.market_regime === "volatile" ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            )}
            <span className={`text-sm font-semibold ${report.market_regime === "ranging" ? "text-amber-400" : report.market_regime === "volatile" ? "text-red-400" : "text-emerald-400"}`}>
              {report.market_regime === "ranging" ? "震荡区间" : report.market_regime === "volatile" ? "高波动" : "趋势行情"}
            </span>
            {report.regime_support !== null && report.regime_resistance !== null && report.market_regime === "ranging" && (
              <span className="text-xs font-mono text-zinc-500">
                {report.regime_support?.toLocaleString()} ~ {report.regime_resistance?.toLocaleString()}
              </span>
            )}
            {report.regime_suggestion && (
              <p className="text-xs text-zinc-500 ml-auto max-w-[240px] md:truncate line-clamp-2 md:line-clamp-none" title={report.regime_suggestion}>
                {report.regime_suggestion}
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* Strategy card */}
      {report.strategy && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <StrategyCard strategy={report.strategy} />
        </motion.div>
      )}

      {/* Action advice banner (compact) */}
      {report.strategy && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}>
          <ActionAdviceBanner strategy={report.strategy} />
        </motion.div>
      )}

      {/* Position calculator — scalping 不显示 */}
      {report.strategy && report.mode !== "scalping" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}>
          <PositionCalculator
            input={fromStrategy(report.strategy)}
            isWorthTaking={report.strategy.is_worth_taking}
            confidence={report.strategy.confidence}
            isFallback={report.strategy.is_fallback}
          />
        </motion.div>
      )}

      {/* Risk accent card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}>
        <RiskCard sections={report.sections} />
      </motion.div>

      {/* Status banner */}
      {(report.status && report.status !== "actionable") || (report.status === "actionable" && report.data_quality_snapshot) ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <AnalysisStatusBanner report={report} />
        </motion.div>
      ) : null}

      {/* Status badges */}
      {(report.cached || report.is_partial || report.completeness_warning) && (
        <div className="flex items-center gap-2 flex-wrap">
          {report.cached && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
              <Database className="h-3 w-3" />
              缓存
              {report.cached_at && <span className="text-blue-400/60"> · {formatCachedTime(report.cached_at)}</span>}
            </span>
          )}
          {report.is_partial && (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-400">
              <AlertTriangle className="h-3 w-3" />
              部分报告
            </span>
          )}
          {report.completeness_warning && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400" title={report.completeness_warning}>
              <AlertTriangle className="h-3 w-3" />
              数据不完整
            </span>
          )}
        </div>
      )}

      {/* Fallback warning */}
      {report.sections.some((s) => typeof s.data?.reasoning === "string" && isFallbackReasoning(s.data.reasoning as string)) && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.04] px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          <p className="text-sm text-yellow-400">
            部分智能体返回了降级响应，分析结果可能不完整。请检查后台 AI 密钥配置或重新分析。
          </p>
        </div>
      )}
    </div>
  );
}
