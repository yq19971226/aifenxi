"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Trophy,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Activity,
  Crown,
  Medal,
  Award
} from "lucide-react";
import type {
  RankingEntry,
  SystemReport,
} from "@/lib/api/leaderboard";

export function formatPF(pf: number | null | undefined): string {
  if (pf == null || Number.isNaN(pf)) return "—";
  if (pf >= 99.9) return ">99";
  return pf.toFixed(2);
}

export function formatPnl(pnl: number | null | undefined): string {
  if (pnl == null || Number.isNaN(pnl)) return "—";
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}${pnl.toFixed(2)}%`;
}

export function winRatePct(wins: number, losses: number, win_rate?: number): string {
  if (win_rate != null && !Number.isNaN(win_rate)) {
    return `${(win_rate * 100).toFixed(1)}%`;
  }
  const total = wins + losses;
  if (total === 0) return "—";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

export function StatCell({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 font-mono">
        {label}
      </p>
      <p className={`text-sm font-mono font-black tracking-tight ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

export function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
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

export function SystemReportBar({ report }: { report: SystemReport }) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("leaderboard");

  return (
    <div className="relative border border-white/[0.05] bg-black/60 shadow-2xl overflow-hidden mt-6 group">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-4 sm:gap-8 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
              <Activity size={14} />
            </span>
            <span className="text-[11px] font-black font-mono text-white tracking-[0.2em] uppercase">{t("comp.systemPerf")}</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-[10px] uppercase font-bold font-mono text-zinc-500 tracking-widest">{t("comp.winRate")} <span className="text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">{report.win_rate != null ? `${(report.win_rate * 100).toFixed(1)}%` : "—"}</span></span>
            <span className="text-[10px] uppercase font-bold font-mono text-zinc-500 tracking-widest hidden sm:inline">{t("comp.profitFactor")} <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">{formatPF(report.profit_factor)}</span></span>
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-zinc-500 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="report-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.04] bg-white/[0.01] px-6 py-5"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <StatCell label={t("comp.totalSettled")} value={String(report.total_settled)} />
              <StatCell label={t("comp.totalWins")} value={String(report.total_wins ?? 0)} />
              <StatCell
                label={t("comp.winRate")}
                value={report.win_rate != null ? `${(report.win_rate * 100).toFixed(1)}%` : "—"}
                valueClass="text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]"
              />
              <StatCell
                label={t("comp.profitFactor")}
                value={formatPF(report.profit_factor)}
                valueClass="text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const PodiumCard = ({ entry, rank, t, isMe }: { entry: RankingEntry, rank: number, t: any, isMe: boolean }) => {
  const isGold = rank === 1;
  const isSilver = rank === 2;
  const isBronze = rank === 3;
  
  // High performance glowing effect
  const isHighWR = entry.win_rate && entry.win_rate >= 0.8;
  const pfValue = entry.profit_factor || 0;
  const isHighPF = pfValue >= 2.0 && pfValue < 99;
  
  const borderColors = isGold ? "border-amber-500/50 hover:border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.15)]" : 
                       isSilver ? "border-zinc-300/40 hover:border-zinc-300/80 shadow-[0_0_20px_rgba(212,212,216,0.1)]" : 
                       "border-orange-700/50 hover:border-orange-500/80 shadow-[0_0_20px_rgba(194,65,12,0.1)]";
  
  const iconColors = isGold ? "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" : 
                     isSilver ? "text-zinc-300 drop-shadow-[0_0_8px_rgba(212,212,216,0.8)]" : 
                     "text-orange-500 drop-shadow-[0_0_8px_rgba(194,65,12,0.8)]";

  const heightClass = isGold ? "md:-mt-6 z-10" : "mt-0 z-0 opacity-90 hover:opacity-100";
  
  return (
    <div className={`relative bg-black/80 backdrop-blur-md border ${borderColors} p-6 flex flex-col items-center text-center transition-all duration-300 group overflow-hidden ${heightClass} ${isMe ? 'ring-2 ring-indigo-500/50' : ''}`}>
      {/* Glow background */}
      {isGold && <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />}
      {isSilver && <div className="absolute inset-0 bg-gradient-to-b from-zinc-400/10 to-transparent pointer-events-none" />}
      {isBronze && <div className="absolute inset-0 bg-gradient-to-b from-orange-600/10 to-transparent pointer-events-none" />}
      
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20" />

      {/* Podium Icon */}
      <div className="mb-4 relative">
        {isGold && <Crown size={36} className={iconColors} />}
        {isSilver && <Medal size={28} className={iconColors} />}
        {isBronze && <Award size={28} className={iconColors} />}
        <div className={`absolute -bottom-2 -right-2 flex h-4 w-4 items-center justify-center rounded-sm text-[8px] font-black font-mono bg-black border ${borderColors} ${iconColors}`}>
          {rank}
        </div>
      </div>

      <div className="min-w-0 w-full mb-6">
        <p className="text-xs font-bold text-white font-mono truncate tracking-widest">{entry.anonymous_id}</p>
        {isMe && <span className="inline-block mt-1 text-[8px] font-black font-mono text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 border border-indigo-500/30">YOU</span>}
      </div>

      <div className="w-full space-y-4 relative z-10">
        <div className="flex justify-between items-end border-b border-white/10 pb-2">
          <span className="text-[9px] uppercase font-mono text-zinc-500 tracking-[0.2em]">{t("comp.winRate")}</span>
          <span className={`text-sm font-black font-mono tracking-tight ${isHighWR ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'text-white'}`}>
            {winRatePct(entry.wins, entry.losses, entry.win_rate)}
          </span>
        </div>
        <div className="flex justify-between items-end border-b border-white/10 pb-2">
          <span className="text-[9px] uppercase font-mono text-zinc-500 tracking-[0.2em]">W/L</span>
          <span className="text-xs font-mono text-zinc-300">{entry.wins} / {entry.losses}</span>
        </div>
        <div className="flex justify-between items-end border-b border-white/10 pb-2">
          <span className="text-[9px] uppercase font-mono text-zinc-500 tracking-[0.2em]">{t("comp.avgPnl")}</span>
          <span className={`text-xs font-black font-mono tracking-wider ${entry.avg_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPnl(entry.avg_pnl)}
          </span>
        </div>
        <div className="flex justify-between items-end">
          <span className="text-[9px] uppercase font-mono text-zinc-500 tracking-[0.2em]">PF</span>
          <span className={`text-sm font-black font-mono tracking-tight ${isHighPF ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'text-emerald-400'}`}>
            {formatPF(entry.profit_factor)}
          </span>
        </div>
      </div>
    </div>
  );
};

export function RankingTable({
  rankings,
  myId,
}: {
  rankings: RankingEntry[];
  myId: string | null;
}) {
  const t = useTranslations("leaderboard");

  if (rankings.length === 0) {
    return (
      <div className="border border-white/[0.05] bg-black/40 py-24 text-center relative overflow-hidden mt-8">
        <Trophy size={32} className="text-zinc-400 mx-auto mb-6" />
        <p className="text-[11px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em]">{t("comp.noRankData")}</p>
        <p className="text-[10px] font-mono text-zinc-400 mt-2 uppercase tracking-[0.1em]">{t("comp.noRankDataDesc")}</p>
      </div>
    );
  }

  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  return (
    <div className="space-y-12">
      {/* ── TOP 3 PODIUM ── */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 lg:gap-8 items-end max-w-5xl mx-auto pt-8">
          {top3[1] && <PodiumCard entry={top3[1]} rank={2} t={t} isMe={myId === top3[1].anonymous_id} />}
          {top3[0] && <PodiumCard entry={top3[0]} rank={1} t={t} isMe={myId === top3[0].anonymous_id} />}
          {top3[2] && <PodiumCard entry={top3[2]} rank={3} t={t} isMe={myId === top3[2].anonymous_id} />}
        </div>
      )}

      {/* ── THE REST LIST ── */}
      {rest.length > 0 && (
        <div className="bg-black/40 border border-white/[0.05] shadow-xl overflow-hidden">
          {/* Mobile Card View */}
          <div className="block sm:hidden divide-y divide-white/[0.05]">
            {rest.map((entry) => {
              const isMe = myId === entry.anonymous_id;
              const isHighWR = entry.win_rate && entry.win_rate >= 0.8;
              const pfValue = entry.profit_factor || 0;
              const isHighPF = pfValue >= 2.0 && pfValue < 99;

              return (
                <div key={entry.rank} className={`p-5 relative ${isMe ? "bg-indigo-500/[0.05]" : ""}`}>
                  {isMe && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-[10px] font-black font-mono text-zinc-500 w-6 text-center">{entry.rank}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white font-mono truncate tracking-wider">{entry.anonymous_id}</p>
                      {isMe && <span className="text-[8px] font-black font-mono text-indigo-400 uppercase tracking-widest leading-none mt-1 inline-block">{t("comp.me")}</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
                    <div>
                      <p className="text-[9px] uppercase font-mono text-zinc-500 tracking-widest mb-1">{t("comp.winRate")}</p>
                      <p className={`text-xs font-mono font-black ${isHighWR ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'text-zinc-300'}`}>{winRatePct(entry.wins, entry.losses, entry.win_rate)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] uppercase font-mono text-zinc-500 tracking-widest mb-1">{t("comp.avgPnl")}</p>
                      <p className={`text-xs font-mono font-black ${entry.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPnl(entry.avg_pnl)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase font-mono text-zinc-500 tracking-widest mb-1">PF</p>
                      <p className={`text-xs font-mono font-black ${isHighPF ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]' : 'text-emerald-400'}`}>{formatPF(entry.profit_factor)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                  <th className="px-6 py-4 text-left text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono w-16">{t("comp.rank")}</th>
                  <th className="px-6 py-4 text-left text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono">{t("comp.trader")}</th>
                  <th className="px-6 py-4 text-right text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono">{t("comp.winLoss")}</th>
                  <th className="px-6 py-4 text-right text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono">
                    {t("comp.avgPnl")}
                  </th>
                  <th className="px-6 py-4 text-right text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em] font-mono">PF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {rest.map((entry) => {
                  const isMe = myId === entry.anonymous_id;
                  const isHighWR = entry.win_rate && entry.win_rate >= 0.8;
                  const pfValue = entry.profit_factor || 0;
                  const isHighPF = pfValue >= 2.0 && pfValue < 99;

                  return (
                    <tr
                      key={entry.rank}
                      className={`transition-colors group ${
                        isMe ? "bg-indigo-500/[0.05]" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <td className="px-6 py-4 relative">
                        {isMe && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
                        <span className="text-[11px] font-mono font-black text-zinc-400">{entry.rank}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-white font-mono font-bold tracking-wider">{entry.anonymous_id}</span>
                        {isMe && (
                          <span className="ml-3 text-[9px] font-black font-mono text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 border border-indigo-500/30">
                            {t("comp.me")}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-xs font-mono font-black tracking-wider ${isHighWR ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'text-white'}`}>
                           {winRatePct(entry.wins, entry.losses, entry.win_rate)}
                        </span>
                        <span className="ml-2 text-[10px] font-mono text-zinc-400 tracking-widest">
                          ({entry.wins}/{entry.losses})
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`text-xs font-mono font-black tracking-wider ${
                            entry.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {formatPnl(entry.avg_pnl)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-mono font-black tracking-tight ${isHighPF ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'text-emerald-400'}`}>
                          {formatPF(entry.profit_factor)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  totalLabel,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  totalLabel?: string;
}) {
  const t = useTranslations("leaderboard");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const label = totalLabel ?? t("comp.onBoard");
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 mt-8">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="flex h-8 w-8 items-center justify-center border border-white/[0.1] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] disabled:opacity-20 disabled:cursor-not-allowed transition-all"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-[10px] uppercase font-bold font-mono text-zinc-500 tracking-widest">
        {page} <span className="text-zinc-500 mx-1">/</span> {totalPages}
        <span className="hidden sm:inline text-zinc-400 ml-3">
          ({total} {label})
        </span>
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="flex h-8 w-8 items-center justify-center border border-white/[0.1] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] disabled:opacity-20 disabled:cursor-not-allowed transition-all"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export function RankingsSkeleton() {
  const t = useTranslations("leaderboard");
  return (
    <div className="border border-white/[0.05] bg-black/40 py-24 text-center mt-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-16 h-[1px] bg-gradient-to-r from-transparent to-white/20" />
      <div className="absolute bottom-0 left-0 w-16 h-[1px] bg-gradient-to-l from-transparent to-white/20" />
      <BarChart3 size={24} className="text-zinc-500 mx-auto mb-6 animate-pulse" />
      <p className="text-[10px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em]">{t("comp.loading")}</p>
    </div>
  );
}
