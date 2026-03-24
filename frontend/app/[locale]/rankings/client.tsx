"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Trophy, Target, TrendingUp, Clock, AlertCircle, Zap } from "lucide-react";
import type {
  RankingsResponse,
  SystemReport,
  SystemAccuracyResponse,
  ModeAccuracy,
} from "@/lib/api/leaderboard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const PAGE_SIZE = 20;
const PERIOD_KEYS = ["7d", "30d", "90d"] as const;
const MODE_KEYS = ["all", "intraday", "trend"] as const;
type LeaderboardPeriod = (typeof PERIOD_KEYS)[number];
type LeaderboardMode = (typeof MODE_KEYS)[number];

/* ── Public API fetch (no auth) ── */
async function fetchPublicRankings(period: string, mode: string, page: number) {
  const params = new URLSearchParams({ period, mode, page: String(page), page_size: String(PAGE_SIZE) });
  const res = await fetch(`${API_BASE}/api/public/leaderboard/rankings?${params}`);
  if (!res.ok) throw new Error("Failed to load rankings");
  return res.json() as Promise<RankingsResponse>;
}

async function fetchPublicReport(period: string, mode: string) {
  const params = new URLSearchParams({ period, mode });
  const res = await fetch(`${API_BASE}/api/public/leaderboard/report?${params}`);
  if (!res.ok) throw new Error("Failed to load report");
  return res.json() as Promise<SystemReport>;
}

async function fetchPublicAccuracy(period: string) {
  const params = new URLSearchParams({ period });
  const res = await fetch(`${API_BASE}/api/public/leaderboard/system-accuracy?${params}`);
  if (!res.ok) throw new Error("Failed to load accuracy");
  return res.json() as Promise<SystemAccuracyResponse>;
}

/* ── Formatting helpers ── */
function formatPF(pf: number | null | undefined): string {
  if (pf == null || Number.isNaN(pf)) return "—";
  if (pf >= 99.9) return ">99";
  return pf.toFixed(2);
}
function formatPnl(pnl: number | null | undefined): string {
  if (pnl == null || Number.isNaN(pnl)) return "—";
  return `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%`;
}
function winRatePct(wins: number, losses: number, wr?: number): string {
  if (wr != null && !Number.isNaN(wr)) return `${(wr * 100).toFixed(1)}%`;
  const t = wins + losses;
  return t === 0 ? "—" : `${((wins / t) * 100).toFixed(1)}%`;
}

const MODE_ICON: Record<string, React.ReactNode> = {
  scalping: <Zap size={20} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />,
  intraday: <Clock size={20} className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]" />,
  trend: <TrendingUp size={20} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" />,
};
const MODE_COLOR: Record<string, string> = {
  scalping: "text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.4)]",
  intraday: "text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.4)]",
  trend: "text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.4)]",
};

