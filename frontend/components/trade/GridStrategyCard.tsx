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

  // Only show for intraday / trend modes with valid strategy
  if (mode === "scalping") return null;
  if (!strategy || strategy.direction === "neutral" || strategy.is_fallback) return null;
  if (!loaded) return null;

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
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-md bg-bg-primary/60 rounded-b-xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-inner mb-4">
              <Lock size={24} className="text-amber-400" />
            </div>
            <p className="text-sm font-bold text-zinc-300 mb-1">{t("flagshipOnly")}</p>
            <a
              href="/settings/membership"
              className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-xs font-bold font-mono uppercase tracking-widest text-black hover:bg-amber-400 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] active:scale-[0.98]"
            >
              <Zap size={14} />
              {t("upgradeBtn")}
              <ArrowUpRight size={12} />
            </a>
          </div>
        )}

        {/* Grid visualization */}
        <div className={cn("p-5 space-y-5", !isFlagship && "min-h-[400px]")}>
          {/* Visual grid ladder */}
          <div className="bg-bg-primary/50 border border-border/50 rounded-xl p-4 shadow-inner">
            <div className="relative flex flex-col gap-0">
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
                    className={cn(
                      "flex items-center justify-between py-1.5 px-3 border-l-2 transition-colors",
                      isFirst ? "border-l-emerald-500" :
                      isLast ? "border-l-red-500" :
                      isMid ? "border-l-indigo-500" :
                      isAboveMid ? "border-l-emerald-500/40" : "border-l-red-500/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[9px] font-bold font-mono uppercase tracking-widest w-8",
                        isFirst ? "text-emerald-400" :
                        isLast ? "text-red-400" :
                        isMid ? "text-indigo-400" : "text-zinc-600"
                      )}>
                        {isFirst ? t("labels.tp") : isLast ? t("labels.sl") : isMid ? "MID" : `G${total - idx}`}
                      </span>
                      <span className={cn(
                        "text-xs font-mono font-bold tracking-tight",
                        isFirst ? "text-emerald-400" :
                        isLast ? "text-red-400" :
                        isMid ? "text-white" : "text-zinc-400"
                      )}>
                        ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <span className={cn(
                      "text-[9px] font-bold font-mono uppercase tracking-widest",
                      isAboveMid ? "text-red-400/60" : "text-emerald-400/60"
                    )}>
                      {isFirst ? "" : isLast ? "" : isAboveMid ? t("labels.sell") : t("labels.buy")}
                    </span>
                  </div>
                );
              })}
              {grid.gridLevels.length > 12 && (
                <div className="text-center text-[10px] font-mono font-bold text-zinc-500 py-2 uppercase tracking-widest">
                  ... +{grid.gridLevels.length - 12} {t("labels.gridLevels")}
                </div>
              )}
            </div>
          </div>

          {/* Key parameters grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <ParamCell label={t("params.priceRange")} value={`$${grid.priceLower.toLocaleString()} — $${grid.priceUpper.toLocaleString()}`} />
            <ParamCell label={t("params.gridCount")} value={`${grid.gridCount}`} />
            <ParamCell label={t("params.gridMode")} value={t(`params.${grid.gridMode}`)} />
            <ParamCell label={t("params.leverage")} value={`${grid.leverage}x`} highlight />
            <ParamCell label={t("params.investment")} value={`$${grid.investmentAmount.toLocaleString()}`} />
            <ParamCell label={t("params.perGridProfit")} value={`${grid.perGridProfitPct.toFixed(2)}%`} highlight />
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ParamCell label={t("params.leveragedAmount")} value={`$${grid.leveragedAmount.toLocaleString()}`} />
                <ParamCell label={t("params.perGridAmount")} value={`$${grid.perGridAmount.toLocaleString()}`} />
                <ParamCell label={t("params.gridSpacing")} value={grid.gridMode === "arithmetic" ? `$${grid.gridSpacing.toFixed(2)}` : `${grid.gridSpacing.toFixed(2)}%`} />
                <ParamCell label={t("params.takeProfit")} value={`$${grid.takeProfit.toLocaleString()}`} valueColor="text-emerald-400" />
                <ParamCell label={t("params.stopLoss")} value={`$${grid.stopLoss.toLocaleString()}`} valueColor="text-red-400" />
                <ParamCell label={t("params.annualYield")} value={`${grid.estAnnualYield.toFixed(1)}%`} highlight />
                {grid.estLiquidationLong && (
                  <ParamCell label={t("params.liquidationLong")} value={`$${grid.estLiquidationLong.toLocaleString()}`} valueColor="text-red-400" />
                )}
                {grid.estLiquidationShort && (
                  <ParamCell label={t("params.liquidationShort")} value={`$${grid.estLiquidationShort.toLocaleString()}`} valueColor="text-red-400" />
                )}
                <ParamCell label={t("params.shiftUp")} value={grid.shiftUp ? t("labels.enabled") : t("labels.disabled")} valueColor={grid.shiftUp ? "text-emerald-400" : "text-zinc-500"} />
                <ParamCell label={t("params.shiftDown")} value={grid.shiftDown ? t("labels.enabled") : t("labels.disabled")} valueColor={grid.shiftDown ? "text-emerald-400" : "text-zinc-500"} />
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
}: {
  label: string;
  value: string;
  valueColor?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl bg-bg-primary/50 border border-border/50 p-3 shadow-inner",
      highlight && "border-amber-500/20 bg-amber-500/[0.03]"
    )}>
      <p className="text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest mb-1.5 line-clamp-1">{label}</p>
      <p className={cn("text-sm font-bold font-mono tracking-tight", valueColor)}>{value}</p>
    </div>
  );
}
