"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Trophy, BarChart2, History, AlertCircle } from "lucide-react";
import {
  fetchRankings,
  fetchSystemReport,
  fetchMyStats,
  fetchMyHistory,
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
const MODE_KEYS = ["all", "intraday", "trend"] as const;
type LeaderboardPeriod = (typeof PERIOD_KEYS)[number];
type LeaderboardMode = (typeof MODE_KEYS)[number];

export default function LeaderboardPage() {
  const t = useTranslations('leaderboard');
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
          href="/performance"
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
