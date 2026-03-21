"use client";

import { AlertTriangle, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { StrategyData } from "@/lib/types/strategy";
import { formatDirection, formatPrice, isFallbackReasoning, localizeText } from "./helpers";
import { ReasoningBlock } from "./renderers";
import { useTranslations } from "next-intl";

// ── Confidence ring (SVG arc) ───────────────────────────────

export function ConfidenceRing({ value, color }: { value: number; color: string }) {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value);
  const strokeColor = color === "emerald" ? "#34d399" : color === "red" ? "#f87171" : "#a1a1aa";

  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle
          cx="24" cy="24" r={r} fill="none"
          stroke={strokeColor} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold font-mono text-zinc-200">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ── Strategy range bar ───────────────────────────────────────

export function StrategyRangeBar({
  stopLoss, entryLow, entryHigh, targets, direction,
}: {
  stopLoss: number; entryLow: number; entryHigh: number; targets: number[]; direction: string;
}) {
  const t = useTranslations("consensus.strategy");
  const allPrices = [stopLoss, entryLow, entryHigh, ...targets].filter((p) => p > 0);
  if (allPrices.length < 2) return null;
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min;
  if (range <= 0) return null;
  const pct = (v: number) => ((v - min) / range) * 100;

  const isLong = direction === "long";

  return (
    <div className="mt-5 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">{t("priceMap")}</p>
        <span className="text-[11px] text-zinc-600 font-mono">{(range).toFixed(2)} {t("spread")}</span>
      </div>
      <div className="relative h-10 rounded-lg bg-black/40 border border-white/[0.04] overflow-hidden backdrop-blur-md">
        {/* Entry range highlight */}
        <div
          className={`absolute top-0 h-full ${isLong ? "bg-emerald-500/20" : "bg-red-500/20"}`}
          style={{ left: `${pct(entryLow)}%`, width: `${pct(entryHigh) - pct(entryLow)}%` }}
        />
        {/* Stop loss marker */}
        <div
          className="absolute top-0 h-full w-[2px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
          style={{ left: `${pct(stopLoss)}%` }}
        >
          <span className="absolute -top-1 left-2 text-[11px] font-mono font-bold text-red-400 whitespace-nowrap bg-black/60 px-1 rounded">{t("stopLossLabel")}</span>
        </div>
        {/* Entry markers */}
        <div
          className="absolute top-0 h-full w-[1px] bg-blue-400/80"
          style={{ left: `${pct(entryLow)}%` }}
        />
        <div
          className="absolute top-0 h-full w-[1px] bg-blue-400/80"
          style={{ left: `${pct(entryHigh)}%` }}
        />
        {/* Target markers */}
        {targets.map((tp, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-[2px] bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            style={{ left: `${pct(tp)}%` }}
          >
            <span className="absolute bottom-1 left-2 text-[11px] font-mono font-bold text-emerald-400 whitespace-nowrap bg-black/60 px-1 rounded">
              {t("tpLabel", { n: i + 1 })}
            </span>
          </div>
        ))}
      </div>
      {/* Price labels */}
      <div className="flex justify-between text-xs font-mono text-zinc-400 mt-1">
        <span>{formatPrice(min)}</span>
        <span>{formatPrice(max)}</span>
      </div>
    </div>
  );
}

// ── Strategy card (standalone, currently unused — kept for reuse in leaderboard/history) ──

export function StrategyCard({ strategy }: { strategy: StrategyData }) {
  const t = useTranslations("consensus.strategy");
  const dir = strategy.direction;
  const isFallback = strategy.is_fallback;
  const reasoning = strategy.reasoning || "";
  const isLlmDegraded = !isFallback && isFallbackReasoning(reasoning);
  const isLong = dir === "long";
  const isShort = dir === "short";
  const dirStyle = isLong 
    ? "border-emerald-500/30 bg-emerald-500/[0.03] shadow-[0_0_30px_rgba(16,185,129,0.05)]" 
    : isShort 
      ? "border-red-500/30 bg-red-500/[0.03] shadow-[0_0_30px_rgba(239,68,68,0.05)]" 
      : "border-zinc-500/20 bg-zinc-500/[0.05]";
  const dirText = isLong ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" : isShort ? "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]" : "text-zinc-400";
  const dirColor = isLong ? "emerald" : isShort ? "red" : "zinc";
  const DirIcon = isLong ? TrendingUp : isShort ? TrendingDown : Target;

  const entryLow = strategy.entry_low;
  const entryHigh = strategy.entry_high;
  const stopLoss = strategy.stop_loss;
  const targets = strategy.targets || [];
  const confidence = strategy.confidence;
  const symbol = strategy.symbol || "";
  const validUntil = strategy.valid_until || null;

  if (isLlmDegraded) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">{t("degradedTitle")}</span>
        </div>
        <p className="mt-2 text-xs text-zinc-400">{t("degradedDesc")}</p>
      </div>
    );
  }

  return (
    <div className={`relative rounded-2xl border overflow-hidden backdrop-blur-md ${dirStyle}`}>
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[url('/img/grid.svg')] bg-center opacity-[0.03] pointer-events-none" />
      
      {/* Header with confidence ring */}
      <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${isLong ? "bg-emerald-500/10 border border-emerald-500/20" : isShort ? "bg-red-500/10 border border-red-500/20" : "bg-zinc-500/10 border border-zinc-500/20"}`}>
            <DirIcon className={`h-5 w-5 ${dirText.split(' ')[0]}`} />
          </div>
          <div>
            <span className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${dirText}`}>
              {t("direction", { dir: formatDirection(dir) })}
              {isFallback && <span className="text-[10px] font-mono text-amber-500 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded shadow-[0_0_10px_rgba(245,158,11,0.2)]">HFT</span>}
            </span>
            {symbol && <p className="text-xs text-zinc-500 font-mono mt-0.5 tracking-wider">{symbol}</p>}
          </div>
        </div>
        {confidence != null && confidence > 0 && (
          <ConfidenceRing value={confidence} color={dirColor} />
        )}
      </div>

      <div className={`relative z-10 px-5 pt-4 pb-5`}>
        {/* Price grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* 入场区间 */}
          {(entryLow != null || entryHigh != null) && (
            <div className="rounded-xl bg-black/40 border border-white/[0.06] p-3 flex flex-col justify-center">
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-1.5">{t("entryZone")}</p>
              <div className="flex flex-col md:flex-row md:items-baseline md:gap-2">
                <p className="text-sm md:text-[15px] font-mono font-bold text-white tracking-tight">
                  {entryLow != null ? formatPrice(entryLow) : "\u2014"}
                </p>
                <p className="text-sm md:text-[15px] font-mono font-bold text-zinc-400 tracking-tight">
                  <span className="text-zinc-600 mr-1 hidden md:inline">-</span>
                  {entryHigh != null ? formatPrice(entryHigh) : "\u2014"}
                </p>
              </div>
            </div>
          )}
          {/* 止损 */}
          {stopLoss != null && (
            <div className="rounded-xl bg-red-950/20 border border-red-500/10 p-3 flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-full blur-xl -mr-8 -mt-8 transition-transform duration-500 group-hover:scale-150" />
              <p className="text-[11px] text-red-500/80 uppercase tracking-widest mb-1.5 relative z-10">{t("stopLossPos")}</p>
              <p className="text-[15px] md:text-lg font-mono font-black text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)] tracking-tight relative z-10">
                {formatPrice(stopLoss)}
              </p>
            </div>
          )}
          {/* 盈亏比 */}
          {(strategy.risk_reward_ratio ?? 0) > 0 && (
            <div className="rounded-xl bg-indigo-950/20 border border-indigo-500/10 p-3 flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/10 rounded-full blur-xl -mr-8 -mt-8 transition-transform duration-500 group-hover:scale-150" />
              <p className="text-[11px] text-indigo-400/80 uppercase tracking-widest mb-1.5 relative z-10">{t("rrLabel")}</p>
              <p className="text-[15px] md:text-lg font-mono font-black text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.3)] tracking-tight relative z-10">
                1 : {(strategy.risk_reward_ratio ?? 0).toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* 目标位 */}
        {targets.length > 0 && (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/10">
            <p className="text-[11px] text-emerald-500/80 uppercase tracking-widest mb-2.5">{t("tpTargets")}</p>
            <div className="flex gap-2.5 flex-wrap">
              {targets.map((tp, i) => (
                <div key={i} className="flex flex-col rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 transition-all duration-300 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:shadow-[0_0_15px_rgba(52,211,153,0.15)] cursor-default">
                  <span className="text-[11px] text-emerald-500/70 font-bold mb-0.5 tracking-wider">{t("tpLabel", { n: i + 1 })}</span>
                  <span className="text-xs md:text-sm font-mono font-black text-emerald-400 tracking-tight drop-shadow-sm">
                    {formatPrice(tp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Visual range bar */}
        {stopLoss != null && entryLow != null && entryHigh != null && (
          <StrategyRangeBar
            stopLoss={stopLoss}
            entryLow={entryLow}
            entryHigh={entryHigh}
            targets={targets}
            direction={dir}
          />
        )}

        {/* 有效期 */}
        {validUntil && (
          <p className="mt-3 text-xs text-zinc-500">
            {t("validUntil", { time: new Date(validUntil).toLocaleString() })}
          </p>
        )}
        {/* 分析逻辑 */}
        {reasoning && !isFallbackReasoning(reasoning) && (
          <div className="mt-3">
            <ReasoningBlock text={localizeText(reasoning)} />
          </div>
        )}
      </div>
    </div>
  );
}
