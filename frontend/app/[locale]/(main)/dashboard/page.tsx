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
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6 md:p-8 backdrop-blur-xl">
        {/* Background ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px] -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-emerald-500/5 blur-[80px] -ml-20 -mb-20" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-widest mb-1.5 text-white drop-shadow-sm uppercase">{t("commandCenter")}</h1>
            <p className="text-sm md:text-base text-zinc-400 font-mono tracking-tight flex items-center gap-2">
              <span className="text-indigo-400">{">"}</span> {t("welcomeBack")}, <span className="text-zinc-200">{user?.email?.split("@")[0]?.toUpperCase() ?? "USER"}</span>
            </p>
          </div>
          <div className="flex items-center gap-6 px-6 py-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] shadow-inner text-xs font-mono backdrop-blur-md">
            <div className="flex flex-col">
              <span className="text-zinc-500 mb-0.5 text-[11px] font-bold uppercase tracking-[0.2em]">{t("credits").toUpperCase()}</span>
              <span className="text-white font-black text-[17px] tracking-tight">{overview?.credits_remaining ?? 0}</span>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div className="flex flex-col">
              <span className="text-zinc-500 mb-0.5 text-[11px] font-bold uppercase tracking-[0.2em]">{t("rank").toUpperCase()}</span>
              <span className="text-emerald-400 font-black text-[17px] tracking-tight drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">{t("topPercent")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 全币种规则研判：后台自动刷新，纯规则引擎展示 */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-zinc-300 uppercase tracking-[0.15em] flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
              </span>
              {t("liveAnalysisFeed")}
            </h2>
            <span className="text-[11px] font-mono font-bold text-zinc-600 uppercase tracking-widest hidden sm:inline ml-2 pl-3 border-l border-zinc-800">
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
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.04] hover:border-white/[0.08] px-5 py-3.5 rounded-xl transition-all group shadow-sm"
    >
      <div className="flex items-center gap-4 min-w-0">
        <span className="text-[15px] font-black text-white shrink-0 tracking-tight">
          {row.display_name}
        </span>
        <span className="text-xs sm:text-sm font-mono font-bold text-zinc-500 tracking-tight">{priceStr}</span>
        
        <div className="h-4 w-px bg-white/[0.08] hidden sm:block" />
        
        <div className="flex items-center gap-2 shrink-0">
          <div className={`p-1 rounded bg-white/[0.03] ${isLong ? 'text-emerald-400' : isShort ? 'text-red-400' : 'text-zinc-500'}`}>
            {isLong && <TrendingUp size={14} />}
            {isShort && <TrendingDown size={14} />}
            {row.direction === "neutral" && <Minus size={14} />}
          </div>
          <span
            className={`text-[11px] sm:text-xs font-bold uppercase tracking-widest ${
              row.verdict === "opportunity"
                ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]"
                : row.verdict === "risk"
                  ? "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]"
                  : "text-zinc-500"
            }`}
          >
            {t(verdictKey)}
          </span>
        </div>
      </div>
      
      <div className="flex items-center justify-end sm:justify-start gap-3 text-zinc-500 shrink-0">
        <div className="flex flex-col items-end sm:items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5">{t("table.confidence")}</span>
          <span className="text-xs sm:text-sm font-mono font-black text-zinc-300">{(row.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="p-1 rounded-md group-hover:bg-white/[0.05] group-hover:text-white transition-colors ml-2">
          <ChevronRight size={16} />
        </div>
      </div>
    </Link>
  );
}
