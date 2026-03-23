"use client";

import { forwardRef } from "react";
import { useTranslations } from "next-intl";

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
  description: "AI Strategy Analysis Platform",
};

interface ShareCardProps {
  report: AnalysisReport;
  config?: Partial<ShareCardConfig>;
}

// ── Helpers ──────────────────────────────────────────────────

const THEME_COLORS = {
  bullish: { primary: "#34d399", bg: "rgba(16, 185, 129, 0.05)", emoji: "📈", dirEmoji: "🟢", headerBg: "linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(16, 185, 129, 0.05) 100%)", glow: "0 0 60px rgba(16,185,129,0.12)" },
  bearish: { primary: "#f87171", bg: "rgba(239, 68, 68, 0.05)", emoji: "📉", dirEmoji: "🔴", headerBg: "linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.05) 100%)", glow: "0 0 60px rgba(239,68,68,0.12)" },
  neutral: { primary: "#a1a1aa", bg: "rgba(255, 255, 255, 0.02)", emoji: "⏸️", dirEmoji: "⚪", headerBg: "linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%)", glow: "none" },
} as const;

function getThemeColors(signal: string) {
  if (signal === "bullish") return THEME_COLORS.bullish;
  if (signal === "bearish") return THEME_COLORS.bearish;
  return THEME_COLORS.neutral;
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

// ── Inline Styles ────────────────────────────────────────────

const S = {
  card: { width: 420, background: "#09090b", borderRadius: 20, overflow: "hidden" as const, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: "#e4e4e7", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255,255,255,0.08)", position: "relative" as const },
  gridBg: { position: "absolute" as const, inset: 0, backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "20px 20px", pointerEvents: "none" as const },
  sectionBox: (borderColor: string, bg: string) => ({ position: "relative" as const, zIndex: 10, margin: "0 20px", border: "1px solid rgba(255,255,255,0.06)", borderLeft: `3px solid ${borderColor}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, background: bg, backdropFilter: "blur(10px)" }),
  row: { display: "flex" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  rowLast: { display: "flex" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: "6px 0" },
  label: { fontSize: 12, color: "#a1a1aa", fontWeight: 500 as const, letterSpacing: "0.01em" },
  value: { fontSize: 12, fontWeight: 700 as const, color: "#ffffff", textAlign: "right" as const },
};

// ── ShareCard ────────────────────────────────────────────────

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  function ShareCard({ report, config: configOverride }, ref) {
    const t = useTranslations("analysis.shareCard");
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
    const tc = getThemeColors(displaySignal);
    const consensus = agentConsensus(report.sections);
    const reasoning = strategy?.reasoning || "";
    const isLlmDegraded = strategy ? !strategy.is_fallback && isFallbackReasoning(reasoning) : false;

    const ts = new Date(report.timestamp);
    const timeStr = ts.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    const validUntil = strategy?.valid_until
      ? new Date(strategy.valid_until).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      : null;

    // ── Translated helpers ────────────────────────────────────
    const dirLabel = displayDirection === "long" ? t("bullish") : displayDirection === "short" ? t("bearish") : t("neutral");

    const regimeText = (() => {
      if (!report.market_regime) return "—";
      const regime = report.market_regime;
      return regime === "ranging" ? t("ranging") : regime === "volatile" ? t("volatile") : regime === "trending" ? t("trending") : regime;
    })();

    // ── Confluence tags ───────────────────────────────────────
    const TREND_TAG_MAP: Record<string, { label: string; color: string; bg: string }> = {
      "trend:resonant": { label: t("trendResonant"),  color: "#34d399", bg: "rgba(16,185,129,0.12)" },
      "trend:counter":  { label: t("trendCounter"),   color: "#f87171", bg: "rgba(239,68,68,0.12)" },
      "trend:neutral":  { label: t("trendNeutral"),   color: "#a1a1aa", bg: "rgba(255,255,255,0.06)" },
      "trend:stale":    { label: t("trendStale"),     color: "#71717a", bg: "rgba(255,255,255,0.04)" },
    };
    const WHALE_TAG_MAP: Record<string, { label: string; color: string; bg: string }> = {
      "whale:funding_rate_extreme": { label: t("whaleFundingExtreme"), color: "#fbbf24", bg: "rgba(245,158,11,0.12)" },
      "whale:liquidation_surge":    { label: t("whaleLiquidationSurge"),   color: "#f97316", bg: "rgba(249,115,22,0.12)" },
      "whale:netflow_dump_risk":    { label: t("whaleNetflowDump"), color: "#a78bfa", bg: "rgba(139,92,246,0.12)" },
      "whale:lsr_crowded":          { label: t("whaleLsrCrowded"), color: "#f87171", bg: "rgba(239,68,68,0.10)" },
    };
    const ALL_TAG_MAP = { ...TREND_TAG_MAP, ...WHALE_TAG_MAP };
    const confluenceTags = (report.confluence_tags ?? []).map(
      (tag) => ALL_TAG_MAP[tag] ?? null
    ).filter(Boolean) as Array<{ label: string; color: string; bg: string }>;

    // ── Consensus bar segments ────────────────────────────────
    const consensusTotal = consensus.total || 1;
    const bullPct = Math.round((consensus.bullish / consensusTotal) * 100);
    const bearPct = Math.round((consensus.bearish / consensusTotal) * 100);
    const neutPct = 100 - bullPct - bearPct;

    return (
      <div ref={ref} style={{...S.card, boxShadow: tc.glow}}>
        <div style={S.gridBg} />

        {/* ── Header: 大字信号 + 置信度 ── */}
        <div style={{ background: tc.headerBg, padding: "24px 20px 20px", position: "relative", zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          {/* 顶部：币种 + 模式 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", letterSpacing: "0.03em" }}>
              {report.symbol}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", background: "rgba(255,255,255,0.06)", padding: "3px 10px", borderRadius: 6, letterSpacing: "0.04em" }}>
              {modeLabel(report.mode)}
            </span>
          </div>

          {/* 中间：方向大字 + 置信度 */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: tc.primary, letterSpacing: "0.02em" }}>
              {tc.dirEmoji} {dirLabel}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace" }}>
              {Math.round(report.confidence * 100)}%
            </span>
          </div>

          {/* 市场状态 + 时间 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "#a1a1aa" }}>
              {t("regimeDetection")}：{regimeText}
            </span>
            <span style={{ fontSize: 11, color: "#71717a", fontFamily: "monospace" }}>
              {timeStr}
            </span>
          </div>

          {/* 共振/风险标签 */}
          {confluenceTags.length > 0 && (
            <div style={{ paddingTop: 10, display: "flex", gap: 5, flexWrap: "wrap" as const }}>
              {confluenceTags.map((tag, i) => (
                <span key={i} style={{
                  fontSize: 10, fontWeight: 700,
                  color: tag.color, background: tag.bg,
                  borderRadius: 5, padding: "2px 8px",
                  border: `1px solid ${tag.color}33`,
                }}>{tag.label}</span>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 0 0", position: "relative", zIndex: 10 }}>

          {/* ── Section 1: 策略点位（紧凑 2 列网格） ── */}
          {report.strategy && isLlmDegraded ? (
            <div style={S.sectionBox("#f59e0b", "rgba(245,158,11,0.05)")}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>
                {t("strategyAnomaly")}
              </div>
              <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.6 }}>
                {t("strategyAnomalyDesc")}
              </div>
            </div>
          ) : report.strategy && displayDirection !== "neutral" && (
            <div style={S.sectionBox("#818cf8", "rgba(99,102,241,0.03)")}>
              {/* 策略头 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", letterSpacing: "0.04em" }}>
                  {report.strategy.is_fallback ? "HFT 估算策略" : "NSED 标准策略"}
                </span>
                {(report.strategy.risk_reward_ratio ?? 0) > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#a78bfa", fontFamily: "monospace" }}>
                    R:R 1:{(report.strategy.risk_reward_ratio ?? 0).toFixed(1)}
                  </span>
                )}
              </div>

              {/* 2 列网格: 入场/止损/目标 */}
              {(report.strategy.entry_low != null || report.strategy.entry_high != null || report.strategy.stop_loss != null || (report.strategy.targets && report.strategy.targets.length > 0)) ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
                  {/* 入场区间 */}
                  {(report.strategy.entry_low != null || report.strategy.entry_high != null) && (
                    <div>
                      <div style={{ fontSize: 10, color: "#71717a", marginBottom: 2 }}>{t("entryRange")}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontFamily: "monospace" }}>
                        {report.strategy.entry_low != null ? report.strategy.entry_low.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : "—"}
                        {" ~ "}
                        {report.strategy.entry_high != null ? report.strategy.entry_high.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : "—"}
                      </div>
                    </div>
                  )}

                  {/* 止损 */}
                  {report.strategy.stop_loss != null && (
                    <div>
                      <div style={{ fontSize: 10, color: "#71717a", marginBottom: 2 }}>{t("stopLoss")}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#f87171", fontFamily: "monospace" }}>
                        {report.strategy.stop_loss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })}
                      </div>
                    </div>
                  )}

                  {/* 目标价 */}
                  {report.strategy.targets && report.strategy.targets.length > 0 && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 10, color: "#71717a", marginBottom: 2 }}>{t("target")}</div>
                      <div style={{ display: "flex", gap: 12 }}>
                        {report.strategy.targets.slice(0, 3).map((tgt, i) => (
                          <span key={i} style={{ fontSize: 13, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>
                            T{i + 1}: {tgt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#71717a" }}>{t("noKeyLevels")}</div>
              )}

              {/* 底部：动量 + 有效期 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 11, color: "#a1a1aa" }}>
                  {t("momentumVerify")}：
                  <span style={{ color: report.strategy.is_worth_taking ? "#34d399" : "#f87171", fontWeight: 700 }}>
                    {report.strategy.is_worth_taking ? t("momentumOk") : t("momentumWeak")}
                  </span>
                </span>
                {validUntil && (
                  <span style={{ fontSize: 10, color: "#71717a" }}>
                    ⏰ {validUntil}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Section 2: AI 共识 — 进度条可视化 ── */}
          {consensus.total > 0 && (
            <div style={S.sectionBox("#f59e0b", "rgba(245,158,11,0.03)")}>
              <div style={{ fontSize: 11, letterSpacing: "0.04em", fontWeight: 700, color: "#fbbf24", marginBottom: 10 }}>
                {t("consensusTitle")} · {consensus.total} {t("agentsConsensus")}
              </div>

              {/* 共识进度条 */}
              <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
                {consensus.bullish > 0 && (
                  <div style={{ width: `${bullPct}%`, background: "#34d399", transition: "width 0.3s" }} />
                )}
                {consensus.neutral > 0 && (
                  <div style={{ width: `${neutPct}%`, background: "#71717a", transition: "width 0.3s" }} />
                )}
                {consensus.bearish > 0 && (
                  <div style={{ width: `${bearPct}%`, background: "#f87171", transition: "width 0.3s" }} />
                )}
              </div>

              {/* 共识标签 */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399" }}>
                  {t("bullishLabel")} {consensus.bullish}
                </span>
                {consensus.neutral > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa" }}>
                    {t("neutralLabel")} {consensus.neutral}
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171" }}>
                  {t("bearishLabel")} {consensus.bearish}
                </span>
              </div>
            </div>
          )}

          {/* ── Scalping 提示 ── */}
          {report.mode === "scalping" && (
            <div style={{ margin: "0 20px 12px", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", borderLeft: "3px solid #f59e0b", borderRadius: 12, padding: "10px 14px", position: "relative", zIndex: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 3 }}>
                {t("scalpingTitle")}
              </div>
              <div style={{ fontSize: 10, color: "#a1a1aa", lineHeight: 1.6 }}>
                {t("scalpingDesc")}
              </div>
            </div>
          )}

          {/* ── 免责声明（单行精简） ── */}
          <div style={{ margin: "0 20px 12px", padding: "8px 14px", position: "relative", zIndex: 10, borderTop: "1px dashed rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 10, color: "#52525b", lineHeight: 1.5 }}>
              ⚠️ {t("disclaimerDesc")}
            </div>
          </div>
        </div>

        {/* ── Brand footer: Google 搜索引导 ── */}
        <div style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%)", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "14px 20px 16px", textAlign: "center" as const, position: "relative", zIndex: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#d4d4d8", letterSpacing: "0.06em" }}>
            {cfg.brandName}™ · 洞察分析
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 500 }}>
              搜索
            </span>
            <span style={{ fontSize: 12, color: "#e4e4e7", fontWeight: 700, background: "rgba(255,255,255,0.06)", padding: "2px 10px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)" }}>
              AXIOM 洞察分析
            </span>
          </div>
        </div>
      </div>
    );
  },
);
