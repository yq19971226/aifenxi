"use client";

import { forwardRef } from "react";
import type { SimResult } from "@/lib/api/playbook-sim";
import type { PlaybookLatest } from "@/lib/api/playbook";
import {
  getDomainLabel,
  getMarketStructureLabel,
  getRankingReasonCopy,
  getRegimeLabel,
} from "@/app/[locale]/(main)/playbook-sim/playbook-constants";
import { localizeText } from "@/components/analysis/helpers";

// ── Types ────────────────────────────────────────────────────

export interface PlaybookShareCardProps {
  sim: SimResult;
  latest?: PlaybookLatest | null;
}

// ── Helpers ──────────────────────────────────────────────────

function adoptionLabel(a: string): { text: string; color: string; emoji: string } {
  if (a === "adopt") return { text: "采纳执行", color: "#16a34a", emoji: "✅" };
  if (a === "partial") return { text: "部分采纳", color: "#f59e0b", emoji: "⚠️" };
  return { text: "暂不行动", color: "#71717a", emoji: "⏸️" };
}

function riskLabel(r: string): { text: string; color: string } {
  const s = (r ?? "").toLowerCase();
  if (s === "high" || s === "极高" || s === "aggressive" || s === "激进") return { text: "高风险", color: "#dc2626" };
  if (s === "moderate" || s === "medium" || s === "中等" || s === "中") return { text: "中风险", color: "#f59e0b" };
  return { text: "低风险", color: "#16a34a" };
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    accumulation: "吸筹", markup: "拉升", distribution: "派发",
    decline: "下跌", ranging: "震荡", breakout: "突破",
  };
  return map[phase.toLowerCase()] || phase;
}

function signalTheme(signal?: string) {
  if (signal === "bullish") return { bg: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)", emoji: "📈", label: "看涨" };
  if (signal === "bearish") return { bg: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)", emoji: "📉", label: "看跌" };
  return { bg: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", emoji: "🎭", label: "推演" };
}

// ── Inline Styles ────────────────────────────────────────────

const S = {
  card: {
    width: 420,
    background: "#ffffff",
    borderRadius: 16,
    overflow: "hidden" as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
    color: "#1f2937",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
  },
  section: (borderColor: string) => ({
    margin: "0 20px",
    border: "1px solid #e5e7eb",
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: 8,
    padding: "14px 16px",
    marginBottom: 14,
    background: "#ffffff",
  }),
  row: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    padding: "6px 0",
    borderBottom: "1px solid #f3f4f6",
  },
  rowLast: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    padding: "6px 0",
  },
  label: { fontSize: 13, color: "#6b7280", fontWeight: 500 as const },
  value: { fontSize: 13, fontWeight: 600 as const, color: "#111827", textAlign: "right" as const },
};

// ── Component ────────────────────────────────────────────────

