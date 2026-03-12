"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { fetchConsensusLatest } from "@/lib/api/consensus";
import {
  fetchAnalysisQuota,
  type AnalysisMode,
  type AnalysisQuotaResponse,
} from "@/lib/api/analysis";
import { SymbolSelector } from "@/components/layout/SymbolSelector";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { AnalysisReport } from "@/components/analysis/AnalysisReport";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import { Lock, RefreshCw, Brain, Square } from "lucide-react";

import { DEFAULT_SYMBOL, MODE_CONFIGS } from "./_components/consensus-config";
import { AdversarialFlow } from "./_components/AdversarialFlow";
import { ConsensusCache } from "./_components/ConsensusCache";
import { useAnalysis } from "./_hooks/useAnalysis";
import { JSONLD } from "@/components/seo/JSONLD";

export default function ConsensusPage() {
  const t = useTranslations("consensus");
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || DEFAULT_SYMBOL;

  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [mode, setMode] = useState<AnalysisMode>("scalping");

  const { user } = useAuth();
  const adminLevel = effectiveLevel(user);

  const { data: quota } = useQuery<AnalysisQuotaResponse>({
    queryKey: ["analysis-quota"],
    queryFn: fetchAnalysisQuota,
    refetchInterval: 60_000,
  });

  const userLevel = Math.max(adminLevel, quota?.level ?? 0);
  const currentQuota = quota?.quotas?.[mode] ?? null;

  const isModeLocked = useCallback((m: AnalysisMode): boolean => {
    const cfg = MODE_CONFIGS.find((c) => c.value === m);
    return (cfg?.minLevel ?? 0) > userLevel;
  }, [userLevel]);
  /** 某模式是否有可用次数（含免费体验 bonus），有则允许选模式并允许开始 */
  const hasQuotaForMode = useCallback((m: AnalysisMode) => (quota?.quotas?.[m]?.remaining ?? 0) > 0, [quota?.quotas]);
  const isQuotaExhausted = currentQuota !== null && currentQuota.remaining === 0;
  const canStart =
    symbol.trim().length > 0 &&
    (!isModeLocked(mode) || hasQuotaForMode(mode)) &&
    !isQuotaExhausted;

  const {
    running, startTime, progressSteps, analysisReport, error,
    handleStart, handleAbort,
  } = useAnalysis(symbol, mode, canStart);

  // Consensus report (read-only cache)
  const { data: consensusReport } = useQuery({
    queryKey: ["consensus", symbol],
    queryFn: () => fetchConsensusLatest(symbol),
    retry: false,
    enabled: !running,
  });

  const handleModeSelect = useCallback(
    (m: AnalysisMode) => {
      if (running) return;
      if (isModeLocked(m) && !hasQuotaForMode(m)) return;
      setMode(m);
    },
    [isModeLocked, hasQuotaForMode, running],
  );

  // Which report to display: analysis report (fresh) > consensus cache
  const displayReport = analysisReport;
  const displayConsensus = consensusReport;

  return (
    <div className="min-h-screen bg-grid relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[120px] pointer-events-none rounded-full" />
      
      <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 space-y-8 relative z-10">
      <JSONLD report={displayReport || displayConsensus} />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">{t("title")}</h1>
          <p className="text-sm font-medium text-zinc-500 tracking-wide uppercase">
            {t("subtitle")}
          </p>
        </div>
        <SymbolSelector value={symbol} onChange={setSymbol} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {MODE_CONFIGS.map((cfg) => {
          const locked = isModeLocked(cfg.value);
          const canUseMode = !locked || hasQuotaForMode(cfg.value);
          const selected = mode === cfg.value;
          return (
            <button
              key={cfg.value}
              type="button"
              onClick={() => handleModeSelect(cfg.value)}
              disabled={running}
              className={`relative glass-card glass-card-hover p-5 text-left transition-all ${
                selected
                  ? "ring-1 ring-indigo-500/50 bg-indigo-500/[0.05] shadow-[0_0_25px_rgba(99,102,241,0.08)]"
                  : !canUseMode
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
              }`}
            >
              {locked && !hasQuotaForMode(cfg.value) && (
                <div className="absolute top-3 right-3">
                  <Lock size={14} className="text-zinc-600" />
                </div>
              )}
              <div className={`${selected ? "text-indigo-400" : "text-zinc-500"}`}>
                {cfg.icon}
              </div>
              <h3 className="mt-2 text-base font-semibold text-white">{t(`modes.${cfg.value}.label`)}</h3>
              <p className="mt-1 text-sm text-zinc-500">{t(`modes.${cfg.value}.desc`, { count: cfg.agents.split(" ")[0] })}</p>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-zinc-300">
                  {cfg.agents}
                </span>
                <span className="text-zinc-500">{cfg.periods}</span>
              </div>
              {locked && !hasQuotaForMode(cfg.value) && cfg.tierLabel && (
                <span className="mt-2 inline-block rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                  {t("modes.locked", { tier: cfg.tierLabel })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          type="button"
          onClick={() => handleStart(false)}
          disabled={!canStart}
          className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-300 ${
            running
              ? "bg-white/[0.05] text-zinc-400 border border-white/[0.1]"
              : canStart
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-[0_4px_20px_rgba(99,102,241,0.3)] hover:shadow-[0_6px_30px_rgba(99,102,241,0.4)]"
                : "bg-white/[0.02] text-zinc-600 border border-white/[0.05]"
          }`}
        >
          {running ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t("actions.analyzing")}
            </>
          ) : (
            <>
              <Brain size={16} />
              {t("actions.startAnalysis")}
            </>
          )}
        </button>

        {currentQuota && !isModeLocked(mode) && (
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <span>{t("quota.label")}</span>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, currentQuota.limit) }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${
                    i < currentQuota.remaining
                      ? "bg-indigo-500"
                      : "bg-white/[0.05]"
                  }`}
                />
              ))}
            </div>
            <span className="font-mono text-zinc-400">
              {currentQuota.remaining} / {currentQuota.limit}
            </span>
          </div>
        )}

        {isQuotaExhausted && !isModeLocked(mode) && (
          <span className="text-xs text-red-400">
            {t("quota.exhausted")}
          </span>
        )}
      </div>

      {running && (
        <div className="space-y-3">
          <AnalysisProgress steps={progressSteps} startTime={startTime} />
          <button
            type="button"
            onClick={handleAbort}
            className="flex items-center gap-1.5 rounded-md bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors"
          >
            <Square size={10} />
            {t("actions.cancel")}
          </button>
        </div>
      )}

      {error && !running && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => handleStart(false)}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <RefreshCw size={12} />
            {t("actions.retry")}
          </button>
        </div>
      )}

      {displayReport && !running && (
        <div className="space-y-5">
          <AdversarialFlow report={displayReport} />

          {displayReport.cached && (
            <button
              type="button"
              onClick={() => handleStart(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 transition-colors"
            >
              <RefreshCw size={12} />
              {t("actions.refresh")}
            </button>
          )}

          <AnalysisReport
            key={`${displayReport.symbol}-${displayReport.mode}-${displayReport.timestamp}`}
            report={displayReport}
          />
        </div>
      )}

      {displayConsensus && !running && !displayReport && (
        <ConsensusCache
          report={displayConsensus}
          canStart={canStart}
          onRefresh={() => handleStart(true)}
        />
      )}

      {!running && !displayReport && !displayConsensus && !error && (
        <div className="flex flex-col items-center justify-center py-24 relative z-10 w-full max-w-lg mx-auto">
          <div className="relative h-28 w-28 mb-8">
            {/* Outer spinning ring */}
            <div 
              className="absolute inset-0 border-[0.5px] border-indigo-500/30 rounded-full animate-[spin_8s_linear_infinite]" 
              style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} 
            />
            {/* Inner reverse spinning ring */}
            <div 
              className="absolute inset-2 border-[0.5px] border-violet-500/30 rounded-full animate-[spin_12s_linear_infinite_reverse]" 
              style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }} 
            />
            {/* Dashed circular track */}
            <svg className="absolute inset-0 w-full h-full animate-[spin_20s_linear_infinite]" viewBox="0 0 100 100">
               <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" className="text-indigo-400/10" strokeWidth="1" strokeDasharray="4 6" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Brain size={32} className="text-indigo-400/50 animate-pulse" />
            </div>
          </div>
          <div className="text-center font-mono w-full">
            <p className="text-xs text-indigo-400/70 mb-3 flex items-center justify-center gap-2 font-bold tracking-[0.2em]">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
              SYSTEM.READY
            </p>
            <p className="text-xl text-zinc-300 font-semibold tracking-tight shadow-sm">
              {t("empty.message")}
            </p>
            <p className="mt-3 text-[10px] text-zinc-500 tracking-[0.15em] uppercase max-w-xs mx-auto leading-relaxed">
              {t("empty.subtitle")}
            </p>
            <div className="mt-8 flex justify-center gap-2 opacity-30">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-0.5 w-6 bg-indigo-500" />
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
