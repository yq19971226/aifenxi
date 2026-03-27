"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { AnalysisReport } from "@/components/analysis/AnalysisReport";
import { ModeSelector, MODE_OPTIONS } from "@/components/analysis/ModeSelector";
import { SymbolInput } from "@/components/analysis/SymbolInput";
import { QuotaDisplay } from "@/components/analysis/QuotaDisplay";
import { MarketRegimeBadge } from "@/components/analysis/MarketRegimeBadge";
import { UpgradeModal, type UpgradeReason } from "@/components/analysis/UpgradeModal";
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

// ── Constants ────────────────────────────────────────────────

const FALLBACK_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

interface AnalysisPanelProps {
  symbol: string;
}

// ── Component ────────────────────────────────────────────────

export function AnalysisPanel({ symbol: externalSymbol }: AnalysisPanelProps) {
  const queryClient = useQueryClient();
  const locale = useLocale();
  const t = useTranslations("common");

  const [symbol, setSymbol] = useState(externalSymbol);
  useEffect(() => { setSymbol(externalSymbol); }, [externalSymbol]);
  const [mode, setMode] = useState<AnalysisMode>("scalping");
  const [running, setRunning] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressEvent[]>([]);
  const [report, setReport] = useState<AnalysisReportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | undefined>(undefined);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("exhausted");
  const [upgradeTierLabel, setUpgradeTierLabel] = useState<string | undefined>(undefined);

  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      abortControllerRef.current?.abort();
    };
  }, []);

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
  const tCommon = useTranslations("common");
  const adminLevel = effectiveLevel(user);
  const userLevel = Math.max(adminLevel, quota?.level ?? 0);

  const currentQuota = quota?.quotas?.[mode] ?? null;
  const isModeLocked = useCallback((m: AnalysisMode): boolean => {
    // 优先使用后端返回的 locked 状态（后端考虑了免费体验 bonus）
    const backendQuota = quota?.quotas?.[m];
    if (backendQuota !== undefined) {
      return backendQuota.locked;
    }
    // fallback: 本地计算
    const opt = MODE_OPTIONS.find((o) => o.value === m);
    return (opt?.minLevel ?? 0) > userLevel;
  }, [userLevel, quota]);
  const isQuotaExhausted = currentQuota !== null && currentQuota.remaining === 0;
  const isMaintenance = quota?.maintenance === true;

  const modeLocked = isModeLocked(mode);
  const canStart =
    symbol.trim().length > 0 &&
    !modeLocked &&
    !isQuotaExhausted &&
    !isMaintenance &&
    !running;

  const handleStart = useCallback(
    async (forceRefresh = false) => {
      if (running || !symbol.trim() || isModeLocked(mode)) return;
      if (!forceRefresh && isQuotaExhausted) return;

      abortRef.current = false;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setRunning(true);
      setProgressSteps([]);
      setReport(null);
      setError(null);
      setStartTime(Date.now());

      try {
        for await (const event of runAnalysis(symbol, mode, forceRefresh, locale, controller.signal)) {
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
              const msg = event.message ?? "";
              setError(
                /401|未授权|unauthorized/i.test(msg)
                  ? tCommon("messages.unauthorized")
                  : /network|fetch|网络|连接/i.test(msg) || msg === "network error"
                    ? tCommon("messages.networkError")
                    : msg || tCommon("messages.networkError"),
              );
              shouldStop = true;
              break;
          }

          if (shouldStop) {
            break;
          }
        }
      } catch (err: unknown) {
        if (!abortRef.current && !(err instanceof DOMException && err.name === "AbortError")) {
          const raw =
            err instanceof Error ? err.message : "\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5";
          const message =
            /401|未授权|unauthorized/i.test(raw)
              ? tCommon("messages.unauthorized")
              : /network|fetch|网络|连接/i.test(raw) || raw === "network error"
                ? tCommon("messages.networkError")
                : raw;
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
    [running, symbol, mode, locale, isModeLocked, isQuotaExhausted, queryClient, tCommon],
  );

  const handleRetry = useCallback(() => {
    handleStart(false);
  }, [handleStart]);

  const handleForceRefresh = useCallback(() => {
    handleStart(true);
  }, [handleStart]);

  const handleModeSelect = useCallback((m: AnalysisMode) => {
    if (isModeLocked(m)) {
      const opt = MODE_OPTIONS.find((o) => o.value === m);
      setUpgradeTierLabel(opt?.tierLabel ?? "Premium");
      setUpgradeReason("locked");
      setUpgradeModalOpen(true);
      return;
    }
    setUpgradeHint(null);
    setMode(m);
    setReport(null);
    setError(null);
    setProgressSteps([]);
  }, [isModeLocked]);

  const handleStartOrUpgrade = useCallback(() => {
    if (isQuotaExhausted) {
      setUpgradeReason("exhausted");
      setUpgradeModalOpen(true);
      return;
    }
    handleStart(false);
  }, [isQuotaExhausted, handleStart]);

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
          <span className="w-2 h-6 rounded-full bg-indigo-500" />
          {t("analysisPanel.title")}
        </h2>
        <p className="text-sm text-zinc-400 mt-1">{t("analysisPanel.subtitle")}</p>
      </div>

      {/* Mode selector */}
      <ModeSelector
        mode={mode}
        userLevel={userLevel}
        running={running}
        lockedModes={quota?.quotas ? Object.fromEntries(
          Object.entries(quota.quotas).map(([k, v]) => [k, v.locked])
        ) : undefined}
        onSelect={handleModeSelect}
      />

      {/* Market regime badge */}
      {regime && !running && !report && <MarketRegimeBadge regime={regime} />}

      {/* Symbol input + start button */}
      <SymbolInput
        symbol={symbol}
        onSymbolChange={setSymbol}
        quickSymbols={quickSymbols}
        running={running}
        canStart={canStart || isQuotaExhausted}
        onStart={handleStartOrUpgrade}
      />

      {/* Quota & upgrade hints */}
      <QuotaDisplay
        quota={currentQuota}
        isLocked={modeLocked}
        isExhausted={isQuotaExhausted}
        upgradeHint={upgradeHint}
      />

      {/* Progress indicator */}
      {running && <AnalysisProgress steps={progressSteps} startTime={startTime} />}

      {/* Maintenance banner */}
      {isMaintenance && !running && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-5 py-5 text-center space-y-3"
        >
          <div className="text-3xl">🔧</div>
          <p className="text-sm font-bold text-sky-300">{t("analysisPanel.maintenanceTitle")}</p>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
            {t("analysisPanel.maintenanceDesc")}
          </p>
        </motion.div>
      )}

      {/* Error display */}
      {error && !running && !isMaintenance && (
        <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-3">
          <p className="text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
          >
            <RefreshCw size={12} />
            {tCommon("buttons.refresh")}
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
              {tCommon("buttons.refresh")}
            </button>
          )}
          <AnalysisReport
            key={`${report.symbol}-${report.mode}-${report.timestamp}`}
            report={report}
          />
        </motion.div>
      )}

      {/* Upgrade modal */}
      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        reason={upgradeReason}
        tierLabel={upgradeTierLabel}
      />
    </motion.div>
  );
}
