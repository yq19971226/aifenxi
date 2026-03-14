"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Grid3X3,
  Lock,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  AlertTriangle,
  Zap,
  ArrowUpRight,
} from "lucide-react";

import type { AnalysisReport } from "@/lib/api/analysis";
import type { StrategyData } from "@/lib/types/strategy";
import { useTradePreferences } from "@/lib/hooks/useTradePreferences";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import {
  calculateGridStrategy,
  type GridStrategyResult,
  type GridStrategyInput,
} from "@/lib/utils/grid-strategy";
import { cn } from "@/lib/utils";

// ── Props ────────────────────────────────────────────────────

interface Props {
  report: AnalysisReport;
}

// ── Component ────────────────────────────────────────────────

export function GridStrategyCard({ report }: Props) {
  const t = useTranslations("grid");
  const { user } = useAuth();
  const level = effectiveLevel(user);
  const isFlagship = level >= 2;

  const { preferences, loaded } = useTradePreferences();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const strategy = report.strategy;
  const mode = report.mode;

  const gridInput: GridStrategyInput | null = useMemo(() => {
    if (!preferences || !strategy) return null;
    if (mode !== "intraday" && mode !== "trend") return null;
    return {
      strategy: strategy as StrategyData,
      mode: mode as "intraday" | "trend",
      preferences,
      support: report.regime_support,
      resistance: report.regime_resistance,
    };
  }, [strategy, mode, preferences, report.regime_support, report.regime_resistance]);

  const grid: GridStrategyResult | null = useMemo(() => {
    if (!gridInput) return null;
    return calculateGridStrategy(gridInput);
  }, [gridInput]);

  // Only show for intraday / trend modes with valid strategy
  if (mode === "scalping") return null;
  if (!strategy || strategy.direction === "neutral" || strategy.is_fallback) return null;
  if (!loaded) return null;
  if (!grid) return null;

  const isLong = grid.direction === "long";
  const isShort = grid.direction === "short";
  const isNeutral = grid.direction === "neutral";

  const directionConfig = isLong
    ? { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: TrendingUp, label: t("direction.long") }
    : isShort
      ? { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: TrendingDown, label: t("direction.short") }
      : { color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20", icon: Minus, label: t("direction.neutral") };

  const DirIcon = directionConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="relative overflow-hidden rounded-xl border border-border bg-bg-surface shadow-inner"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-primary/30">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 shadow-inner">
            <Grid3X3 size={16} className="text-amber-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
              {t("title")}
              <span className={cn(
                "text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-widest",
                grid.scenario === "ranging" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              )}>
                {t(`scenario.${grid.scenario}`)}
              </span>
            </h4>
            <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mt-1">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {/* Direction badge */}
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold font-mono uppercase tracking-widest",
          directionConfig.bg, directionConfig.border, directionConfig.color
        )}>
          <DirIcon size={14} />
          {directionConfig.label}
        </div>
      </div>

      {/* Content body — locked for non-flagship */}
      <div className="relative">
        {/* Blur overlay for non-flagship users */}
        {!isFlagship && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden rounded-b-xl">
            {/* Base blur and noise */}
            <div className="absolute inset-0 backdrop-blur-md bg-black/60 opacity-90" />
            
            {/* Animated data flow lines in background */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute top-1/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent translate-x-[-100%] animate-[flow_3s_infinite]" />
              <div className="absolute top-2/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent translate-x-[-100%] animate-[flow_4s_infinite_1s]" />
              <div className="absolute top-3/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent translate-x-[-100%] animate-[flow_2.5s_infinite_2s]" />
            </div>

            {/* Premium Lock Icon */}
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-black/80 border border-zinc-800 shadow-[0_0_30px_rgba(245,158,11,0.15)] mb-6 z-10">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-amber-500/20 to-transparent opacity-50" />
              <div className="absolute inset-[1px] rounded-2xl bg-gradient-to-b from-white/5 to-transparent" />
              <Lock size={26} className="text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" strokeWidth={1.5} />
            </div>
            
            <p className="text-sm font-medium text-white tracking-wide mb-2 z-10">{t("flagshipOnly")}</p>
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] mb-6 z-10">Exclusive Quant Institutional Tools</p>
            
            <a
              href="/settings/membership"
              className="relative group z-10 flex items-center gap-2 rounded-lg bg-black px-6 py-3 text-[11px] font-bold font-mono uppercase tracking-[0.15em] text-amber-500 transition-all hover:text-amber-400 active:scale-[0.98]"
            >
              <div className="absolute inset-0 rounded-lg border border-amber-500/30 group-hover:border-amber-500/60 transition-colors" />
              <div className="absolute inset-0 rounded-lg bg-amber-500/5 group-hover:bg-amber-500/10 transition-colors" />
              <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Zap size={14} className="group-hover:drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]" />
              {t("upgradeBtn")}
              <ArrowUpRight size={12} className="opacity-70 group-hover:opacity-100" />
            </a>
          </div>
        )}

        {/* Grid visualization */}
        <div className={cn("p-5 space-y-5", !isFlagship && "min-h-[400px]")}>
          {/* Visual grid ladder - Terminal Style */}
          <div className="bg-black/40 rounded-xl p-5 border border-white/[0.04]">
            <div className="flex justify-between items-center mb-4">
               <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em]">{t("labels.buy")} / {t("labels.sell")}</span>
               <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em]">{t("labels.current")}</span>
            </div>
            <div className="relative flex flex-col gap-[2px]">
              {grid.gridLevels.slice().reverse().slice(0, 12).map((price, idx, arr) => {
                const total = arr.length;
                const isFirst = idx === 0;
                const isLast = idx === total - 1;
                const midIdx = Math.floor(total / 2);
                const isMid = idx === midIdx;
                const isAboveMid = idx < midIdx;

                return (
                  <div
                    key={price}
                    className="group relative flex items-center justify-between py-1.5 transition-colors hover:bg-white/[0.02]"
                  >
                    {/* Background line extension */}
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent pointer-events-none" />
                    
                    {/* Left: Action Indicator */}
                    <div className="flex items-center gap-3 z-10 w-24">
                      <div className={cn(
                        "h-4 w-1 rounded-full",
                        isFirst ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                        isLast ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                        isMid ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] animate-pulse" :
                        isAboveMid ? "bg-emerald-500/30" : "bg-red-500/30"
                      )} />
                      <span className={cn(
                        "text-[9px] font-bold font-mono uppercase tracking-widest",
                        isFirst ? "text-emerald-400" :
                        isLast ? "text-red-400" :
                        isMid ? "text-indigo-400" : "text-zinc-600"
                      )}>
                        {isFirst ? t("labels.tp") : isLast ? t("labels.sl") : isMid ? "ENTRY" : `G${total - idx}`}
                      </span>
                    </div>

                    {/* Right: Price */}
                    <div className="flex items-center justify-end flex-1 z-10 gap-3">
                      <span className={cn(
                        "text-[9px] font-bold font-mono uppercase tracking-widest text-right",
                        isAboveMid ? "text-red-400/40" : "text-emerald-400/40"
                      )}>
                        {isFirst ? "" : isLast ? "" : isAboveMid ? t("labels.sell") : t("labels.buy")}
                      </span>
                      <span className={cn(
                        "text-[13px] font-sans font-black tracking-tight tabular-nums relative",
                        isFirst ? "text-emerald-400 glow-text-green" :
                        isLast ? "text-red-400 glow-text-red" :
                        isMid ? "text-white glow-text" : "text-zinc-400"
                      )}>
                        ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {isMid && (
                          <span className="absolute -right-3 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.8)] animate-pulse" />
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
              {grid.gridLevels.length > 12 && (
                <div className="text-center text-[10px] font-mono font-bold text-zinc-600 py-3 uppercase tracking-[0.2em]">
                  ... +{grid.gridLevels.length - 12} {t("labels.gridLevels")}
                </div>
              )}
            </div>
          </div>

          {/* Key parameters grid - HUD Style */}
          <div className="grid grid-cols-2 md:grid-cols-3 bg-black/40 rounded-xl overflow-hidden border border-white/[0.04] p-1">
            <ParamCell HUD label={t("params.priceRange")} value={`$${grid.priceLower.toLocaleString()} — $${grid.priceUpper.toLocaleString()}`} />
            <ParamCell HUD label={t("params.gridCount")} value={`${grid.gridCount}`} />
            <ParamCell HUD label={t("params.gridMode")} value={t(`params.${grid.gridMode}`)} />
            <ParamCell HUD label={t("params.leverage")} value={`${grid.leverage}x`} highlight />
            <ParamCell HUD label={t("params.investment")} value={`$${grid.investmentAmount.toLocaleString()}`} />
            <ParamCell HUD label={t("params.perGridProfit")} value={`${grid.perGridProfitPct.toFixed(2)}%`} highlight />
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-[10px] font-bold font-mono text-zinc-500 hover:text-zinc-300 uppercase tracking-widest transition-colors w-full justify-center py-2"
          >
            <ChevronDown size={12} className={cn("transition-transform duration-200", showAdvanced && "rotate-180")} />
            {t("labels.advanced")}
          </button>

          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 bg-black/40 rounded-xl overflow-hidden border border-white/[0.04] p-1">
                <ParamCell HUD label={t("params.leveragedAmount")} value={`$${grid.leveragedAmount.toLocaleString()}`} />
                <ParamCell HUD label={t("params.perGridAmount")} value={`$${grid.perGridAmount.toLocaleString()}`} />
                <ParamCell HUD label={t("params.gridSpacing")} value={grid.gridMode === "arithmetic" ? `$${grid.gridSpacing.toFixed(2)}` : `${grid.gridSpacing.toFixed(2)}%`} />
                <ParamCell HUD label={t("params.takeProfit")} value={`$${grid.takeProfit.toLocaleString()}`} valueColor="text-emerald-400" />
                <ParamCell HUD label={t("params.stopLoss")} value={`$${grid.stopLoss.toLocaleString()}`} valueColor="text-red-400" />
                <ParamCell HUD label={t("params.annualYield")} value={`${grid.estAnnualYield.toFixed(1)}%`} highlight />
                {grid.estLiquidationLong && (
                  <ParamCell HUD label={t("params.liquidationLong")} value={`$${grid.estLiquidationLong.toLocaleString()}`} valueColor="text-red-400" />
                )}
                {grid.estLiquidationShort && (
                  <ParamCell HUD label={t("params.liquidationShort")} value={`$${grid.estLiquidationShort.toLocaleString()}`} valueColor="text-red-400" />
                )}
                <ParamCell HUD label={t("params.shiftUp")} value={grid.shiftUp ? t("labels.enabled") : t("labels.disabled")} valueColor={grid.shiftUp ? "text-emerald-400" : "text-zinc-500"} />
                <ParamCell HUD label={t("params.shiftDown")} value={grid.shiftDown ? t("labels.enabled") : t("labels.disabled")} valueColor={grid.shiftDown ? "text-emerald-400" : "text-zinc-500"} />
              </div>
            </motion.div>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2.5 border border-amber-500/15 bg-amber-500/[0.04] rounded-lg px-4 py-3">
            <AlertTriangle size={13} className="text-amber-500/60 shrink-0 mt-0.5" />
            <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
              {t("disclaimer")}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Sub-component ────────────────────────────────────────────

function ParamCell({
  label,
  value,
  valueColor = "text-white",
  highlight = false,
  HUD = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  highlight?: boolean;
  HUD?: boolean;
}) {
  if (HUD) {
    return (
      <div className={cn(
        "relative p-3 border-b border-white/[0.04]",
        "[&:nth-child(odd)]:border-r md:[&:nth-child(odd)]:border-r-0 md:[&:not(:nth-child(3n))]:border-r",
      )}>
        {highlight && (
          <div className="absolute left-0 top-1/4 bottom-1/4 w-[2px] bg-amber-500 rounded-r-full shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
        )}
        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-1 line-clamp-1 pl-1">{label}</p>
        <p className={cn("text-[13px] font-sans font-black tracking-tight tabular-nums pl-1", valueColor === "text-white" ? "text-zinc-200" : valueColor)}>{value}</p>
      </div>
    );
  }

  // Fallback for non-HUD style (if needed elsewhere)
  return (
    <div className={cn(
      "rounded-xl bg-bg-primary/50 border border-border/50 p-3 shadow-inner",
      highlight && "border-amber-500/20 bg-amber-500/[0.03]"
    )}>
      <p className="text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-[0.15em] mb-1.5 line-clamp-1">{label}</p>
      <p className={cn("text-[13px] font-sans font-black tracking-tight tabular-nums", valueColor)}>{value}</p>
    </div>
  );
}
