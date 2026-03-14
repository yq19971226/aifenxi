"use client";

import { forwardRef } from "react";

import type { AnalysisReport } from "@/lib/api/analysis";
import { isConsensusAgentSection, isFallbackReasoning, modeLabel } from "./helpers";

// ── Types ────────────────────────────────────────────────────

export interface ShareCardConfig {
  brandLevel: 1 | 2 | 3;
  brandName: string;
  domain: string;
  description: string;
}

const DEFAULT_CONFIG: ShareCardConfig = {
  brandLevel: 1,
  brandName: "AXIOM",
  domain: "",
  description: "AI 策略分析平台",
};

interface ShareCardProps {
  report: AnalysisReport;
  config?: Partial<ShareCardConfig>;
}

// ── Helpers ──────────────────────────────────────────────────

const THEME = {
  bullish: { primary: "#34d399", bg: "rgba(16, 185, 129, 0.05)", emoji: "📈", dirEmoji: "🟢", label: "做多", headerBg: "linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)", glow: "0 0 40px rgba(16,185,129,0.15)" },
  bearish: { primary: "#f87171", bg: "rgba(239, 68, 68, 0.05)", emoji: "📉", dirEmoji: "🔴", label: "做空", headerBg: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)", glow: "0 0 40px rgba(239,68,68,0.15)" },
  neutral: { primary: "#a1a1aa", bg: "rgba(255, 255, 255, 0.02)", emoji: "⏸️", dirEmoji: "⚪", label: "观望", headerBg: "linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%)", glow: "none" },
} as const;

function getTheme(signal: string) {
  if (signal === "bullish") return THEME.bullish;
  if (signal === "bearish") return THEME.bearish;
  return THEME.neutral;
}

function agentConsensus(sections: AnalysisReport["sections"]) {
  const agents = sections.filter(
    (s) => s.status === "completed" && s.data?.signal && isConsensusAgentSection(s.title),
  );
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const a of agents) {
    const sig = String(a.data.signal);
    if (sig === "bullish") counts.bullish++;
    else if (sig === "bearish") counts.bearish++;
    else counts.neutral++;
  }
  return { total: agents.length, ...counts };
}

function consensusSummaryText(consensus: ReturnType<typeof agentConsensus>) {
  const ranked = [
    { key: "bullish", label: "看涨", count: consensus.bullish },
    { key: "bearish", label: "看跌", count: consensus.bearish },
    { key: "neutral", label: "中性", count: consensus.neutral },
  ].sort((a, b) => b.count - a.count);

  if (ranked[0].count === 0) return "暂无明显倾向";
  if (ranked[1] && ranked[0].count === ranked[1].count) return "多空分歧较大";
  return `${ranked[0].count} 个${ranked[0].label}占多数`;
}

function regimeLabel(r: string | null): string {
  if (r === "ranging") return "震荡区间";
  if (r === "volatile") return "高波动";
  if (r === "trending") return "趋势行情";
  return "—";
}

