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
  bullish: { primary: "#34d399", bg: "rgba(16, 185, 129, 0.05)", emoji: "📈", dirEmoji: "🟢", headerBg: "linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)", glow: "0 0 40px rgba(16,185,129,0.15)" },
  bearish: { primary: "#f87171", bg: "rgba(239, 68, 68, 0.05)", emoji: "📉", dirEmoji: "🔴", headerBg: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)", glow: "0 0 40px rgba(239,68,68,0.15)" },
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
    const subtitle = consensus.total > 0
      ? `${consensus.total} ${t("agentsConsensus")} | ${modeLabel(report.mode)}`
      : modeLabel(report.mode);
    const reasoning = strategy?.reasoning || "";
    const isLlmDegraded = strategy ? !strategy.is_fallback && isFallbackReasoning(reasoning) : false;

    const ts = new Date(report.timestamp);
    const timeStr = ts.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    const validUntil = strategy?.valid_until
      ? new Date(strategy.valid_until).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      : null;

    // ── Translated helpers ────────────────────────────────────
    const dirLabel = displayDirection === "long" ? t("bullish") : displayDirection === "short" ? t("bearish") : t("neutral");
    const themeLabel = displaySignal === "bullish" ? t("bullish") : displaySignal === "bearish" ? t("bearish") : t("neutral");

    const regimeText = (() => {
      if (!report.market_regime) return "—";
      const regime = report.market_regime;
      const label = regime === "ranging" ? t("ranging") : regime === "volatile" ? t("volatile") : regime === "trending" ? t("trending") : regime;
      return `${label} 🔍`;
    })();

    const validUntilText = validUntil ? `${validUntil} ⏰` : "—";

    const consensusSummary = (() => {
      const ranked = [
        { key: "bullish", label: t("bullishLabel").replace(/^📈\s*/, ""), count: consensus.bullish },
        { key: "bearish", label: t("bearishLabel").replace(/^📉\s*/, ""), count: consensus.bearish },
        { key: "neutral", label: t("neutralLabel").replace(/^⏸️\s*/, ""), count: consensus.neutral },
      ].sort((a, b) => b.count - a.count);
      if (ranked[0].count === 0) return t("noTendency");
      if (ranked[1] && ranked[0].count === ranked[1].count) return t("splitView");
      return t("majorityOf").replace("{count}", String(ranked[0].count)).replace("{label}", ranked[0].label);
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

    return (
      <div ref={ref} style={{...S.card, boxShadow: tc.glow}}>
        <div style={S.gridBg} />
        {/* ── Header ── */}
        <div style={{ background: tc.headerBg, padding: "28px 24px 24px", textAlign: "center" as const, position: "relative", zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ffffff", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {tc.emoji} {report.symbol} {displayDirection !== "neutral" ? themeLabel : t("neutral")} {tc.emoji}
          </div>
          <div style={{ fontSize: 13, color: tc.primary, marginTop: 8, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {subtitle}
          </div>
        </div>

        <div style={{ padding: "16px 0 0", position: "relative", zIndex: 10 }}>
          {/* ── Section 1: Signal Overview ── */}
          <div style={S.sectionBox(tc.primary, "rgba(255,255,255,0.02)")}>
            <div style={S.row}>
              <span style={S.label}>{t("tradingPair")}</span>
              <span style={{ ...S.value, color: "#ffffff", fontSize: 16 }}>{report.symbol}</span>
            </div>
            <div style={S.row}>
              <span style={S.label}>{t("direction")}</span>
              <span style={{ ...S.value, color: tc.primary, fontSize: 15, fontWeight: 800, letterSpacing: "0.05em" }}>
                {tc.dirEmoji} {dirLabel}
              </span>
            </div>
            <div style={S.row}>
              <span style={S.label}>{t("aiConfidence")}</span>
              <span style={{ ...S.value, color: "#fbbf24", fontFamily: 'monospace', fontSize: 15 }}>
                {Math.round(report.confidence * 100)}%
              </span>
            </div>
            <div style={S.rowLast}>
              <span style={S.label}>{t("analysisMode")}</span>
              <span style={S.value}>{modeLabel(report.mode)}</span>
            </div>
            {/* ── Confluence & Risk Tags ── */}
            {confluenceTags.length > 0 && (
              <div style={{ paddingTop: 10, display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {confluenceTags.map((tag, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 700,
                    color: tag.color, background: tag.bg,
                    borderRadius: 6, padding: "3px 10px",
                    border: `1px solid ${tag.color}33`,
                    letterSpacing: "0.01em",
                  }}>{tag.label}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── Section 2: Strategy Summary ── */}
          {report.strategy && isLlmDegraded ? (
            <div style={S.sectionBox("#f59e0b", "rgba(245,158,11,0.05)")}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>
                {t("strategyAnomaly")}
              </div>
              <div style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.6 }}>
                {t("strategyAnomalyDesc")}
              </div>
            </div>
          ) : report.strategy && displayDirection !== "neutral" && (
            <div style={S.sectionBox("#818cf8", "rgba(99,102,241,0.03)")}>
              <div style={S.row}>
                <span style={S.label}>{t("strategyTier")}</span>
                <span style={{...S.value, color: "#c7d2fe", fontSize: 12}}>{report.strategy.is_fallback ? "HFT 估算策略" : "NSED 标准策略"}</span>
              </div>
              {(report.strategy.entry_low != null || report.strategy.entry_high != null || report.strategy.stop_loss != null || (report.strategy.targets && report.strategy.targets.length > 0)) ? (
                <>
              {(report.strategy.entry_low != null || report.strategy.entry_high != null) && (
                <div style={S.row}>
                  <span style={S.label}>{t("entryRange")}</span>
                  <span style={{ ...S.value, fontFamily: 'monospace', fontSize: 14, color: "#60a5fa" }}>
                    {report.strategy.entry_low != null ? report.strategy.entry_low.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : "—"}
                    {" - "}
                    {report.strategy.entry_high != null ? report.strategy.entry_high.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : "—"}
                  </span>
                </div>
              )}
              {report.strategy.stop_loss != null && (
                <div style={S.row}>
                  <span style={S.label}>{t("stopLoss")}</span>
                  <span style={{ ...S.value, color: "#f87171", fontWeight: 800, fontFamily: 'monospace', fontSize: 14 }}>
                    {report.strategy.stop_loss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })}
                  </span>
                </div>
              )}
              {report.strategy.targets && report.strategy.targets.length > 0 && (
                <div style={S.row}>
                  <span style={S.label}>{t("target")}</span>
                  <span style={{ ...S.value, color: "#34d399", fontWeight: 800, fontFamily: 'monospace', fontSize: 14 }}>
                    {report.strategy.targets.slice(0, 3).map((tgt, i) => `T${i + 1}:${tgt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })}`).join("  ")}
                  </span>
                </div>
              )}
                </>
              ) : (
                <div style={S.row}>
                  <span style={S.label}>{t("entryStopTarget")}</span>
                  <span style={{ ...S.value, color: "#71717a", fontSize: 12 }}>{t("noKeyLevels")}</span>
                </div>
              )}
              {(report.strategy.risk_reward_ratio ?? 0) > 0 && (
                <div style={S.row}>
                  <span style={S.label}>{t("rrRatio")}</span>
                  <span style={{ ...S.value, color: "#a78bfa", fontWeight: 800, fontFamily: 'monospace', fontSize: 14 }}>
                    1 : {(report.strategy.risk_reward_ratio ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
              <div style={S.row}>
                <span style={S.label}>{t("strategyScore")}</span>
                <span style={{...S.value, fontFamily: 'monospace', color: "#fbbf24"}}>
                  {typeof report.strategy.confidence === "number"
                    ? `${Math.round(report.strategy.confidence * 100)}%`
                    : "—"}
                </span>
              </div>
              <div style={S.row}>
                <span style={S.label}>{t("momentumVerify")}</span>
                <span style={S.value}>
                  {report.strategy.is_worth_taking ? t("momentumOk") : t("momentumWeak")}
                </span>
              </div>
              <div style={S.row}>
                <span style={S.label}>{t("regimeDetection")}</span>
                <span style={S.value}>{regimeText}</span>
              </div>
              <div style={S.rowLast}>
                <span style={S.label}>{t("expiry")}</span>
                <span style={{...S.value, color: "#a1a1aa", fontSize: 12}}>{validUntilText}</span>
              </div>
            </div>
          )}

          {/* ── Section 3: AI Consensus ── */}
          {consensus.total > 0 && (
            <div style={S.sectionBox("#f59e0b", "rgba(245,158,11,0.03)")}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, color: "#fbbf24", marginBottom: 12 }}>
                {t("consensusTitle")}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                {consensus.bullish > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399", background: "rgba(16,185,129,0.1)", borderRadius: 6, padding: "4px 12px", border: "1px solid rgba(16,185,129,0.2)" }}>
                    {t("bullishLabel")} {consensus.bullish}
                  </span>
                )}
                {consensus.bearish > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", background: "rgba(239,68,68,0.1)", borderRadius: 6, padding: "4px 12px", border: "1px solid rgba(239,68,68,0.2)" }}>
                    {t("bearishLabel")} {consensus.bearish}
                  </span>
                )}
                {consensus.neutral > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#a1a1aa", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "4px 12px", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {t("neutralLabel")} {consensus.neutral}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#a1a1aa" }}>
                {t("agentsCompleted").replace("{count}", String(consensus.total))}
                <br />
                <span style={{ color: "#d4d4d8", fontWeight: 600 }}>{consensusSummary}</span>
              </div>
            </div>
          )}

          {/* ── Scalping warning ── */}
          {report.mode === "scalping" && (
            <div style={{ margin: "0 24px 16px", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", borderLeft: "3px solid #f59e0b", borderRadius: 12, padding: "12px 16px", position: "relative", zIndex: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>
                {t("scalpingTitle")}
              </div>
              <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.6 }}>
                {t("scalpingDesc")}
              </div>
            </div>
          )}

          {/* ── Disclaimer ── */}
          <div style={{ margin: "0 24px 16px", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px", position: "relative", zIndex: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", marginBottom: 4 }}>
              {t("disclaimerTitle")}
            </div>
            <div style={{ fontSize: 11, color: "#71717a", lineHeight: 1.6 }}>
              {t("disclaimerDesc")}
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
