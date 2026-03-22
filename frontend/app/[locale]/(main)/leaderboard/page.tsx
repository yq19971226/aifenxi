"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Trophy, BarChart2, AlertCircle, TrendingUp, Clock, Target } from "lucide-react";
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
  RankingsSkeleton,
  Pagination,
} from "./components";
import { StickyStatsBar, LeaderboardRules } from "./history";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";

const PAGE_SIZE = 20;

const PERIOD_KEYS = ["7d", "30d", "90d"] as const;
const MODE_KEYS = ["all", "intraday", "trend"] as const;
type LeaderboardPeriod = (typeof PERIOD_KEYS)[number];
type LeaderboardMode = (typeof MODE_KEYS)[number];

const MODE_ICON: Record<string, React.ReactNode> = {
  intraday: <Clock size={20} className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]" />,
  trend: <TrendingUp size={20} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" />,
};
const MODE_COLOR: Record<string, string> = {
  intraday: "text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.4)]",
  trend: "text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.4)]",
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
    <div className="relative border border-white/[0.05] bg-black/40 overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 w-32 h-[1px] bg-gradient-to-r from-transparent to-indigo-500/50" />
      <div className="absolute bottom-0 left-0 w-32 h-[1px] bg-gradient-to-l from-transparent to-indigo-500/50" />
      
      <div className="px-6 py-5 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.01]">
        <div className="flex items-center gap-4">
          <span className="flex h-8 w-8 items-center justify-center bg-indigo-500/10 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
            <Target size={16} className="text-indigo-400" />
          </span>
          <span className="text-[11px] font-black text-white uppercase tracking-[0.2em] font-mono">{t("accuracy.title")}</span>
        </div>
        <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest bg-white/[0.03] px-3 py-1 border border-white/5">
          {t(`periods.${period}`)}
        </span>
      </div>
      
      <div className="p-6 md:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {modes.map((m) => (
            <div
              key={m.mode}
              className="relative rounded-sm border border-white/[0.05] bg-white/[0.01] p-6 flex flex-col items-center text-center group hover:bg-white/[0.02] hover:border-white/10 transition-colors"
            >
              <div className="absolute inset-x-0 -top-[1px] h-[1px] w-1/2 mx-auto bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="mb-4">{MODE_ICON[m.mode] || <Target size={20} className="text-zinc-500" />}</div>
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest font-mono mb-2">{t(`modes.${m.mode}`)}</span>
              <span className={`text-3xl font-black tracking-tight font-mono ${MODE_COLOR[m.mode] || "text-white"}`}>
                {(m.win_rate * 100).toFixed(1)}%
              </span>
              <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-[0.2em] font-mono mt-2">{t("accuracy.winRate")}</span>
              
              <div className="w-full h-px bg-white/[0.05] my-4" />
              
              <div className="flex items-center justify-between w-full text-[10px] font-mono font-bold uppercase tracking-widest">
                <span className="text-zinc-400">{m.wins}/{m.losses}</span>
                <span className={m.avg_pnl >= 0 ? "text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.3)]" : "text-red-400"}>
                  {m.avg_pnl >= 0 ? "+" : ""}{m.avg_pnl.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex items-center justify-center gap-6 text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500 pt-6 border-t border-white/[0.05]">
          <span className="flex items-center gap-2">
            {t("accuracy.overall")}: <span className="font-black text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)] bg-indigo-500/10 px-2 py-0.5 border border-indigo-500/20">{(overallWr * 100).toFixed(1)}%</span>
          </span>
          <span className="text-zinc-500">|</span>
          <span className="flex items-center gap-2">
            {t("comp.settled")}: <span className="font-black text-white">{totalSettled}</span>
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

  const { data: myStats, error: myStatsError } = useQuery({
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

  if (getState("leaderboard") !== "active") return <MaintenancePlaceholder featureName={t('title')} />;

  return (
    <div className="space-y-8 pb-32">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 px-2">
        <div>
          <h1 className="flex items-center gap-4 text-2xl font-black text-white font-mono tracking-widest uppercase mb-3">
            <span className="flex items-center justify-center w-10 h-10 bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <Trophy size={20} className="drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            </span>
            {t('header.title')}
          </h1>
          <p className="text-[11px] font-sans text-zinc-400 max-w-xl leading-relaxed">
            {t('header.subtitle')}
          </p>
        </div>
        <Link
          href={`/${locale}/performance`}
          className="flex items-center gap-2 group bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.2] hover:bg-white/[0.05] transition-all px-4 py-2 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400 hover:text-white shrink-0"
        >
          <BarChart2 size={14} className="group-hover:text-indigo-400 transition-colors" />
          <span>{t('header.performance')}</span>
        </Link>
      </div>

      {/* Filters HUD */}
      <div className="flex items-center gap-6 flex-wrap px-2 border-b border-white/[0.05] pb-2">
        <div className="flex items-center gap-3">
          {periods.map((p) => (
            <TabButton key={p.value} active={period === p.value} label={p.label} onClick={() => handlePeriod(p.value)} />
          ))}
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-3">
          {modes.map((m) => (
            <TabButton key={m.value} active={mode === m.value} label={m.label} onClick={() => handleMode(m.value)} />
          ))}
        </div>
      </div>

      {apiError && (
        <div className="flex items-center gap-3 rounded-none bg-red-500/[0.06] border border-red-500/30 px-5 py-4 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-[11px] font-black font-mono tracking-widest uppercase text-red-300">
            {apiError instanceof Error ? apiError.message : t('error.loadFailed')}
          </p>
        </div>
      )}

      {/* ── System Accuracy Hero ── */}
      {accuracy && accuracy.modes.length > 0 && (
        <SystemAccuracyHero modes={accuracy.modes} period={period} />
      )}

      {/* ── System Report Bar ── */}
      {reportLoading ? (
        <div className="border border-white/[0.05] bg-black/40 px-6 py-4 animate-pulse mt-6 mb-8">
          <div className="flex items-center gap-6">
            <div className="h-4 w-24 bg-white/[0.05]" />
            <div className="h-4 w-32 bg-white/[0.05]" />
          </div>
        </div>
      ) : report ? (
        <SystemReportBar report={report} />
      ) : null}

      {/* ── Ranking Table (Podium + List) ── */}
      {rankingsLoading ? (
        <RankingsSkeleton />
      ) : (
        <RankingTable
          rankings={rankingsData?.rankings ?? []}
          myId={myStats?.anonymous_id ?? null}
        />
      )}

      {/* ── Additional Data (Pagination / Rules) ── */}
      {rankingsData && rankingsData.total > PAGE_SIZE && (
        <Pagination
          page={page}
          total={rankingsData.total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      <div className="pt-16 pb-32 max-w-5xl mx-auto">
        <LeaderboardRules />
      </div>

      {/* ── Sticky Personal HUD ── */}
      {myStats && (
        <StickyStatsBar 
          stats={myStats} 
          rank={rankingsData?.my_rank ?? null} 
          historyData={historyData}
          historyPage={historyPage}
          pageSize={PAGE_SIZE}
          onHistoryPageChange={setHistoryPage}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
        />
      )}
    </div>
  );
}
