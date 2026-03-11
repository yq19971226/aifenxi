"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchDashboardOverview } from "@/lib/api/dashboard";
import { runDashboardRuleEngine, type RuleResult } from "@/lib/dashboardRuleEngine";
import { AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { user } = useAuth();

  const {
    data: overview,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: fetchDashboardOverview,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="relative h-16 w-16 mb-5">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
          </svg>
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2s' }}>
            <div className="absolute top-0 left-1/2 -ml-[4px] w-2 h-2 rounded-full bg-zinc-400 shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
          </div>
        </div>
        <p className="text-sm font-mono text-zinc-500 tracking-widest uppercase">{t("initializingEngine")}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-bear">
        <AlertCircle size={48} className="mb-4 opacity-50" />
        <h2 className="text-lg font-bold mb-2">{t("connectionFailed")}</h2>
        <p className="text-sm text-muted-foreground mb-6">{t("connectionFailedDesc")}</p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded bg-bg-surface border border-border hover:bg-bg-elevated transition-colors text-sm font-medium text-foreground"
        >
          <RefreshCw size={14} /> {t("retryConnection")}
        </button>
      </div>
    );
  }

  const symbols = overview?.symbols ?? [];
  const ruleResults = runDashboardRuleEngine(symbols);
  const hasSymbols = symbols.length > 0;

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.01] p-6 md:p-8">
        {/* Background ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-indigo-500/[0.03] blur-[80px]" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1 text-white">{t("commandCenter")}</h1>
            <p className="text-sm text-zinc-500 font-mono">
              {">"} {t("welcomeBack")}, {user?.email?.split("@")[0]?.toUpperCase() ?? "USER"}
            </p>
          </div>
          <div className="flex items-center gap-6 px-5 py-2.5 rounded-lg glass-card text-xs font-mono">
            <div>
              <span className="text-zinc-600 mr-2 text-[10px] uppercase tracking-wider">{t("credits").toUpperCase()}</span>
              <span className="text-white font-bold text-base">{overview?.credits_remaining ?? 0}</span>
            </div>
            <div className="w-px h-5 bg-white/[0.06]" />
            <div>
              <span className="text-zinc-600 mr-2 text-[10px] uppercase tracking-wider">{t("rank").toUpperCase()}</span>
              <span className="text-emerald-400 font-bold text-base">{t("topPercent")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 全币种规则研判：后台自动刷新，纯规则引擎展示 */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-bull animate-pulse" />
              {t("liveAnalysisFeed")}
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground/80 hidden sm:inline">
              {t("autoRefreshHint")}
            </span>
          </div>
          <Link
            href={`/${locale}/consensus`}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {t("goConsensus")}
            <ChevronRight size={12} />
          </Link>
        </div>

        {!hasSymbols ? (
          <div className="rounded-xl border border-white/[0.04] border-dashed p-14 text-center">
            <div className="relative h-12 w-12 mx-auto mb-4">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" strokeDasharray="4 4" />
              </svg>
            </div>
            <p className="text-zinc-400 mb-1 font-medium">{t("noActiveSessions")}</p>
            <p className="text-xs text-zinc-600 max-w-md mx-auto">{t("noSymbolsHint")}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg glass-card text-sm text-zinc-300 hover:bg-white/[0.04] transition-colors"
            >
              <RefreshCw size={14} /> {t("retryConnection")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {ruleResults.map((row) => (
              <RuleResultRow key={row.symbol} locale={locale} row={row} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RuleResultRow({
  locale,
  row,
  t,
}: {
  locale: string;
  row: RuleResult;
  t: (key: string) => string;
}) {
  const priceStr =
    row.latest_price != null
      ? `$${row.latest_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";
  const verdictKey = `ruleVerdict.${row.verdict}`;
  const isLong = row.direction === "long";
  const isShort = row.direction === "short";

  return (
    <Link
      href={`/${locale}/consensus?symbol=${row.symbol}`}
      className="flex items-center justify-between glass-card glass-card-hover px-4 py-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-semibold text-foreground shrink-0">
          {row.display_name}
        </span>
        <span className="text-xs font-mono text-muted-foreground">{priceStr}</span>
        {isLong && <TrendingUp size={12} className="text-bull shrink-0" />}
        {isShort && <TrendingDown size={12} className="text-bear shrink-0" />}
        {row.direction === "neutral" && <Minus size={12} className="text-muted-foreground shrink-0" />}
        <span
          className={`text-xs font-medium shrink-0 ${
            row.verdict === "opportunity"
              ? "text-bull"
              : row.verdict === "risk"
                ? "text-bear"
                : "text-muted-foreground"
          }`}
        >
          {t(verdictKey)}
        </span>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground shrink-0">
        <span className="text-[10px] font-mono">{(row.confidence * 100).toFixed(0)}%</span>
        <ChevronRight size={14} />
      </div>
    </Link>
  );
}
