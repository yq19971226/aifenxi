"use client";

import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchConsensusLatest } from "@/lib/api/consensus";
import {
  fetchAnalysisQuota,
  runAnalysis,
  type AnalysisMode,
  type AnalysisQuotaResponse,
  type AnalysisReport as AnalysisReportType,
  type ProgressEvent,
} from "@/lib/api/analysis";
import { SymbolSelector } from "@/components/layout/SymbolSelector";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { AnalysisReport } from "@/components/analysis/AnalysisReport";
import { mapConfidenceLabel } from "@/lib/utils/confidence";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import { Lock, RefreshCw, Brain } from "lucide-react";

import {
  DEFAULT_SYMBOL,
  MODE_CONFIGS,
  SIGNAL_LABELS,
  SIGNAL_COLORS,
  formatTimestamp,
} from "./_components/consensus-config";
import { AdversarialFlow } from "./_components/AdversarialFlow";
import { ModelCard } from "./_components/ModelCard";
import { WeightDonut } from "./_components/WeightDonut";
import { DivergenceGauge } from "./_components/DivergenceGauge";
import { MinorityWarnings } from "./_components/MinorityWarnings";

// ── Main page ───────────────────────────────────────────────

export default function ConsensusPage() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || DEFAULT_SYMBOL;

  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [mode, setMode] = useState<AnalysisMode>("scalping");
  const [running, setRunning] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressEvent[]>([]);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReportType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef(false);
  const queryClient = useQueryClient();

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
  const canStart = symbol.trim().length > 0 && !isModeLocked(mode) && !isQuotaExhausted && !running;

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
      setAnalysisReport(null);
      setError(null);
      setProgressSteps([]);
    },
    [isModeLocked, running],
  );

  const handleStart = useCallback(
    async (forceRefresh = false) => {
      if (running || !symbol.trim() || isModeLocked(mode)) return;
      if (!forceRefresh && isQuotaExhausted) return;

      abortRef.current = false;
      setRunning(true);
      setProgressSteps([]);
      setAnalysisReport(null);
      setError(null);

      try {
        for await (const event of runAnalysis(symbol, mode, forceRefresh)) {
          if (abortRef.current) break;
          let shouldStop = false;
          switch (event.type) {
            case "progress":
              setProgressSteps((prev) => {
                const idx = prev.findIndex((s) => s.step === event.step);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = event;
                  return updated;
                }
                return [...prev, event];
              });
              break;
            case "complete":
            case "cached":
              setAnalysisReport(event.report);
              shouldStop = true;
              break;
            case "error":
              setError(event.message);
              shouldStop = true;
              break;
          }

          if (shouldStop) {
            break;
          }
        }
      } catch (err: unknown) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : "\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5");
        }
      } finally {
        setRunning(false);
        queryClient.invalidateQueries({ queryKey: ["analysis-quota"] });
        queryClient.invalidateQueries({ queryKey: ["consensus", symbol] });
      }
    },
    [running, symbol, mode, isModeLocked, isQuotaExhausted, queryClient],
  );

  // Which report to display: analysis report (fresh) > consensus cache
  const displayReport = analysisReport;
  const displayConsensus = consensusReport;

  return (
    <div className="mx-auto max-w-[1500px] px-4 md:px-8 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">{"\u7EFC\u5408\u5206\u6790"}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {"\u591A\u667A\u80FD\u4F53\u5E76\u884C\u5206\u6790 + AI\u5BF9\u6297\u63A8\u6F14 \u2192 \u7CBE\u51C6\u70B9\u4F4D"}
          </p>
        </div>
        <SymbolSelector value={symbol} onChange={setSymbol} />
      </div>

      {/* ── Mode Cards (3) ── */}
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
              <h3 className="mt-2 text-base font-semibold text-white">{cfg.label}</h3>
              <p className="mt-1 text-sm text-zinc-500">{cfg.desc}</p>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-zinc-300">
                  {cfg.agents}
                </span>
                <span className="text-zinc-500">{cfg.periods}</span>
              </div>
              {locked && cfg.tierLabel && (
                <span className="mt-2 inline-block rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                  {"\u9700\u8981"}{cfg.tierLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Start Button + Quota ── */}
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
              {"\u5206\u6790\u4E2D..."}
            </>
          ) : (
            <>
              <Brain size={16} />
              {"\u5F00\u59CB\u5206\u6790"}
            </>
          )}
        </button>

        {currentQuota && !isModeLocked(mode) && (
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <span>{"\u4ECA\u65E5\u914D\u989D"}</span>
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
            {"\u4ECA\u65E5\u914D\u989D\u5DF2\u7528\u5B8C\uFF0C\u660E\u65E5 UTC 00:00 \u91CD\u7F6E"}
          </span>
        )}
      </div>

      {/* ── Progress ── */}
      {running && <AnalysisProgress steps={progressSteps} />}

      {/* ── Error ── */}
      {error && !running && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => handleStart(false)}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <RefreshCw size={12} />
            {"\u91CD\u8BD5"}
          </button>
        </div>
      )}

      {/* ── Analysis Report (fresh) ── */}
      {displayReport && !running && (
        <div className="space-y-5">
          {/* AI Adversarial Flow */}
          <AdversarialFlow report={displayReport} />

          {/* Cached hint + refresh */}
          {displayReport.cached && (
            <button
              type="button"
              onClick={() => handleStart(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 transition-colors"
            >
              <RefreshCw size={12} />
              {"\u7F13\u5B58\u7ED3\u679C\uFF0C\u70B9\u51FB\u91CD\u65B0\u5206\u6790"}
            </button>
          )}

          {/* Full report */}
          <AnalysisReport report={displayReport} />
        </div>
      )}

      {/* ── Consensus Report (cached) ── */}
      {displayConsensus && !running && !displayReport && (
        <div className="space-y-6 relative z-10">
          {/* Consensus summary */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="flex flex-wrap items-center gap-8">
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  {"\u5171\u8BC6\u4FE1\u53F7"}
                </span>
                <span
                  className={`text-3xl font-bold ${
                    (SIGNAL_COLORS[displayConsensus.consensus_signal] ?? SIGNAL_COLORS.neutral).text
                  }`}
                >
                  {SIGNAL_LABELS[displayConsensus.consensus_signal]}
                </span>
              </div>

              <div className="h-12 w-px bg-white/[0.08]" />

              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  {"\u5171\u8BC6\u7F6E\u4FE1\u5EA6"}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-zinc-200">
                    {(displayConsensus.consensus_confidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-zinc-500">
                    {mapConfidenceLabel(displayConsensus.consensus_confidence)}
                  </span>
                </div>
              </div>

              <div className="h-12 w-px bg-white/[0.08]" />

              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  {"\u6700\u540E\u66F4\u65B0"}
                </span>
                <span className="font-mono text-sm text-zinc-400 mt-2">
                  {formatTimestamp(displayConsensus.timestamp)}
                </span>
              </div>
            </div>
          </div>

          {/* Model cards 2x2 */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 relative z-10">
            {displayConsensus.model_votes.map((vote) => (
              <ModelCard key={vote.model_key} vote={vote} />
            ))}
          </div>

          {/* Weight donut + divergence */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 relative z-10">
            <WeightDonut weights={displayConsensus.weights} />
            <DivergenceGauge divergence={displayConsensus.divergence} />
          </div>

          {/* Minority warnings */}
          <div className="relative z-10">
            <MinorityWarnings warnings={displayConsensus.minority_warnings} />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!running && !displayReport && !displayConsensus && !error && (
        <div className="flex flex-col items-center justify-center py-20 relative z-10">
          <Brain size={32} className="text-zinc-600 mb-3" />
          <p className="text-base text-zinc-400">
            {"\u9009\u62E9\u5206\u6790\u6A21\u5F0F\uFF0C\u70B9\u51FB\u300C\u5F00\u59CB\u5206\u6790\u300D\u83B7\u53D6AI\u62A5\u544A"}
          </p>
        </div>
      )}
    </div>
  );
}