export const PlaybookShareCard = forwardRef<HTMLDivElement, PlaybookShareCardProps>(
  function PlaybookShareCard({ sim, latest }, ref) {
    const bestMatch = sim.top_matches[0] ?? null;
    const theme = signalTheme(latest?.signal || bestMatch?.signal);
    const judge = sim.judge_adoption;
    const defense = sim.defense_strategy;
    const dealer = sim.dealer_prediction;
    const llm = sim.llm_prediction;

    const ts = new Date(sim.timestamp);
    const timeStr = ts.toLocaleString("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });

    const totalStages = bestMatch?.stages?.length ?? 0;
    const currentStageIdx = bestMatch?.current_stage_idx ?? 0;
    const marketStructureLabel = getMarketStructureLabel(bestMatch?.market_structure_type);
    const requiredDomains = bestMatch?.required_domains?.slice(0, 3) ?? [];
    const applicableRegimes = bestMatch?.applicable_regimes?.slice(0, 3) ?? [];
    const { dominantSummary, decisionSentence } = getRankingReasonCopy({
      dominant_factors: bestMatch?.dominant_factors,
      ranking_reason_summary: bestMatch?.ranking_reason_summary,
      decision_sentence: bestMatch?.decision_sentence,
      score_breakdown: bestMatch?.score_breakdown,
    });
    const matchedBoosterItems = bestMatch?.matched_confidence_boosters?.slice(0, 2) ?? [];
    const matchedInvalidationItems = bestMatch?.matched_invalidation_signals?.slice(0, 2) ?? [];

    // top 5 probabilities
    const probEntries = latest?.all_probabilities
      ? Object.entries(latest.all_probabilities)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
      : [];

    return (
      <div ref={ref} style={S.card}>
        {/* ── Header ── */}
        <div style={{ background: theme.bg, padding: "22px 24px", textAlign: "center" as const }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", letterSpacing: "0.02em" }}>
            {theme.emoji} {sim.symbol} 剧本推演 {theme.emoji}
          </div>
          {bestMatch && (
            <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" as const }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: "#ffffff",
                background: "rgba(255,255,255,0.2)", borderRadius: 6,
                padding: "3px 12px",
              }}>
                {bestMatch.name}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: bestMatch.match_pct >= 50 ? "#fef08a" : "rgba(255,255,255,0.85)",
                background: "rgba(255,255,255,0.15)", borderRadius: 6,
                padding: "3px 12px",
              }}>
                匹配 {(bestMatch.match_pct ?? 0).toFixed(1)}%
              </span>
            </div>
          )}
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
            阶段: {phaseLabel(sim.current_phase)}
            {totalStages > 0 && ` · 第${currentStageIdx + 1}/${totalStages}阶段`}
          </div>
          {decisionSentence && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.92)", marginTop: 8, fontWeight: 700 }}>
              {decisionSentence}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 0 0" }}>
          {bestMatch && (
            <div style={S.section("#6366f1")}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4338ca", marginBottom: 10 }}>
                🏆 当前排名依据
              </div>
              <div style={S.row}>
                <span style={S.label}>主导因子</span>
                <span style={{ ...S.value, maxWidth: 220, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                  {dominantSummary || "特征 / 环境综合命中"}
                </span>
              </div>
              <div style={S.row}>
                <span style={S.label}>结构解释</span>
                <span style={{ ...S.value, maxWidth: 220, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                  {bestMatch.structure_matched
                    ? `命中 ${marketStructureLabel || "该结构"}`
                    : marketStructureLabel || "未形成结构命中"}
                </span>
              </div>
              <div style={S.row}>
                <span style={S.label}>Booster</span>
                <span style={{ ...S.value, maxWidth: 220, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                  {matchedBoosterItems.length > 0
                    ? matchedBoosterItems.map((item) => localizeText(item)).join(" / ")
                    : "—"}
                </span>
              </div>
              <div style={S.rowLast}>
                <span style={S.label}>失效信号</span>
                <span style={{ ...S.value, maxWidth: 220, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                  {matchedInvalidationItems.length > 0
                    ? matchedInvalidationItems.map((item) => localizeText(item)).join(" / ")
                    : "未命中"}
                </span>
              </div>
            </div>
          )}

          {(marketStructureLabel || requiredDomains.length > 0 || applicableRegimes.length > 0) && (
            <div style={S.section("#4f46e5")}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4338ca", marginBottom: 10 }}>
                🧩 市场结构
              </div>
              <div style={S.row}>
                <span style={S.label}>结构类型</span>
                <span style={S.value}>{marketStructureLabel || "—"}</span>
              </div>
              <div style={S.row}>
                <span style={S.label}>关键数据域</span>
                <span style={{ ...S.value, maxWidth: 220, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                  {requiredDomains.length > 0
                    ? requiredDomains.map((value) => getDomainLabel(value)).join(" / ")
                    : "—"}
                </span>
              </div>
              <div style={S.rowLast}>
                <span style={S.label}>适用环境</span>
                <span style={{ ...S.value, maxWidth: 220, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                  {applicableRegimes.length > 0
                    ? applicableRegimes.map((value) => getRegimeLabel(value)).join(" / ")
                    : "—"}
                </span>
              </div>
            </div>
          )}

          {/* ── Section 1: L4 对抗推演摘要 ── */}
          <div style={S.section("#6366f1")}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#4338ca", marginBottom: 10 }}>
              🎭 L4 对抗推演
            </div>
            <div style={S.row}>
              <span style={S.label}>🧠 AI推演</span>
              <span style={S.value}>
                {llm
                  ? `下阶段概率 ${(llm.next_stage_probability * 100).toFixed(0)}%`
                  : "—"}
              </span>
            </div>
            <div style={S.row}>
              <span style={S.label}>🎯 庄家意图</span>
              <span style={{ ...S.value, maxWidth: 220, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                {dealer?.dealer_plan
                  ? (dealer.dealer_plan.length > 20
                    ? dealer.dealer_plan.slice(0, 20) + "…"
                    : dealer.dealer_plan)
                  : "—"}
              </span>
            </div>
            <div style={S.row}>
              <span style={S.label}>🛡️ 防御策略</span>
              <span style={{ ...S.value, color: defense ? riskLabel(defense.risk_level).color : "#6b7280" }}>
                {defense ? riskLabel(defense.risk_level).text : "—"}
                {defense ? ` · 置信${(defense.confidence * 100).toFixed(0)}%` : ""}
              </span>
            </div>
            <div style={S.rowLast}>
              <span style={S.label}>⚖️ 裁判裁决</span>
              <span style={{ ...S.value, color: judge ? adoptionLabel(judge.adoption).color : "#6b7280", fontWeight: 700 }}>
                {judge
                  ? `${adoptionLabel(judge.adoption).emoji} ${adoptionLabel(judge.adoption).text}`
                  : "—"}
              </span>
            </div>
          </div>

          {/* ── Section 2: 裁判评分 ── */}
          {judge && (
            <div style={S.section("#f59e0b")}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>
                📊 裁判评分
              </div>
              <div style={S.row}>
                <span style={S.label}>庄家推演可信度</span>
                <span style={S.value}>{(judge.dealer_credibility * 100).toFixed(0)}%</span>
              </div>
              <div style={S.row}>
                <span style={S.label}>防御策略可行性</span>
                <span style={S.value}>{(judge.defense_feasibility * 100).toFixed(0)}%</span>
              </div>
              {judge.next_move && (
                <div style={S.rowLast}>
                  <span style={S.label}>下一步</span>
                  <span style={{ ...S.value, maxWidth: 220, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                    {judge.next_move.length > 22 ? judge.next_move.slice(0, 22) + "…" : judge.next_move}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Section 3: 概率分布 ── */}
          {probEntries.length > 0 && (
            <div style={S.section("#8b5cf6")}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#6d28d9", marginBottom: 10 }}>
                📈 剧本概率分布
              </div>
              {probEntries.map(([name, prob], i) => (
                <div key={name} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "4px 0",
                  borderBottom: i < probEntries.length - 1 ? "1px solid #f3f4f6" : "none",
                }}>
                  <span style={{ fontSize: 12, color: "#6b7280", width: 72, flexShrink: 0, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                    {name}
                  </span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#f3f4f6", overflow: "hidden" as const }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      background: prob >= 0.5 ? "#dc2626" : prob >= 0.3 ? "#f59e0b" : "#6366f1",
                      width: `${Math.min(prob * 100, 100)}%`,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, width: 36, textAlign: "right" as const,
                    color: prob >= 0.5 ? "#dc2626" : prob >= 0.3 ? "#f59e0b" : "#374151",
                  }}>
                    {(prob * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Section 4: 风险提示 ── */}
          {judge?.risk_alerts && judge.risk_alerts.length > 0 && (
            <div style={{
              margin: "0 20px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderLeft: "3px solid #dc2626",
              borderRadius: 8,
              padding: "12px 16px",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>
                🚨 风险提示
              </div>
              {judge.risk_alerts.slice(0, 3).map((alert, i) => (
                <div key={i} style={{ fontSize: 11, color: "#78716c", lineHeight: 1.6 }}>
                  • {alert.length > 40 ? alert.slice(0, 40) + "…" : alert}
                </div>
              ))}
            </div>
          )}

          {/* ── Disclaimer ── */}
          <div style={{
            margin: "0 20px 14px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "12px 16px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
              ⚠️ 重要免责声明
            </div>
            <div style={{ fontSize: 11, color: "#78716c", lineHeight: 1.6 }}>
              此推演由 AI 对抗系统生成，仅供研究参考，不构成投资建议。加密货币交易存在极高风险，请谨慎决策，自负盈亏。
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          background: "#f9fafb",
          borderTop: "1px solid #e5e7eb",
          padding: "10px 24px",
          textAlign: "center" as const,
          fontSize: 12,
          color: "#9ca3af",
        }}>
          <span>本图由 </span>
          <span style={{ fontWeight: 700, color: "#6b7280" }}>AXIOM</span>
          <span> · AI 对抗推演系统 生成</span>
          <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 2 }}>{timeStr}</div>
        </div>
      </div>
    );
  },
);
