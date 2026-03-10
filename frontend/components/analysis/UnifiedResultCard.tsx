"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Database,
  Minus,
  Shield,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";

import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";
import {
  formatCachedTime,
  formatPrice,
  getRankingEligibility,
  getSignalStyle,
  isFallbackReasoning,
  localizeText,
  modeLabel,
} from "./helpers";
import { ConfidenceRing } from "./StrategyCard";
import { AnalysisStatusBanner } from "./StatusBanner";
import { PositionCalculator } from "@/components/trade/PositionCalculator";
import { fromStrategy } from "@/lib/utils/position-sizing";
import { ReasoningBlock } from "./renderers";
import {
  StrategyPriceSection,
  ConsensusSection,
  useConsensusData,
  useKeyFindings,
} from "./UnifiedSections";

// ── Section divider ────────────────────────────────────────

const Divider = () => <div className="border-t border-white/[0.06]" />;

// ── Unified result card ────────────────────────────────────

export function UnifiedResultCard({ report }: { report: AnalysisReportType }) {
  const strategy = report.strategy;
  const displaySignal = strategy?.direction === "long" ? "bullish" : strategy?.direction === "short" ? "bearish" : report.signal;
  const signalStyle = getSignalStyle(displaySignal);
  const isBlocked = report.status === "blocked";
  const isFallback = strategy?.is_fallback ?? false;
  const reasoning = strategy?.reasoning || "";
  const isLlmDegraded = strategy && !isFallback && isFallbackReasoning(reasoning);

  const { agentSections, counts, avgConf } = useConsensusData(report.sections);
  const findings = useKeyFindings(report.sections);

  // ── Risk ──
  const riskSection = report.sections.find((s) => s.title === "风险评估" && s.status === "completed");
  const riskLevel = riskSection ? String(riskSection.data?.risk_level || "low") : "low";
  const keyRisks = riskSection && Array.isArray(riskSection.data?.key_risks)
    ? (riskSection.data.key_risks as string[]).slice(0, 2) : [];
  const recommendations = riskSection && Array.isArray(riskSection.data?.recommendations)
    ? (riskSection.data.recommendations as string[]).slice(0, 2) : [];
  const hasRiskBlock = riskLevel !== "low" && (keyRisks.length > 0 || recommendations.length > 0);
  const hasStrategyMeta = Boolean(strategy) && !isLlmDegraded;
  const hasMetaItems = Boolean(hasStrategyMeta || report.cached || report.is_partial || report.completeness_warning);
  const showRiskMeta = hasRiskBlock || hasMetaItems;

  // ── Publish ──
  const rankingEligibility = strategy ? getRankingEligibility(report.mode, strategy) : null;
  const publishEligible = rankingEligibility?.eligible ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-lg border overflow-hidden ${signalStyle.border}`}
    >
      {/* ─── 1. Signal header ─── */}
      <div className={`p-5 ${signalStyle.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${signalStyle.bg} border ${signalStyle.border}`}>
              {displaySignal === "bullish" ? (
                <TrendingUp className="h-6 w-6 text-emerald-400" />
              ) : displaySignal === "bearish" ? (
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
            color={displaySignal === "bullish" ? "emerald" : displaySignal === "bearish" ? "red" : "zinc"}
          />
        </div>
        {report.market_regime && (
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-3 flex-wrap">
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
            {report.regime_support != null && report.regime_resistance != null && report.market_regime === "ranging" && (
              <span className="text-xs font-mono text-zinc-500">
                {formatPrice(report.regime_support)} ~ {formatPrice(report.regime_resistance)}
              </span>
            )}
            {report.regime_suggestion && (
              <p className="text-xs text-zinc-500 ml-auto max-w-[240px] md:truncate line-clamp-2 md:line-clamp-none" title={report.regime_suggestion}>
                {localizeText(report.regime_suggestion)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ─── Blocked ─── */}
      {isBlocked && (
        <div className="p-4 border-t border-white/[0.06]">
          <AnalysisStatusBanner report={report} />
        </div>
      )}

      {/* ─── Non-blocked ─── */}
      {!isBlocked && (
        <>
          {/* 2. Strategy prices */}
          <Divider />
          {strategy ? (
            isLlmDegraded ? (
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-xs font-medium text-yellow-400">策略生成异常</span>
                </div>
                <p className="mt-1.5 text-sm text-zinc-400">智能体返回了降级响应，请重试分析。</p>
              </div>
            ) : (
              <StrategyPriceSection strategy={strategy} isFallback={isFallback} />
            )
          ) : (
            <div className="p-4">
              <p className="text-sm text-zinc-500">策略建议未生成或数据不完整，可点击「重试」重新分析。</p>
            </div>
          )}

          {/* Scalping warning */}
          {report.mode === "scalping" && (
            <>
              <Divider />
              <div className="px-4 py-3 flex items-start gap-2 bg-amber-500/[0.04]">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-400">实时短线仅供辅助参考，假信号较多，请结合盘面自行决策。</p>
              </div>
            </>
          )}

          {/* 3. AI Consensus */}
          {agentSections.length > 0 && (
            <>
              <Divider />
              <ConsensusSection agentSections={agentSections} counts={counts} avgConf={avgConf} />
            </>
          )}

          {/* 4. Key findings */}
          {findings.length > 0 && (
            <>
              <Divider />
              <div className="px-4 py-3">
                <p className="text-xs font-medium text-zinc-500 mb-2">关键发现</p>
                <ul className="space-y-1">
                  {findings.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300 leading-relaxed">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                        f.signal === "bullish" ? "bg-emerald-400" : f.signal === "bearish" ? "bg-red-400" : "bg-zinc-500"
                      }`} />
                      <span>
                        {f.text}
                        <span className="ml-1.5 text-xs text-zinc-500">{f.source}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* 5. Risk + metadata */}
          {showRiskMeta && (
            <>
              <Divider />
              <div className="px-4 py-3 space-y-2">
                {hasRiskBlock && (
                  <div className="flex items-start gap-2">
                    <Shield className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${riskLevel === "high" ? "text-red-400" : "text-amber-400"}`} />
                    <div className="space-y-1 text-sm">
                      <div>
                        <span className={`font-semibold ${riskLevel === "high" ? "text-red-400" : "text-amber-400"}`}>
                          {riskLevel === "high" ? "高风险警告" : "风险提示"}
                        </span>
                      </div>
                      {keyRisks.map((risk, index) => (
                        <p key={index} className="text-zinc-400">{localizeText(risk)}</p>
                      ))}
                      {recommendations.map((recommendation, index) => (
                        <p key={index} className="text-zinc-500">
                          建议{recommendations.length > 1 ? `${index + 1}：` : "："}
                          {localizeText(recommendation)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {hasMetaItems && (
                  <div className="flex items-center gap-3 flex-wrap text-xs text-zinc-500">
                    {hasStrategyMeta && publishEligible ? (
                      <span className="inline-flex items-center gap-1 text-amber-400"><Trophy className="h-3 w-3" /> 符合排行条件</span>
                    ) : hasStrategyMeta ? (
                      <span className="inline-flex items-center gap-1"><Ban className="h-3 w-3" /> 不参与排行{rankingEligibility?.reason ? ` · ${rankingEligibility.reason}` : ""}</span>
                    ) : null}
                    {hasStrategyMeta && strategy?.valid_until && <span>有效至 {new Date(strategy.valid_until).toLocaleString("zh-CN")}</span>}
                    {report.cached && (
                      <span className="inline-flex items-center gap-1 text-blue-400">
                        <Database className="h-3 w-3" /> 缓存{report.cached_at && ` · ${formatCachedTime(report.cached_at)}`}
                      </span>
                    )}
                    {report.is_partial && <span className="inline-flex items-center gap-1 text-yellow-400"><AlertTriangle className="h-3 w-3" /> 部分报告</span>}
                    {report.completeness_warning && (
                      <span className="inline-flex items-center gap-1 text-orange-400" title={report.completeness_warning}><AlertTriangle className="h-3 w-3" /> 数据不完整</span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 6. Position calculator */}
          {strategy && !isLlmDegraded && report.mode !== "scalping" && (
            <>
              <Divider />
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer list-none text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors select-none [&::-webkit-details-marker]:hidden">
                  <span>仓位计算器</span>
                  <span className="text-xs text-zinc-500 group-open:hidden">点击展开</span>
                </summary>
                <div className="px-4 pb-4">
                  <PositionCalculator input={fromStrategy(strategy)} isWorthTaking={strategy.is_worth_taking} confidence={strategy.confidence} isFallback={strategy.is_fallback} />
                </div>
              </details>
            </>
          )}

          {/* 7. AI reasoning */}
          {strategy && reasoning && !isFallbackReasoning(reasoning) && (
            <>
              <Divider />
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer list-none text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors select-none [&::-webkit-details-marker]:hidden">
                  <span>AI 推理逻辑</span>
                  <span className="text-xs text-zinc-500 group-open:hidden">点击展开</span>
                </summary>
                <div className="px-4 pb-4">
                  <ReasoningBlock text={localizeText(reasoning)} />
                </div>
              </details>
            </>
          )}

          {/* Status banner */}
          {((report.status && report.status !== "actionable") || (report.status === "actionable" && report.data_quality_snapshot)) && (
            <>
              <Divider />
              <div className="p-4"><AnalysisStatusBanner report={report} /></div>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
