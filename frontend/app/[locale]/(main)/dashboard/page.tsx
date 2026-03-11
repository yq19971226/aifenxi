"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchDashboardOverview } from "@/lib/api/dashboard";
import { runDashboardRuleEngine, type RuleResult } from "@/lib/dashboardRuleEngine";
import { AlertCircle, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 size={32} className="animate-spin mb-4" />
        <p className="text-sm font-mono tracking-widest uppercase">{t("initializingEngine")}</p>
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">{t("commandCenter")}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {">"} {t("welcomeBack")}, {user?.email?.split("@")[0]?.toUpperCase() ?? "USER"}
          </p>
        </div>
        <div className="flex items-center gap-6 px-4 py-2 rounded bg-bg-surface border border-border text-xs font-mono">
          <div>
            <span className="text-muted-foreground mr-2">{t("credits").toUpperCase()}</span>
            <span className="text-foreground font-bold">{overview?.credits_remaining ?? 0}</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div>
            <span className="text-muted-foreground mr-2">{t("rank").toUpperCase()}</span>
            <span className="text-bull font-bold">{t("topPercent")}</span>
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
          <div className="rounded-lg border border-border border-dashed p-12 text-center">
            <p className="text-muted-foreground mb-2">{t("noActiveSessions")}</p>
            <p className="text-xs text-muted-foreground/80 max-w-md mx-auto">{t("noSymbolsHint")}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded bg-bg-surface border border-border text-sm text-foreground hover:bg-bg-elevated"
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
      className="flex items-center justify-between rounded-lg border border-border bg-bg-surface/50 px-4 py-3 hover:bg-bg-surface transition-colors"
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