const S = {
  card: { width: 420, background: "#09090b", borderRadius: 20, overflow: "hidden" as const, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: "#e4e4e7", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255,255,255,0.08)", position: "relative" as const },
  gridBg: { position: "absolute" as const, inset: 0, backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "20px 20px", pointerEvents: "none" as const },
  sectionBox: (borderColor: string, bg: string) => ({ position: "relative" as const, zIndex: 10, margin: "0 24px", border: "1px solid rgba(255,255,255,0.06)", borderLeft: `3px solid ${borderColor}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16, background: bg, backdropFilter: "blur(10px)" }),
  row: { display: "flex" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  rowLast: { display: "flex" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: "8px 0" },
  label: { fontSize: 13, color: "#a1a1aa", fontWeight: 500 as const, letterSpacing: "0.01em" },
  value: { fontSize: 13, fontWeight: 700 as const, color: "#ffffff", textAlign: "right" as const },
};

// ── ShareCard ────────────────────────────────────────────────

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  function ShareCard({ report, config: configOverride }, ref) {
    const cfg = { ...DEFAULT_CONFIG, ...configOverride };
    const strategy = report.strategy;
    const displayDirection = strategy?.direction
      ? strategy.direction
      : report.signal === "bullish"
        ? "long"
        : report.signal === "bearish"
          ? "short"
          : "neutral";
    const displaySignal = displayDirection === "long"
      ? "bullish"
      : displayDirection === "short"
        ? "bearish"
        : "neutral";
    const t = getTheme(displaySignal);
    const consensus = agentConsensus(report.sections);
    const subtitle = consensus.total > 0
      ? `${consensus.total} AI 智能体共识 | ${modeLabel(report.mode)}`
      : modeLabel(report.mode);
    const reasoning = strategy?.reasoning || "";
    const isLlmDegraded = strategy ? !strategy.is_fallback && isFallbackReasoning(reasoning) : false;

    const ts = new Date(report.timestamp);
    const timeStr = ts.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    const validUntil = strategy?.valid_until
      ? new Date(strategy.valid_until).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      : null;
    const regimeText = report.market_regime
      ? `${regimeLabel(report.market_regime)} 🔍`
      : "—";
    const validUntilText = validUntil ? `${validUntil} ⏰` : "—";

    const dirLabel = displayDirection === "long" ? "做多 BUY" : displayDirection === "short" ? "做空 SELL" : "观望";

    return (
      <div ref={ref} style={{...S.card, boxShadow: t.glow}}>
        <div style={S.gridBg} />
        {/* ── Header ── */}
        <div style={{ background: t.headerBg, padding: "28px 24px 24px", textAlign: "center" as const, position: "relative", zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ffffff", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {t.emoji} {report.symbol} {displayDirection !== "neutral" ? t.label : "观望"} {t.emoji}
          </div>
          <div style={{ fontSize: 13, color: t.primary, marginTop: 8, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {subtitle}
          </div>
        </div>

        <div style={{ padding: "16px 0 0", position: "relative", zIndex: 10 }}>
          {/* ── Section 1: 信号概览 ── */}
          <div style={S.sectionBox(t.primary, "rgba(255,255,255,0.02)")}>
            <div style={S.row}>
              <span style={S.label}>交易标的</span>
              <span style={{ ...S.value, color: "#ffffff", fontSize: 16 }}>{report.symbol}</span>
            </div>
            <div style={S.row}>
              <span style={S.label}>交易方向</span>
              <span style={{ ...S.value, color: t.primary, fontSize: 15, fontWeight: 800, letterSpacing: "0.05em" }}>
                {t.dirEmoji} {dirLabel}
              </span>
            </div>
            <div style={S.row}>
              <span style={S.label}>AI 置信度</span>
              <span style={{ ...S.value, color: "#fbbf24", fontFamily: 'monospace', fontSize: 15 }}>
                {Math.round(report.confidence * 100)}%
              </span>
            </div>
            <div style={S.rowLast}>
              <span style={S.label}>分析模式</span>
              <span style={S.value}>{modeLabel(report.mode)}</span>
            </div>
          </div>

          {/* ── Section 2: 策略摘要（含进场/止损/止盈点位） ── */}
          {report.strategy && isLlmDegraded ? (
            <div style={S.sectionBox("#f59e0b", "rgba(245,158,11,0.05)")}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>
                ⚠️ 策略生成异常
              </div>
              <div style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.6 }}>
                智能体返回了降级响应，建议重新分析后再分享策略摘要。
              </div>
            </div>
          ) : report.strategy && displayDirection !== "neutral" && (
            <div style={S.sectionBox("#818cf8", "rgba(99,102,241,0.03)")}>
              <div style={S.row}>
                <span style={S.label}>策略层级</span>
                <span style={{...S.value, color: "#c7d2fe", fontSize: 12}}>{report.strategy.is_fallback ? "HFT 估算策略" : "NSED 标准策略"}</span>
              </div>
              {(report.strategy.entry_low != null || report.strategy.entry_high != null || report.strategy.stop_loss != null || (report.strategy.targets && report.strategy.targets.length > 0)) ? (
                <>
              {(report.strategy.entry_low != null || report.strategy.entry_high != null) && (
                <div style={S.row}>
                  <span style={S.label}>进场区间 (Entry)</span>
                  <span style={{ ...S.value, fontFamily: 'monospace', fontSize: 14, color: "#60a5fa" }}>
                    {report.strategy.entry_low != null ? report.strategy.entry_low.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                    {" - "}
                    {report.strategy.entry_high != null ? report.strategy.entry_high.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </span>
                </div>
              )}
              {report.strategy.stop_loss != null && (
                <div style={S.row}>
                  <span style={S.label}>防守位 (Stop Loss)</span>
                  <span style={{ ...S.value, color: "#f87171", fontWeight: 800, fontFamily: 'monospace', fontSize: 14 }}>
                    {report.strategy.stop_loss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {report.strategy.targets && report.strategy.targets.length > 0 && (
                <div style={S.row}>
                  <span style={S.label}>目标位 (Target)</span>
                  <span style={{ ...S.value, color: "#34d399", fontWeight: 800, fontFamily: 'monospace', fontSize: 14 }}>
                    {report.strategy.targets.slice(0, 3).map((t, i) => `T${i + 1}:${t.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join("  ")}
                  </span>
                </div>
              )}
                </>
              ) : (
                <div style={S.row}>
                  <span style={S.label}>进场/止损/止盈</span>
                  <span style={{ ...S.value, color: "#71717a", fontSize: 12 }}>本次分析未返回精密点位</span>
                </div>
              )}
              {(report.strategy.risk_reward_ratio ?? 0) > 0 && (
                <div style={S.row}>
                  <span style={S.label}>盈亏比评估 (R/R)</span>
                  <span style={{ ...S.value, color: "#a78bfa", fontWeight: 800, fontFamily: 'monospace', fontSize: 14 }}>
                    1 : {(report.strategy.risk_reward_ratio ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
              <div style={S.row}>
                <span style={S.label}>策略评分</span>
                <span style={{...S.value, fontFamily: 'monospace', color: "#fbbf24"}}>
                  {typeof report.strategy.confidence === "number"
                    ? `${Math.round(report.strategy.confidence * 100)}%`
                    : "—"}
                </span>
              </div>
              <div style={S.row}>
                <span style={S.label}>动能验证</span>
                <span style={S.value}>
                  {report.strategy.is_worth_taking ? "✅ 符合预期" : "⚠️ 动能不足"}
                </span>
              </div>
              <div style={S.row}>
                <span style={S.label}>环境侦测</span>
                <span style={S.value}>{regimeText}</span>
              </div>
              <div style={S.rowLast}>
                <span style={S.label}>周期失效</span>
                <span style={{...S.value, color: "#a1a1aa", fontSize: 12}}>{validUntilText}</span>
              </div>
            </div>
          )}

          {/* ── Section 3: AI 共识 ── */}
          {consensus.total > 0 && (
            <div style={S.sectionBox("#f59e0b", "rgba(245,158,11,0.03)")}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, color: "#fbbf24", marginBottom: 12 }}>
                🤖 Swarm Consensus
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                {consensus.bullish > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399", background: "rgba(16,185,129,0.1)", borderRadius: 6, padding: "4px 12px", border: "1px solid rgba(16,185,129,0.2)" }}>
                    📈 看涨 {consensus.bullish}
                  </span>
                )}
                {consensus.bearish > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", background: "rgba(239,68,68,0.1)", borderRadius: 6, padding: "4px 12px", border: "1px solid rgba(239,68,68,0.2)" }}>
                    📉 看跌 {consensus.bearish}
                  </span>
                )}
                {consensus.neutral > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#a1a1aa", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "4px 12px", border: "1px solid rgba(255,255,255,0.1)" }}>
                    ⏸️ 中性 {consensus.neutral}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#a1a1aa" }}>
                共 {consensus.total} 个高阶智能体已完成网格计算
                <br />
                <span style={{ color: "#d4d4d8", fontWeight: 600 }}>{consensusSummaryText(consensus)}</span>
              </div>
            </div>
          )}

          {/* ── Scalping warning ── */}
          {report.mode === "scalping" && (
            <div style={{ margin: "0 24px 16px", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", borderLeft: "3px solid #f59e0b", borderRadius: 12, padding: "12px 16px", position: "relative", zIndex: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>
                ⚡ 毫米级超频警告
              </div>
              <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.6 }}>
                当前分析处于 HFT (高频交易) 环境。信号波动极大，请配合 L2 订单流严格止损。
              </div>
            </div>
          )}

          {/* ── Disclaimer ── */}
          <div style={{ margin: "0 24px 16px", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px", position: "relative", zIndex: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", marginBottom: 4 }}>
              DISCLAIMER 免责声明
            </div>
            <div style={{ fontSize: 11, color: "#71717a", lineHeight: 1.6 }}>
              此报告由多智能体深度网络推理生成。仅作研究用途，不构成直接财务建议。DYOR。
            </div>
          </div>
        </div>

        {/* ── Brand footer ── */}
        <div style={{ background: "rgba(0,0,0,0.4)", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "12px 24px", textAlign: "center" as const, fontSize: 11, color: "#71717a", position: "relative", zIndex: 10 }}>
          <span>Powered by </span>
          <span style={{ fontWeight: 800, color: "#d4d4d8", letterSpacing: "0.05em" }}>{cfg.brandName}™</span>
          {cfg.brandLevel >= 2 && cfg.domain && (
            <span> | {cfg.domain}</span>
          )}
          {cfg.brandLevel >= 3 && cfg.description && (
            <span> · {cfg.description}</span>
          )}
          <div style={{ fontSize: 11, color: "#71717a", marginTop: 4, fontFamily: 'monospace' }}>{timeStr}</div>
        </div>
      </div>
    );
  },
);
