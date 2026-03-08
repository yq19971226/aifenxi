"use client";

import { AlertTriangle, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { StrategyData } from "@/lib/types/strategy";
import { formatDirection, formatPrice, isFallbackReasoning } from "./helpers";
import { ReasoningBlock } from "./renderers";

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

function StrategyRangeBar({
  stopLoss, entryLow, entryHigh, targets, direction,
}: {
  stopLoss: number; entryLow: number; entryHigh: number; targets: number[]; direction: string;
}) {
  const allPrices = [stopLoss, entryLow, entryHigh, ...targets].filter((p) => p > 0);
  if (allPrices.length < 2) return null;
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min;
  if (range <= 0) return null;
  const pct = (v: number) => ((v - min) / range) * 100;

  const isLong = direction === "long";

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">价位分布</p>
      <div className="relative h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        {/* Entry range highlight */}
        <div
          className={`absolute top-0 h-full ${isLong ? "bg-emerald-500/10" : "bg-red-500/10"}`}
          style={{ left: `${pct(entryLow)}%`, width: `${pct(entryHigh) - pct(entryLow)}%` }}
        />
        {/* Stop loss marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-red-500/70"
          style={{ left: `${pct(stopLoss)}%` }}
        >
          <span className="absolute -top-0.5 left-1 text-[10px] font-mono text-red-400 whitespace-nowrap">SL</span>
        </div>
        {/* Entry markers */}
        <div
          className="absolute top-0 h-full w-0.5 bg-blue-400/60"
          style={{ left: `${pct(entryLow)}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-blue-400/60"
          style={{ left: `${pct(entryHigh)}%` }}
        />
        {/* Target markers */}
        {targets.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-0.5 bg-emerald-400/60"
            style={{ left: `${pct(t)}%` }}
          >
            <span className="absolute bottom-0.5 left-1 text-[10px] font-mono text-emerald-400 whitespace-nowrap">
              T{i + 1}
            </span>
          </div>
        ))}
      </div>
      {/* Price labels */}
      <div className="flex justify-between text-xs font-mono text-zinc-600">
        <span>{formatPrice(min)}</span>
        <span>{formatPrice(max)}</span>
      </div>
    </div>
  );
}

// ── Strategy card ────────────────────────────────────────────

export function StrategyCard({ strategy }: { strategy: StrategyData }) {
  const dir = strategy.direction;
  const isFallback = strategy.is_fallback;
  const reasoning = strategy.reasoning || "";
  const isLlmDegraded = !isFallback && isFallbackReasoning(reasoning);
  const isLong = dir === "long";
  const isShort = dir === "short";
  const dirStyle = isLong ? "border-emerald-500/20 bg-emerald-500/[0.05]" : isShort ? "border-red-500/20 bg-red-500/[0.05]" : "border-zinc-500/20 bg-zinc-500/[0.05]";
  const dirText = isLong ? "text-emerald-400" : isShort ? "text-red-400" : "text-zinc-400";
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
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-medium text-yellow-400">策略生成异常</span>
        </div>
        <p className="mt-1.5 text-sm text-zinc-400">智能体返回了降级响应，策略数据不可用。请重试分析。</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${dirStyle}`}>
      {/* Header with confidence ring */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <DirIcon className={`h-5 w-5 ${dirText}`} />
          <div>
            <span className={`text-sm font-bold ${dirText}`}>
              策略建议 · {formatDirection(dir)}
              {isFallback && <span className="ml-2 text-xs font-normal text-amber-400/70">(基于价格估算)</span>}
            </span>
            {symbol && <p className="text-xs text-zinc-500">{symbol}</p>}
          </div>
        </div>
        {confidence !== null && confidence > 0 && (
          <ConfidenceRing value={confidence} color={dirColor} />
        )}
      </div>

      <div className={`border-t ${isLong ? "border-emerald-500/10" : isShort ? "border-red-500/10" : "border-zinc-500/10"} px-4 py-3`}>
        {/* Price grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* 入场区间 */}
          {(entryLow || entryHigh) && (
            <div className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-xs text-zinc-500 mb-1">入场区间</p>
              <p className="text-xs font-mono font-semibold text-zinc-200">
                {entryLow ? formatPrice(entryLow) : "\u2014"}
              </p>
              <p className="text-xs font-mono font-semibold text-zinc-200">
                ~ {entryHigh ? formatPrice(entryHigh) : "\u2014"}
              </p>
            </div>
          )}
          {/* 止损 */}
          {stopLoss && (
            <div className="rounded-lg bg-red-500/[0.04] px-3 py-2">
              <p className="text-xs text-red-400/70 mb-1">止损</p>
              <p className="text-xs font-mono font-semibold text-red-400">{formatPrice(stopLoss)}</p>
            </div>
          )}
          {/* 盈亏比 */}
          {strategy.risk_reward_ratio > 0 && (
            <div className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-xs text-zinc-500 mb-1">盈亏比</p>
              <p className="text-xs font-mono font-semibold text-zinc-200">
                1 : {strategy.risk_reward_ratio.toFixed(1)}
              </p>
            </div>
          )}
        </div>

        {/* 目标位 */}
        {targets.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-zinc-500 mb-1.5">目标位</p>
            <div className="flex gap-2 flex-wrap">
              {targets.map((t, i) => (
                <span key={i} className="text-xs font-mono text-emerald-400 bg-emerald-500/10 rounded-md px-2 py-1 border border-emerald-500/10">
                  T{i + 1}: {formatPrice(t)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Visual range bar */}
        {stopLoss && entryLow && entryHigh && (
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
            有效至 {new Date(validUntil).toLocaleString("zh-CN")}
          </p>
        )}
        {/* 分析逻辑 */}
        {reasoning && !isFallbackReasoning(reasoning) && (
          <div className="mt-3">
            <ReasoningBlock text={reasoning} />
          </div>
        )}
      </div>
    </div>
  );
}
