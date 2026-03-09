"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

const PERIODS = [
  { label: "7天", value: "7d" },
  { label: "30天", value: "30d" },
  { label: "90天", value: "90d" },
];

const MODES = [
  { label: "全部", value: "all" },
  { label: "日内", value: "intraday" },
  { label: "趋势", value: "trend" },
];

export default function LeaderboardPage() {
  const { getState } = useFeatureFlags();
  const [period, setPeriod] = useState("7d");
  const [mode, setMode] = useState("all");
  const [page, setPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

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

  function handlePeriod(v: string) {
    setPeriod(v);
    setPage(1);
    setHistoryPage(1);
  }

  function handleMode(v: string) {
    setMode(v);
    setPage(1);
    setHistoryPage(1);
  }

  if (getState("leaderboard") !== "active") {
    return <MaintenancePlaceholder featureName="排行榜" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy size={20} className="text-amber-400" />
          <div>
            <h1 className="text-lg font-semibold text-white">策略排行榜</h1>
            <p className="text-xs text-zinc-500">
              基于 Profit Factor 排名 · 数据自功能上线日起统计
            </p>
          </div>
        </div>
        <Link
          href="/performance"
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <BarChart2 size={14} />
          <span>详细绩效</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          {PERIODS.map((p) => (
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
          {MODES.map((m) => (
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
            {apiError instanceof Error ? apiError.message : "数据加载失败，请稍后重试"}
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
              <span>{showHistory ? "收起策略明细" : "查看策略明细"}</span>
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
