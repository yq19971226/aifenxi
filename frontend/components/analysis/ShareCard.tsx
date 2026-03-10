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
  bullish: { primary: "#16a34a", bg: "#f0fdf4", emoji: "📈", dirEmoji: "🟢", label: "做多", headerBg: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)" },
  bearish: { primary: "#dc2626", bg: "#fef2f2", emoji: "📉", dirEmoji: "🔴", label: "做空", headerBg: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" },
  neutral: { primary: "#71717a", bg: "#fafafa", emoji: "⏸️", dirEmoji: "⚪", label: "观望", headerBg: "linear-gradient(135deg, #52525b 0%, #3f3f46 100%)" },
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
  card: { width: 420, background: "#ffffff", borderRadius: 16, overflow: "hidden" as const, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif', color: "#1f2937", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" },
  sectionBox: (borderColor: string) => ({ margin: "0 20px", border: "1px solid #e5e7eb", borderLeft: `3px solid ${borderColor}`, borderRadius: 8, padding: "14px 16px", marginBottom: 14, background: "#ffffff" }),
  row: { display: "flex" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: "7px 0", borderBottom: "1px solid #f3f4f6" },
  rowLast: { display: "flex" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: "7px 0" },
  label: { fontSize: 13, color: "#6b7280", fontWeight: 500 as const },
  value: { fontSize: 13, fontWeight: 600 as const, color: "#111827", textAlign: "right" as const },
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
      <div ref={ref} style={S.card}>
        {/* ── Header ── */}
        <div style={{ background: t.headerBg, padding: "20px 24px", textAlign: "center" as const }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", letterSpacing: "0.02em" }}>
            {t.emoji} {report.symbol}{displayDirection !== "neutral" ? t.label : "观望"}交易信号 {t.emoji}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 6 }}>
            {subtitle}
          </div>
        </div>

        <div style={{ padding: "14px 0 0" }}>
          {/* ── Section 1: 信号概览 ── */}
          <div style={S.sectionBox(t.primary)}>
            <div style={S.row}>
              <span style={S.label}>交易标的</span>
              <span style={{ ...S.value, color: t.primary }}>{report.symbol}</span>
            </div>
            <div style={S.row}>
              <span style={S.label}>交易方向</span>
              <span style={{ ...S.value, color: t.primary, fontSize: 14, fontWeight: 700 }}>
                {t.dirEmoji} {dirLabel}
              </span>
            </div>
            <div style={S.row}>
              <span style={S.label}>AI 置信度</span>
              <span style={S.value}>
                {Math.round(report.confidence * 100)}% {"⭐".repeat(Math.min(5, Math.ceil(report.confidence * 5)))}
              </span>
            </div>
            <div style={S.rowLast}>
              <span style={S.label}>分析模式</span>
              <span style={S.value}>{modeLabel(report.mode)}</span>
            </div>
          </div>

          {/* ── Section 2: 策略摘要（含进场/止损/止盈点位） ── */}
          {report.strategy && isLlmDegraded ? (
            <div style={S.sectionBox("#f59e0b")}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#9a3412", marginBottom: 4 }}>
                策略生成异常
              </div>
              <div style={{ fontSize: 12, color: "#78716c", lineHeight: 1.6 }}>
                智能体返回了降级响应，建议重新分析后再分享策略摘要。
              </div>
            </div>
          ) : report.strategy && displayDirection !== "neutral" && (
            <div style={S.sectionBox("#6366f1")}>
              <div style={S.row}>
                <span style={S.label}>策略类型</span>
                <span style={S.value}>{report.strategy.is_fallback ? "估算策略" : "标准策略"}</span>
              </div>
              {(report.strategy.entry_low != null || report.strategy.entry_high != null) && (
                <div style={S.row}>
                  <span style={S.label}>进场点位</span>
                  <span style={S.value}>
                    {report.strategy.entry_low != null ? report.strategy.entry_low.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                    {" ~ "}
                    {report.strategy.entry_high != null ? report.strategy.entry_high.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </span>
                </div>
              )}
              {report.strategy.stop_loss != null && (
                <div style={S.row}>
                  <span style={S.label}>止损</span>
                  <span style={{ ...S.value, color: "#dc2626", fontWeight: 700 }}>
                    {report.strategy.stop_loss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {report.strategy.targets && report.strategy.targets.length > 0 && (
                <div style={S.row}>
                  <span style={S.label}>止盈/目标位</span>
                  <span style={{ ...S.value, color: "#16a34a", fontWeight: 600 }}>
                    {report.strategy.targets.slice(0, 3).map((t, i) => `T${i + 1}:${t.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" ")}
                  </span>
                </div>
              )}
              {(report.strategy.risk_reward_ratio ?? 0) > 0 && (
                <div style={S.row}>
                  <span style={S.label}>盈亏比 📊</span>
                  <span style={{ ...S.value, color: "#6366f1", fontWeight: 700 }}>
                    {(report.strategy.risk_reward_ratio ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
              <div style={S.row}>
                <span style={S.label}>策略置信度</span>
                <span style={S.value}>
                  {typeof report.strategy.confidence === "number"
                    ? `${Math.round(report.strategy.confidence * 100)}%`
                    : "—"}
                </span>
              </div>
              <div style={S.row}>
                <span style={S.label}>值得操作</span>
                <span style={S.value}>
                  {report.strategy.is_worth_taking ? "✅ 推荐" : "⚠️ 谨慎"}
                </span>
              </div>
              <div style={S.row}>
                <span style={S.label}>市场状态</span>
                <span style={S.value}>{regimeText}</span>
              </div>
              <div style={S.rowLast}>
                <span style={S.label}>信号时效</span>
                <span style={S.value}>{validUntilText}</span>
              </div>
            </div>
          )}

          {/* ── Section 3: AI 共识 ── */}
          {consensus.total > 0 && (
            <div style={S.sectionBox("#f59e0b")}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 10 }}>
                🤖 AI 共识详情
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                {consensus.bullish > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", borderRadius: 6, padding: "4px 12px", border: "1px solid #bbf7d0" }}>
                    📈 看涨 {consensus.bullish}
                  </span>
                )}
                {consensus.bearish > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", background: "#fef2f2", borderRadius: 6, padding: "4px 12px", border: "1px solid #fecaca" }}>
                    📉 看跌 {consensus.bearish}
                  </span>
                )}
                {consensus.neutral > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#71717a", background: "#f4f4f5", borderRadius: 6, padding: "4px 12px", border: "1px solid #e4e4e7" }}>
                    ⏸️ 中性 {consensus.neutral}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#78716c" }}>
                共 {consensus.total} 个智能体参与分析，
                {consensusSummaryText(consensus)}
              </div>
            </div>
          )}

          {/* ── Scalping warning ── */}
          {report.mode === "scalping" && (
            <div style={{ margin: "0 20px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderLeft: "3px solid #f59e0b", borderRadius: 8, padding: "12px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#9a3412", marginBottom: 4 }}>
                ⚡ 实时短线提示
              </div>
              <div style={{ fontSize: 11, color: "#78716c", lineHeight: 1.6 }}>
                实时短线分析基于技术指标快速判断，假信号较多，仅供辅助参考，请结合自身经验与盘面情况自行决策。
              </div>
            </div>
          )}

          {/* ── Disclaimer ── */}
          <div style={{ margin: "0 20px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
              ⚠️ 重要免责声明
            </div>
            <div style={{ fontSize: 11, color: "#78716c", lineHeight: 1.6 }}>
              此信号由 AI 多智能体分析生成，仅供参考，不构成投资建议。加密货币交易存在极高风险，请谨慎决策，自负盈亏。
            </div>
          </div>
        </div>

        {/* ── Brand footer ── */}
        <div style={{ background: "#f9fafb", borderTop: "1px solid #e5e7eb", padding: "10px 24px", textAlign: "center" as const, fontSize: 12, color: "#9ca3af" }}>
          <span>本图由 </span>
          <span style={{ fontWeight: 700, color: "#6b7280" }}>{cfg.brandName}</span>
          <span> 生成</span>
          {cfg.brandLevel >= 2 && cfg.domain && (
            <span> | {cfg.domain}</span>
          )}
          {cfg.brandLevel >= 3 && cfg.description && (
            <span> · {cfg.description}</span>
          )}
          <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 2 }}>{timeStr}</div>
        </div>
      </div>
    );
  },
);
