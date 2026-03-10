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
  const isQuotaExhausted = currentQuota !== null && currentQuota.remaining === 0;
  const canStart = symbol.trim().length > 0 && !isModeLocked(mode) && !isQuotaExhausted;

  const {
    running, progressSteps, analysisReport, error,
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
      if (isModeLocked(m) || running) return;
      setMode(m);
    },
    [isModeLocked, running],
  );

  // Which report to display: analysis report (fresh) > consensus cache
  const displayReport = analysisReport;
  const displayConsensus = consensusReport;

  return (
    <div className="mx-auto max-w-[1500px] px-4 md:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">{t("title")}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {t("subtitle")}
          </p>
        </div>
        <SymbolSelector value={symbol} onChange={setSymbol} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {MODE_CONFIGS.map((cfg) => {
          const locked = isModeLocked(cfg.value);
          const selected = mode === cfg.value;
          return (
            <button
              key={cfg.value}
              type="button"
              onClick={() => handleModeSelect(cfg.value)}
              disabled={running}
              className={`relative card p-5 text-left transition-all ${
                selected
                  ? "ring-1 ring-indigo-500/50 bg-indigo-500/[0.05]"
                  : locked
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-white/[0.02] cursor-pointer"
              }`}
            >
              {locked && (
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
              {locked && cfg.tierLabel && (
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
          className={`w-full sm:w-auto px-8 py-3.5 rounded-lg font-bold text-base flex items-center justify-center gap-2 transition-all ${
            running
              ? "bg-white/[0.05] text-zinc-400 border border-white/[0.1]"
              : canStart
                ? "bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
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
          <AnalysisProgress steps={progressSteps} />
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
        <div className="flex flex-col items-center justify-center py-20 relative z-10">
          <Brain size={32} className="text-zinc-500 mb-3" />
          <p className="text-base text-zinc-400">
            {t("empty.message")}
          </p>
        </div>
      )}
    </div>
  );
}
