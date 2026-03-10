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
  Award,
  Activity,
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

export function winRatePct(wins: number, losses: number): string {
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
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className={`text-sm font-mono font-semibold ${valueClass}`}>
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
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
          : "text-zinc-500 hover:text-zinc-300 border border-transparent"
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
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-indigo-400" />
            <span className="text-xs font-medium text-zinc-400">{t("comp.systemPerf")}</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xs md:text-sm text-zinc-500">{t("comp.winRate")} <span className="font-mono font-medium text-white">{report.win_rate != null ? `${(report.win_rate * 100).toFixed(1)}%` : "—"}</span></span>
            <span className="text-xs md:text-sm text-zinc-500">{t("comp.profitFactor")} <span className="font-mono font-medium text-emerald-400">{formatPF(report.profit_factor)}</span></span>
            <span className="text-xs md:text-sm text-zinc-500 hidden sm:inline">{t("comp.settled")} <span className="font-mono font-medium text-white">{report.total_settled}</span></span>
          </div>
        </div>
        <ChevronDown
          size={14}
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
            className="border-t border-white/[0.04] px-5 py-4"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCell label={t("comp.totalSettled")} value={String(report.total_settled)} />
              <StatCell label={t("comp.totalWins")} value={String(report.total_wins ?? 0)} />
              <StatCell
                label={t("comp.winRate")}
                value={report.win_rate != null ? `${(report.win_rate * 100).toFixed(1)}%` : "—"}
                valueClass="text-emerald-400"
              />
              <StatCell
                label={t("comp.profitFactor")}
                value={formatPF(report.profit_factor)}
                valueClass="text-emerald-400"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20">
        <Award size={14} className="text-amber-400" />
      </span>
    );
  }
  if (rank <= 3) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-zinc-500/10 border border-zinc-500/20 text-xs font-bold text-zinc-300">
        {rank}
      </span>
    );
  }
  return <span className="text-xs font-mono text-zinc-500 pl-2">{rank}</span>;
}

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
      <div className="card p-10 text-center">
        <Trophy size={24} className="text-zinc-500 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">{t("comp.noRankData")}</p>
        <p className="text-xs text-zinc-500 mt-1">
          {t("comp.noRankDataDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[400px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-xs md:text-sm text-zinc-500 uppercase tracking-wider">
            <th className="px-4 py-3 text-left font-medium">{t("comp.rank")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("comp.trader")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("comp.winLoss")}</th>
            <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">
              {t("comp.avgPnl")}
            </th>
            <th className="px-4 py-3 text-right font-medium">{t("comp.profitFactor")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rankings.map((entry) => {
            const isMe = myId === entry.anonymous_id;
            return (
              <tr
                key={entry.rank}
                className={`transition-colors ${
                  isMe ? "bg-indigo-500/[0.06]" : "hover:bg-white/[0.02]"
                }`}
              >
                <td className="px-4 py-3">
                  <RankBadge rank={entry.rank} />
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300">
                  {entry.anonymous_id}
                  {isMe && (
                    <span className="ml-2 text-xs text-indigo-400 font-medium">
                      {t("comp.me")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs md:text-sm font-mono text-zinc-300">
                  {entry.wins}/{entry.losses}
                  <span className="ml-1 text-zinc-500">({winRatePct(entry.wins, entry.losses)})</span>
                </td>
                <td className="px-4 py-3 text-right text-xs md:text-sm font-mono hidden sm:table-cell">
                  <span
                    className={
                      entry.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {formatPnl(entry.avg_pnl)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono text-sm font-semibold text-emerald-400">
                    {formatPF(entry.profit_factor)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="p-1.5 rounded-md border border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-xs text-zinc-500">
        {t("comp.pageInfo", { page, totalPages })}
        <span className="hidden sm:inline text-zinc-500 ml-2">
          {t("comp.totalInfo", { total, label })}
        </span>
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="p-1.5 rounded-md border border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export function RankingsSkeleton() {
  const t = useTranslations("leaderboard");
  return (
    <div className="card p-10 text-center">
      <BarChart3 size={20} className="text-zinc-500 mx-auto mb-2 animate-pulse" />
      <p className="text-xs text-zinc-500">{t("comp.loading")}</p>
    </div>
  );
}

