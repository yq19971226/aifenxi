"use client";

import { forwardRef } from "react";
import { TrendingUp, TrendingDown, Minus, ShieldCheck } from "lucide-react";

import type { AnalysisReport } from "@/lib/api/analysis";
import { modeLabel, getSignalStyle } from "./helpers";

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

function signalLabel(signal: string): string {
  if (signal === "bullish") return "看涨";
  if (signal === "bearish") return "看跌";
  return "中性";
}

function signalColor(signal: string): string {
  if (signal === "bullish") return "#10b981";
  if (signal === "bearish") return "#ef4444";
  return "#a1a1aa";
}

function agentConsensus(sections: AnalysisReport["sections"]) {
  const agents = sections.filter(
    (s) => s.status === "completed" && s.data?.signal && s.title !== "策略建议",
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

// ── ShareCard ────────────────────────────────────────────────

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  function ShareCard({ report, config: configOverride }, ref) {
    const cfg = { ...DEFAULT_CONFIG, ...configOverride };
    const consensus = agentConsensus(report.sections);
    const sc = signalColor(report.signal);
    const ts = new Date(report.timestamp);
    const timeStr = ts.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const validUntil = report.strategy?.valid_until
      ? new Date(report.strategy.valid_until).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    return (
      <div
        ref={ref}
        style={{
          width: 400,
          background: "#ffffff",
          borderRadius: 16,
          overflow: "hidden",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "#1a1a2e",
        }}
      >
        {/* Header accent bar */}
        <div style={{ height: 4, background: sc }} />

        {/* Main content */}
        <div style={{ padding: "20px 24px 16px" }}>
          {/* Symbol + mode */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                {report.symbol}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  background: "#f4f4f5",
                  borderRadius: 4,
                  padding: "2px 8px",
                  color: "#71717a",
                }}
              >
                {modeLabel(report.mode)}
              </span>
            </div>
            <span style={{ fontSize: 12, color: "#a1a1aa" }}>{timeStr}</span>
          </div>

          {/* Signal + confidence */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: `${sc}14`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {report.signal === "bullish" ? (
                <TrendingUp size={28} color={sc} />
              ) : report.signal === "bearish" ? (
                <TrendingDown size={28} color={sc} />
              ) : (
                <Minus size={28} color={sc} />
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: sc,
                  lineHeight: 1.2,
                }}
              >
                {signalLabel(report.signal)}
              </div>
              <div style={{ fontSize: 14, color: "#71717a", marginTop: 2 }}>
                置信度{" "}
                <span style={{ fontWeight: 600, color: "#3f3f46" }}>
                  {Math.round(report.confidence * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* AI consensus strip */}
          {consensus.total > 0 && (
            <div
              style={{
                background: "#fafafa",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#52525b",
                }}
              >
                <ShieldCheck size={14} color="#6366f1" />
                {consensus.total} AI 智能体共识
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {consensus.bullish > 0 && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#10b981",
                      background: "#10b98114",
                      borderRadius: 6,
                      padding: "3px 10px",
                    }}
                  >
                    ▲ 看涨 {consensus.bullish}
                  </span>
                )}
                {consensus.bearish > 0 && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#ef4444",
                      background: "#ef444414",
                      borderRadius: 6,
                      padding: "3px 10px",
                    }}
                  >
                    ▼ 看跌 {consensus.bearish}
                  </span>
                )}
                {consensus.neutral > 0 && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#a1a1aa",
                      background: "#a1a1aa14",
                      borderRadius: 6,
                      padding: "3px 10px",
                    }}
                  >
                    ● 中性 {consensus.neutral}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Strategy direction hint (no absolute price) */}
          {report.strategy &&
            !report.strategy.is_fallback &&
            report.strategy.direction !== "neutral" && (
              <div
                style={{
                  borderLeft: `3px solid ${sc}`,
                  paddingLeft: 12,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{ fontSize: 14, fontWeight: 600, color: "#3f3f46" }}
                >
                  建议{report.strategy.direction === "long" ? "做多" : "做空"}
                </div>
                <div style={{ fontSize: 13, color: "#71717a", marginTop: 2 }}>
                  盈亏比{" "}
                  <span style={{ fontWeight: 600, color: "#3f3f46" }}>
                    {report.strategy.risk_reward_ratio.toFixed(2)}
                  </span>
                  {!report.strategy.is_worth_taking && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        color: "#f59e0b",
                        fontWeight: 500,
                      }}
                    >
                      谨慎
                    </span>
                  )}
                </div>
              </div>
            )}

          {/* Validity + risk */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "#a1a1aa",
              borderTop: "1px solid #f4f4f5",
              paddingTop: 12,
            }}
          >
            {validUntil && <span>有效至 {validUntil}</span>}
            {report.market_regime && (
              <span>
                {report.market_regime === "ranging"
                  ? "震荡区间"
                  : report.market_regime === "volatile"
                    ? "高波动"
                    : "趋势行情"}
              </span>
            )}
          </div>
        </div>

        {/* Brand footer */}
        <div
          style={{
            background: "#fafafa",
            borderTop: "1px solid #f4f4f5",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 12,
            color: "#a1a1aa",
          }}
        >
          <span style={{ fontSize: 11, color: "#d4d4d8" }}>◇</span>
          <span style={{ fontWeight: 600, color: "#71717a" }}>
            {cfg.brandName}
          </span>
          {cfg.brandLevel >= 2 && cfg.domain && (
            <>
              <span style={{ color: "#d4d4d8" }}>·</span>
              <span>{cfg.domain}</span>
            </>
          )}
          {cfg.brandLevel >= 3 && cfg.description && (
            <>
              <span style={{ color: "#d4d4d8" }}>·</span>
              <span>{cfg.description}</span>
            </>
          )}
        </div>
      </div>
    );
  },
);
