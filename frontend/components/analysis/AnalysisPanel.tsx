"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, ArrowRightLeft, Bot, Lock, RefreshCw, TrendingUp, Zap } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { AnalysisReport } from "@/components/analysis/AnalysisReport";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import {
  fetchAnalysisQuota,
  fetchMarketRegime,
  runAnalysis,
  type AnalysisMode,
  type AnalysisQuotaResponse,
  type AnalysisReport as AnalysisReportType,
  type MarketRegime,
  type ProgressEvent,
} from "@/lib/api/analysis";
import { listSymbols } from "@/lib/api/symbols";

// ── Types ────────────────────────────────────────────────────

interface AnalysisPanelProps {
  symbol: string;
}

interface ModeOption {
  value: AnalysisMode;
  label: string;
  desc: string;
  agents: number;
  icon: typeof Zap;
  minLevel: number;
  tierLabel: string;
}

// ── Constants ────────────────────────────────────────────────

const FALLBACK_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

const MODE_OPTIONS: ModeOption[] = [
  { value: "scalping", label: "\u5B9E\u65F6\u77ED\u7EBF", desc: "\u5FEB\u901F\u6280\u672F\u9762\u5206\u6790", agents: 1, icon: Zap, minLevel: 0, tierLabel: "" },
  { value: "intraday", label: "\u65E5\u5185\u535A\u5F08", desc: "\u591A\u7EF4\u5EA6\u4EA4\u53C9\u9A8C\u8BC1", agents: 6, icon: Activity, minLevel: 1, tierLabel: "\u4E13\u4E1A\u7248" },
  { value: "trend", label: "\u8D8B\u52BF\u5E03\u5C40", desc: "\u5168\u667A\u80FD\u4F53\u6DF1\u5EA6\u535A\u5F08", agents: 10, icon: Bot, minLevel: 2, tierLabel: "\u65D7\u8230\u7248" },
];

// ── Component ────────────────────────────────────────────────

