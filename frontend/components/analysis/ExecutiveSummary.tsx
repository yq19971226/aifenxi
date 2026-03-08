"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  Database,
  Minus,
  Shield,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { AnalysisReport as AnalysisReportType, ReportSection } from "@/lib/api/analysis";
import type { StrategyData } from "@/lib/types/strategy";
import {
  blockedReasonLabel,
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

// ── Action advice card (操作建议色条) ────────────────────────

function ActionAdviceCard({ strategy }: { strategy: StrategyData }) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const dir = strategy.direction;
  const isFallback = strategy.is_fallback;

  if (isFallback || dir === "neutral") return null;

  const entryLow = strategy.entry_low;
  const entryHigh = strategy.entry_high;
  const stopLoss = strategy.stop_loss;
  const targets = strategy.targets || [];
  const reasoning = strategy.reasoning || "";
  const showReasoning = reasoning.length > 0 && !isFallbackReasoning(reasoning);

  const isLong = dir === "long";
  const accentType: AccentType = isLong ? "action-long" : "action-short";

  const entryStr = entryLow && entryHigh
    ? `入场 ${formatPrice(entryLow)} ~ ${formatPrice(entryHigh)}`
    : "";
  const title = isLong
    ? `建议做多${entryStr ? ` · ${entryStr}` : ""}`
    : `建议做空${entryStr ? ` · ${entryStr}` : ""}`;

  return (
    <AccentBorderCard type={accentType} title={title} icon={isLong ? TrendingUp : TrendingDown}>
      <div className="space-y-1.5">
        {stopLoss && (
          <p className="text-sm text-zinc-400">
            止损 <span className="font-mono font-medium text-red-400">{formatPrice(stopLoss)}</span>
          </p>
        )}
        {targets.length > 0 && (
          <p className="text-sm text-zinc-400">
            目标{" "}
            {targets.map((t, i) => (
              <span key={i} className="font-mono font-medium text-emerald-400">
                {i > 0 && " / "}{formatPrice(t)}
              </span>
            ))}
          </p>
        )}
        {strategy.risk_reward_ratio > 0 && (
          <p className="text-sm text-zinc-400">
            盈亏比 <span className="font-mono font-medium text-zinc-200">1 : {strategy.risk_reward_ratio.toFixed(1)}</span>
          </p>
        )}
        {showReasoning && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setReasoningExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <motion.div animate={{ rotate: reasoningExpanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
                <ChevronDown className="h-3 w-3" />
              </motion.div>
              分析逻辑
            </button>
            {reasoningExpanded && (
              <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
                {reasoning}
              </p>
            )}
          </div>
        )}
      </div>
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
        className={`rounded-2xl border p-5 relative overflow-hidden ${signalStyle.bg} ${signalStyle.border}`}
      >
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${signalStyle.bg} border ${signalStyle.border}`}>
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
                <span className="text-zinc-600">·</span>
                <span className="text-sm text-zinc-500">{modeLabel(report.mode)}</span>
                <span className="text-zinc-600">·</span>
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
              <p className="text-xs text-zinc-500 ml-auto max-w-[240px] truncate" title={report.regime_suggestion}>
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

      {/* Action advice accent card */}
      {report.strategy && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}>
          <ActionAdviceCard strategy={report.strategy} />
        </motion.div>
      )}

      {/* Position calculator — scalping 不显示 */}
      {report.strategy && report.mode !== "scalping" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}>
          <PositionCalculator
            input={fromStrategy(report.strategy as StrategyData)}
            isWorthTaking={(report.strategy as StrategyData).is_worth_taking}
            confidence={(report.strategy as StrategyData).confidence}
            isFallback={(report.strategy as StrategyData).is_fallback}
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
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              {report.completeness_warning}
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
