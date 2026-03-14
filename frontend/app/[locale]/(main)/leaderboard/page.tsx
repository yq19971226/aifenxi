"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Trophy, BarChart2, History, AlertCircle, TrendingUp, Zap, Clock, Target } from "lucide-react";
import {
  fetchRankings,
  fetchSystemReport,
  fetchMyStats,
  fetchMyHistory,
  fetchSystemAccuracy,
  type ModeAccuracy,
} from "@/lib/api/leaderboard";
import {
  TabButton,
  SystemReportBar,
  RankingTable,
  Pagination,
  RankingsSkeleton,
} from "./components";
import { MyStatsCard, LeaderboardRules, StrategyHistory } from "./history";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";

const PAGE_SIZE = 20;

const PERIOD_KEYS = ["7d", "30d", "90d"] as const;
const MODE_KEYS = ["all", "scalping", "intraday", "trend"] as const;
type LeaderboardPeriod = (typeof PERIOD_KEYS)[number];
type LeaderboardMode = (typeof MODE_KEYS)[number];

const MODE_ICON: Record<string, React.ReactNode> = {
  scalping: <Zap size={18} className="text-amber-400" />,
  intraday: <Clock size={18} className="text-blue-400" />,
  trend: <TrendingUp size={18} className="text-emerald-400" />,
};
const MODE_COLOR: Record<string, string> = {
  scalping: "text-amber-400",
  intraday: "text-blue-400",
  trend: "text-emerald-400",
};