export function AnalysisPanel({ symbol: externalSymbol }: AnalysisPanelProps) {
  const queryClient = useQueryClient();

  const [symbol, setSymbol] = useState(externalSymbol);
  useEffect(() => { setSymbol(externalSymbol); }, [externalSymbol]);
  const [mode, setMode] = useState<AnalysisMode>("scalping");
  const [running, setRunning] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressEvent[]>([]);
  const [report, setReport] = useState<AnalysisReportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | undefined>(undefined);

  const abortRef = useRef(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { data: symbolList } = useQuery({
    queryKey: ["symbols"],
    queryFn: listSymbols,
    staleTime: 300_000,
    select: (data) => data.map((s) => s.symbol),
  });
  const quickSymbols = symbolList?.length ? symbolList : FALLBACK_SYMBOLS;

  const { data: quota } = useQuery<AnalysisQuotaResponse>({
    queryKey: ["analysis-quota"],
    queryFn: fetchAnalysisQuota,
    refetchInterval: 60_000,
  });

  const { data: regime } = useQuery<MarketRegime>({
    queryKey: ["market-regime", symbol],
    queryFn: () => fetchMarketRegime(symbol, "1h"),
    enabled: symbol.trim().length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const { user } = useAuth();
  const adminLevel = effectiveLevel(user);
  const userLevel = Math.max(adminLevel, quota?.level ?? 0);

  const currentQuota = quota?.quotas?.[mode] ?? null;
  const isModeLocked = (m: AnalysisMode): boolean => {
    const opt = MODE_OPTIONS.find((o) => o.value === m);
    return (opt?.minLevel ?? 0) > userLevel;
  };
  const isQuotaExhausted = currentQuota !== null && currentQuota.remaining === 0;

  const canStart =
    symbol.trim().length > 0 &&
    !isModeLocked(mode) &&
    !isQuotaExhausted &&
    !running;

  const handleStart = useCallback(
    async (forceRefresh = false) => {
      if (running || !symbol.trim() || isModeLocked(mode)) return;
      if (!forceRefresh && isQuotaExhausted) return;

      abortRef.current = false;
      setRunning(true);
      setProgressSteps([]);
      setReport(null);
      setError(null);
      setStartTime(Date.now());

      try {
        for await (const event of runAnalysis(symbol, mode, forceRefresh)) {
          if (abortRef.current) break;
          let shouldStop = false;

          switch (event.type) {
            case "progress":
              setProgressSteps((prev) => {
                const existing = prev.findIndex((s) => s.step === event.step);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = event;
                  return updated;
                }
                return [...prev, event];
              });
              break;
            case "partial":
              break;
            case "complete":
            case "cached":
              setReport(event.report);
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
          const message =
            err instanceof Error ? err.message : "\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5";
          setError(message);
        }
      } finally {
        setRunning(false);
        setStartTime(undefined);
        queryClient.invalidateQueries({ queryKey: ["analysis-quota"] });
        // Scroll to report after a short delay for render
        setTimeout(() => {
          reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      }
    },
    [running, symbol, mode, userLevel, isQuotaExhausted, queryClient],
  );

  const handleRetry = useCallback(() => {
    handleStart(false);
  }, [handleStart]);

  const handleForceRefresh = useCallback(() => {
    handleStart(true);
  }, [handleStart]);

  const handleModeSelect = useCallback((m: AnalysisMode) => {
    const opt = MODE_OPTIONS.find((o) => o.value === m);
    if (opt && opt.minLevel > userLevel) {
      setUpgradeHint(`\u8BE5\u6A21\u5F0F\u9700\u8981${opt.tierLabel}\u4F1A\u5458\uFF0C\u8BF7\u5347\u7EA7\u540E\u4F7F\u7528`);
      return;
    }
    setUpgradeHint(null);
    setMode(m);
    setReport(null);
    setError(null);
    setProgressSteps([]);
  }, [userLevel]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card flex flex-col p-6 md:p-8 space-y-6 md:space-y-8"
    >
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="w-2 h-6 rounded-full bg-blue-500"></span>
          {"\u7EFC\u5408\u5206\u6790"}
        </h2>
        <p className="text-sm text-zinc-400 mt-1">{"\u57FA\u4E8E\u591A\u7EF4\u5EA6\u6570\u636E\u7684\u667A\u80FD\u5206\u6790\u5F15\u64CE"}</p>
      </div>

      {/* Mode selector cards */}
      <div className="grid grid-cols-3 gap-3">
        {MODE_OPTIONS.map((opt) => {
          const locked = isModeLocked(opt.value);
          const selected = mode === opt.value && !locked;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleModeSelect(opt.value)}
              disabled={running}
              className={`relative flex flex-col items-start rounded-xl px-4 py-3.5 text-left transition-all duration-200 border ${
                selected
                  ? "bg-blue-500/[0.08] border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                  : locked
                    ? "bg-white/[0.01] border-white/[0.04] cursor-not-allowed opacity-50"
                    : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1]"
              } disabled:opacity-50`}
              title={locked ? `\u9700\u8981${opt.tierLabel}` : undefined}
            >
              <div className="flex items-center gap-2 w-full">
                <Icon size={14} className={selected ? "text-blue-400" : locked ? "text-zinc-600" : "text-zinc-500"} />
                <span className={`text-sm font-semibold ${
                  selected ? "text-blue-400" : locked ? "text-zinc-600" : "text-zinc-200"
                }`}>
                  {opt.label}
                </span>
                {locked && <Lock size={11} className="ml-auto text-zinc-600" />}
                {selected && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]" />}
              </div>
              <p className={`text-sm mt-1.5 ${
                selected ? "text-zinc-400" : locked ? "text-zinc-700" : "text-zinc-500"
              }`}>
                {opt.desc}
              </p>
              <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono ${
                selected ? "bg-blue-500/15 text-blue-400" : "bg-white/[0.04] text-zinc-500"
              }`}>
                <Bot size={10} /> {opt.agents} AI
              </span>
            </button>
          );
        })}
      </div>

      {/* Market regime badge */}
      {regime && !running && !report && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
            regime.regime === "ranging"
              ? "border-amber-500/20 bg-amber-500/[0.04]"
              : regime.regime === "volatile"
                ? "border-red-500/20 bg-red-500/[0.04]"
                : "border-emerald-500/20 bg-emerald-500/[0.04]"
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {regime.regime === "ranging" ? (
              <ArrowRightLeft className="h-4 w-4 text-amber-400" />
            ) : regime.regime === "volatile" ? (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            ) : (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-bold ${
                regime.regime === "ranging" ? "text-amber-400"
                  : regime.regime === "volatile" ? "text-red-400" : "text-emerald-400"
              }`}>
                {regime.regime === "ranging" ? "\u2014 \u9707\u8361\u533a\u95f4" : regime.regime === "volatile" ? "\u26a0 \u9ad8\u6ce2\u52a8" : "\u2191 \u8d8b\u52bf\u884c\u60c5"}
              </span>
              {regime.adx !== null && (
                <span className="text-xs font-mono text-zinc-500">ADX {regime.adx.toFixed(1)}</span>
              )}
              {regime.confidence > 0 && (
                <span className="text-xs font-mono text-zinc-500">
                  {(regime.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">{regime.suggestion}</p>
            {regime.support !== null && regime.resistance !== null && regime.regime === "ranging" && (
              <p className="text-xs font-mono text-zinc-500 mt-1">
                \u652f\u6491 {regime.support.toLocaleString()} ~ \u963b\u529b {regime.resistance.toLocaleString()}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Inputs Area */}
      <div className="flex flex-col lg:flex-row items-end gap-4 bg-white/[0.01] border border-white/[0.03] p-5 rounded-2xl">
        <div className="w-full flex-1 space-y-2">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            {"\u4EA4\u6613\u5BF9 Symbol"}
          </label>
          <div className="relative">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder={"BTCUSDT"}
              disabled={running}
              className="w-full bg-black/40 border border-white/[0.08] focus:border-blue-500/50 rounded-xl py-3.5 pl-4 pr-24 text-white text-[16px] font-mono transition-all outline-none"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              {quickSymbols.slice(0, 3).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSymbol(s)}
                  disabled={running}
                  className="px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-xs font-mono text-zinc-300 transition-colors"
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Start button */}
        <button
          type="button"
          onClick={() => handleStart(false)}
          disabled={!canStart}
          className={`shrink-0 w-full lg:w-[180px] h-[52px] rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-300 ${
            running
              ? "bg-white/[0.05] text-zinc-400 border border-white/[0.1]"
              : canStart
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] hover:scale-[1.02]"
                : "bg-white/[0.02] text-zinc-600 border border-white/[0.05]"
          }`}
        >
          {running ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {"\u5206\u6790\u4E2D..."}
            </>
          ) : (
            "\u5F00\u59CB\u5206\u6790"
          )}
        </button>
      </div>

      {/* Details Row (Quota & Upgrades) */}
      {upgradeHint && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2"
        >
          <p className="text-sm text-amber-400">{upgradeHint}</p>
        </motion.div>
      )}

      <div className="flex flex-col gap-2">
        {upgradeHint && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex items-center"
          >
            <p className="text-sm text-amber-400 font-medium">{upgradeHint}</p>
          </motion.div>
        )}

        {isQuotaExhausted && !isModeLocked(mode) && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-400 font-medium">
              {"\u4ECA\u65E5\u914D\u989D\u5DF2\u7528\u5B8C\uFF0C\u660E\u65E5 UTC 00:00 \u91CD\u7F6E"}
            </p>
          </div>
        )}

        {currentQuota && !isModeLocked(mode) && !isQuotaExhausted && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              <span className="text-xs text-zinc-500">{"\u4ECA\u65E5\u5206\u6790\u914D\u989D"}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, currentQuota.limit) }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-6 rounded-full ${
                      i < currentQuota.remaining
                        ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                        : "bg-white/[0.05]"
                    }`}
                  />
                ))}
              </div>
              <span className="stat-value text-xs text-zinc-400 ml-2">
                {currentQuota.remaining} / {currentQuota.limit}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Progress indicator */}
      {running && <AnalysisProgress steps={progressSteps} startTime={startTime} />}

      {/* Error display */}
      {error && !running && (
        <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-3">
          <p className="text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
          >
            <RefreshCw size={12} />
            {"\u91CD\u8BD5"}
          </button>
        </div>
      )}

      {/* Report display */}
      {report && !running && (
        <motion.div
          ref={reportRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="space-y-3"
        >
          {report.cached && (
            <button
              type="button"
              onClick={handleForceRefresh}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
            >
              <RefreshCw size={12} />
              {"\u91CD\u65B0\u5206\u6790"}
            </button>
          )}
          <AnalysisReport report={report} />
        </motion.div>
      )}
    </motion.div>
  );
}