/* ── Tab Button ── */
function TabBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all ${
        active
          ? "bg-indigo-500/10 text-indigo-400 border-b-2 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
          : "text-zinc-500 hover:text-white border-b-2 border-transparent hover:border-white/10"
      }`}
    >
      {label}
    </button>
  );
}

/* ── System Accuracy Panel ── */
function AccuracyPanel({ modes, period }: { modes: ModeAccuracy[]; period: string }) {
  const t = useTranslations("leaderboard");
  if (!modes || modes.length === 0) return null;
  const totalSettled = modes.reduce((s, m) => s + m.settled, 0);
  const totalWins = modes.reduce((s, m) => s + m.wins, 0);
  const overallWr = totalSettled > 0 ? totalWins / totalSettled : 0;

  return (
    <div className="relative border border-white/[0.05] bg-black/40 overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 w-32 h-[1px] bg-gradient-to-r from-transparent to-indigo-500/50" />
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
            <div key={m.mode} className="relative border border-white/[0.05] bg-white/[0.01] p-6 flex flex-col items-center text-center group hover:bg-white/[0.02] transition-colors">
              <div className="mb-4">{MODE_ICON[m.mode] || <Target size={20} className="text-zinc-500" />}</div>
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest font-mono mb-2">{t(`modes.${m.mode}`)}</span>
              <span className={`text-3xl font-black tracking-tight font-mono ${MODE_COLOR[m.mode] || "text-white"}`}>
                {(m.win_rate * 100).toFixed(1)}%
              </span>
              <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-[0.2em] font-mono mt-2">{t("accuracy.winRate")}</span>
              <div className="w-full h-px bg-white/[0.05] my-4" />
              <div className="flex items-center justify-between w-full text-[10px] font-mono font-bold uppercase tracking-widest">
                <span className="text-zinc-400">{m.wins}/{m.losses}</span>
                <span className={m.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {m.avg_pnl >= 0 ? "+" : ""}{m.avg_pnl.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-6 text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500 pt-6 border-t border-white/[0.05]">
          <span className="flex items-center gap-2">
            {t("accuracy.overall")}: <span className="font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 border border-indigo-500/20">{(overallWr * 100).toFixed(1)}%</span>
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

/* ── Ranking Table (public, no "me" highlight) ── */
function PublicRankingTable({ rankings }: { rankings: RankingsResponse["rankings"] }) {
  const t = useTranslations("leaderboard");
  if (rankings.length === 0) {
    return (
      <div className="border border-white/[0.05] bg-black/40 py-24 text-center mt-8">
        <Trophy size={32} className="text-zinc-400 mx-auto mb-6" />
        <p className="text-[11px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em]">{t("comp.noRankData")}</p>
      </div>
    );
  }
  return (
    <div className="bg-black/40 border border-white/[0.05] shadow-xl overflow-hidden mt-4">
      {/* Mobile */}
      <div className="block sm:hidden divide-y divide-white/[0.05]">
        {rankings.map((e) => (
          <div key={e.rank} className="p-5">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-[10px] font-black font-mono text-zinc-500 w-6 text-center">{e.rank}</span>
              <p className="text-xs font-bold text-white font-mono truncate tracking-wider flex-1">{e.anonymous_id}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
              <div>
                <p className="text-[9px] uppercase font-mono text-zinc-500 tracking-widest mb-1">{t("comp.winRate")}</p>
                <p className="text-xs font-mono font-black text-zinc-300">{winRatePct(e.wins, e.losses, e.win_rate)}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] uppercase font-mono text-zinc-500 tracking-widest mb-1">{t("comp.avgPnl")}</p>
                <p className={`text-xs font-mono font-black ${e.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPnl(e.avg_pnl)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase font-mono text-zinc-500 tracking-widest mb-1">PF</p>
                <p className="text-xs font-mono font-black text-emerald-400">{formatPF(e.profit_factor)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.05] bg-white/[0.01]">
              <th className="px-6 py-4 text-left text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono w-16">{t("comp.rank")}</th>
              <th className="px-6 py-4 text-left text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono">{t("comp.trader")}</th>
              <th className="px-6 py-4 text-right text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono">{t("comp.winLoss")}</th>
              <th className="px-6 py-4 text-right text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono">{t("comp.avgPnl")}</th>
              <th className="px-6 py-4 text-right text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono">PF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {rankings.map((e) => (
              <tr key={e.rank} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4"><span className="text-[11px] font-mono font-black text-zinc-400">{e.rank}</span></td>
                <td className="px-6 py-4"><span className="text-xs text-white font-mono font-bold tracking-wider">{e.anonymous_id}</span></td>
                <td className="px-6 py-4 text-right">
                  <span className="text-xs font-mono font-black text-white">{winRatePct(e.wins, e.losses, e.win_rate)}</span>
                  <span className="ml-2 text-[10px] font-mono text-zinc-400 tracking-widest">({e.wins}/{e.losses})</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={`text-xs font-mono font-black ${e.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPnl(e.avg_pnl)}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-mono font-black text-emerald-400">{formatPF(e.profit_factor)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Client Component ── */
export function LeaderboardClient({
  initialRankings,
  initialReport,
  initialAccuracy,
  locale,
}: {
  initialRankings: RankingsResponse | null;
  initialReport: SystemReport | null;
  initialAccuracy: SystemAccuracyResponse | null;
  locale: string;
}) {
  const t = useTranslations("leaderboard");
  const [period, setPeriod] = useState<LeaderboardPeriod>("7d");
  const [mode, setMode] = useState<LeaderboardMode>("all");
  const [page, setPage] = useState(1);
  const isDefault = period === "7d" && mode === "all" && page === 1;

  const { data: rankingsData, isLoading: rankingsLoading, error: rankingsError } = useQuery({
    queryKey: ["public-leaderboard-rankings", period, mode, page],
    queryFn: () => fetchPublicRankings(period, mode, page),
    initialData: isDefault ? initialRankings ?? undefined : undefined,
    retry: 2,
    staleTime: 60_000,
  });

  const { data: report } = useQuery({
    queryKey: ["public-leaderboard-report", period, mode],
    queryFn: () => fetchPublicReport(period, mode),
    initialData: isDefault ? initialReport ?? undefined : undefined,
    retry: 2,
    staleTime: 60_000,
  });

  const { data: accuracy } = useQuery({
    queryKey: ["public-leaderboard-accuracy", period],
    queryFn: () => fetchPublicAccuracy(period),
    initialData: period === "7d" ? initialAccuracy ?? undefined : undefined,
    retry: 2,
    staleTime: 60_000,
  });

  const periods = PERIOD_KEYS.map((k) => ({ value: k, label: t(`periods.${k}`) }));
  const modes = MODE_KEYS.map((k) => ({ value: k, label: t(`modes.${k}`) }));

  function handlePeriod(v: LeaderboardPeriod) { setPeriod(v); setPage(1); }
  function handleMode(v: LeaderboardMode) { setMode(v); setPage(1); }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 px-2">
        <span className="flex items-center justify-center w-10 h-10 bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
          <Trophy size={20} className="drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
        </span>
        <div>
          <h2 className="text-xl font-black text-white font-mono tracking-widest uppercase">{t("header.title")}</h2>
          <p className="text-[11px] font-sans text-zinc-400">{t("header.subtitle")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-6 flex-wrap px-2 border-b border-white/[0.05] pb-2">
        <div className="flex items-center gap-3">
          {periods.map((p) => (
            <TabBtn key={p.value} active={period === p.value} label={p.label} onClick={() => handlePeriod(p.value)} />
          ))}
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-3">
          {modes.map((m) => (
            <TabBtn key={m.value} active={mode === m.value} label={m.label} onClick={() => handleMode(m.value)} />
          ))}
        </div>
      </div>

      {rankingsError && (
        <div className="flex items-center gap-3 bg-red-500/[0.06] border border-red-500/30 px-5 py-4">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-[11px] font-black font-mono tracking-widest uppercase text-red-300">{t("error.loadFailed")}</p>
        </div>
      )}

      {/* Accuracy */}
      {accuracy && accuracy.modes.length > 0 && <AccuracyPanel modes={accuracy.modes} period={period} />}

      {/* Report */}
      {report && (
        <div className="border border-white/[0.05] bg-black/60 px-6 py-4 flex items-center gap-8 flex-wrap mt-6">
          <span className="text-[10px] uppercase font-bold font-mono text-zinc-500 tracking-widest">
            {t("comp.winRate")} <span className="text-white">{report.win_rate != null ? `${(report.win_rate * 100).toFixed(1)}%` : "—"}</span>
          </span>
          <span className="text-[10px] uppercase font-bold font-mono text-zinc-500 tracking-widest">
            {t("comp.profitFactor")} <span className="text-emerald-400">{formatPF(report.profit_factor)}</span>
          </span>
          <span className="text-[10px] uppercase font-bold font-mono text-zinc-500 tracking-widest">
            {t("comp.totalSettled")} <span className="text-white">{report.total_settled}</span>
          </span>
        </div>
      )}

      {/* Rankings */}
      {rankingsLoading ? (
        <div className="border border-white/[0.05] bg-black/40 py-24 text-center mt-8 animate-pulse">
          <p className="text-[10px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em]">{t("comp.loading")}</p>
        </div>
      ) : (
        <PublicRankingTable rankings={rankingsData?.rankings ?? []} />
      )}

      {/* Pagination */}
      {rankingsData && rankingsData.total > PAGE_SIZE && (() => {
        const totalPages = Math.ceil(rankingsData.total / PAGE_SIZE);
        return (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}
              className="flex h-8 w-8 items-center justify-center border border-white/[0.1] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] disabled:opacity-20 disabled:cursor-not-allowed transition-all">←</button>
            <span className="text-[10px] uppercase font-bold font-mono text-zinc-500 tracking-widest">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}
              className="flex h-8 w-8 items-center justify-center border border-white/[0.1] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] disabled:opacity-20 disabled:cursor-not-allowed transition-all">→</button>
          </div>
        );
      })()}

      {/* Login CTA */}
      <div className="text-center pt-4">
        <Link href={`/${locale}/login`}
          className="inline-flex items-center gap-2 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-indigo-400 hover:text-white border border-indigo-500/30 bg-indigo-500/10 px-6 py-3 transition-all hover:bg-indigo-500/20">
          {locale.startsWith("zh") ? "登录查看个人排名" : "Login to see your rank"}
        </Link>
      </div>
    </div>
  );
}