/* ── System Accuracy Hero Panel ── */
function SystemAccuracyHero({
  modes,
  period,
}: {
  modes: ModeAccuracy[];
  period: string;
}) {
  const t = useTranslations("leaderboard");
  if (!modes || modes.length === 0) return null;

  const totalSettled = modes.reduce((s, m) => s + m.settled, 0);
  const totalWins = modes.reduce((s, m) => s + m.wins, 0);
  const overallWr = totalSettled > 0 ? totalWins / totalSettled : 0;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-indigo-400" />
          <span className="text-sm font-semibold text-white">{t("accuracy.title")}</span>
        </div>
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
          {t(`periods.${period}`)}
        </span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {modes.map((m) => (
            <div
              key={m.mode}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col items-center text-center"
            >
              <div className="mb-2">{MODE_ICON[m.mode] || <Target size={18} className="text-zinc-400" />}</div>
              <span className="text-xs text-zinc-500 mb-1">{t(`modes.${m.mode}`)}</span>
              <span className={`text-2xl font-bold font-mono ${MODE_COLOR[m.mode] || "text-white"}`}>
                {(m.win_rate * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-zinc-500 mt-1">{t("accuracy.winRate")}</span>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-400">
                <span>{m.wins}/{m.losses}</span>
                <span className="text-zinc-600">·</span>
                <span className={m.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {m.avg_pnl >= 0 ? "+" : ""}{m.avg_pnl.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-zinc-500 pt-3 border-t border-white/[0.04]">
          <span>
            {t("accuracy.overall")}: <span className="font-mono text-white">{(overallWr * 100).toFixed(1)}%</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span>
            {t("comp.settled")}: <span className="font-mono text-white">{totalSettled}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const t = useTranslations('leaderboard');
  const locale = useLocale();
  const { getState } = useFeatureFlags();
  const [period, setPeriod] = useState<LeaderboardPeriod>("7d");
  const [mode, setMode] = useState<LeaderboardMode>("all");
  const [page, setPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const periods = PERIOD_KEYS.map((key) => ({ value: key, label: t(`periods.${key}`) }));
  const modes = MODE_KEYS.map((key) => ({ value: key, label: t(`modes.${key}`) }));

  const { data: rankingsData, isLoading: rankingsLoading, error: rankingsError } = useQuery({
    queryKey: ["leaderboard-rankings", period, mode, page],
    queryFn: () => fetchRankings(period, mode, page),
    retry: 2,
  });

  const { data: report, isLoading: reportLoading, error: reportError } = useQuery({
    queryKey: ["leaderboard-report", period, mode],
    queryFn: () => fetchSystemReport(period, mode),
    retry: 2,
  });

  const { data: accuracy } = useQuery({
    queryKey: ["leaderboard-accuracy", period],
    queryFn: () => fetchSystemAccuracy(period),
    retry: 2,
    staleTime: 60_000,
  });

  const { data: myStats, isLoading: myStatsLoading, error: myStatsError } = useQuery({
    queryKey: ["leaderboard-me", period, mode],
    queryFn: () => fetchMyStats(period, mode),
    retry: 2,
  });

  const { data: historyData, error: historyError } = useQuery({
    queryKey: ["leaderboard-history", period, mode, historyPage],
    queryFn: () => fetchMyHistory(period, mode, historyPage),
    enabled: showHistory,
    retry: 1,
  });

  const apiError = rankingsError || reportError || myStatsError || historyError;

  function handlePeriod(v: LeaderboardPeriod) {
    setPeriod(v);
    setPage(1);
    setHistoryPage(1);
  }

  function handleMode(v: LeaderboardMode) {
    setMode(v);
    setPage(1);
    setHistoryPage(1);
  }

  if (getState("leaderboard") !== "active") {
    return <MaintenancePlaceholder featureName={t('title')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy size={20} className="text-amber-400" />
          <div>
            <h1 className="text-lg font-semibold text-white">{t('header.title')}</h1>
            <p className="text-xs text-zinc-500">
              {t('header.subtitle')}
            </p>
          </div>
        </div>
        <Link
          href={`/${locale}/performance`}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <BarChart2 size={14} />
          <span>{t('header.performance')}</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          {periods.map((p) => (
            <TabButton
              key={p.value}
              active={period === p.value}
              label={p.label}
              onClick={() => handlePeriod(p.value)}
            />
          ))}
        </div>
        <div className="h-4 w-px bg-white/[0.08]" />
        <div className="flex items-center gap-1.5">
          {modes.map((m) => (
            <TabButton
              key={m.value}
              active={mode === m.value}
              label={m.label}
              onClick={() => handleMode(m.value)}
            />
          ))}
        </div>
      </div>

      {apiError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/[0.06] border border-red-500/20 px-4 py-2.5">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-300">
            {apiError instanceof Error ? apiError.message : t('error.loadFailed')}
          </p>
        </div>
      )}

      {/* ── System Accuracy Hero ── */}
      {accuracy && accuracy.modes.length > 0 && (
        <SystemAccuracyHero modes={accuracy.modes} period={period} />
      )}

      {reportLoading ? (
        <div className="card px-5 py-3 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="h-3 w-16 rounded bg-white/[0.06]" />
            <div className="h-3 w-20 rounded bg-white/[0.06]" />
            <div className="h-3 w-20 rounded bg-white/[0.06]" />
          </div>
        </div>
      ) : report ? (
        <SystemReportBar report={report} />
      ) : null}

      {myStatsLoading ? (
        <div className="card p-5 animate-pulse">
          <div className="h-3 w-24 rounded bg-white/[0.06] mb-4" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="h-2.5 w-10 rounded bg-white/[0.04] mb-1.5" />
                <div className="h-4 w-14 rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>
      ) : myStats ? (
        <div className="space-y-3">
          <MyStatsCard stats={myStats} rank={rankingsData?.my_rank ?? null} />
          {myStats.total_published > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <History size={13} />
              <span>{showHistory ? t('history.collapse') : t('history.expand')}</span>
            </button>
          )}
          {showHistory && historyData && (
            <StrategyHistory
              items={historyData.items}
              total={historyData.total}
              page={historyPage}
              pageSize={PAGE_SIZE}
              onPageChange={setHistoryPage}
            />
          )}
        </div>
      ) : null}

      {rankingsLoading ? (
        <RankingsSkeleton />
      ) : (
        <>
          <RankingTable
            rankings={rankingsData?.rankings ?? []}
            myId={myStats?.anonymous_id ?? null}
          />
          <Pagination
            page={page}
            total={rankingsData?.total ?? 0}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <LeaderboardRules />
    </div>
  );
}
