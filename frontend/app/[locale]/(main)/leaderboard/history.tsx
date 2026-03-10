"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ChevronDown, Info, User } from "lucide-react";
import type { StrategyHistoryItem, MyStats } from "@/lib/api/leaderboard";
import { formatPnl, formatPF, winRatePct, StatCell, Pagination } from "./components";

export function MyStatsCard({
  stats,
  rank,
}: {
  stats: MyStats;
  rank: number | null;
}) {
  const t = useTranslations("leaderboard");
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <User size={14} className="text-indigo-400" />
        <span className="text-xs font-medium text-zinc-400">{t("stats.myRecord")}</span>
        <span className="text-xs font-mono text-zinc-500 ml-auto">
          {stats.anonymous_id}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <StatCell
          label={t("stats.rank")}
          value={rank ? `#${rank}` : t("stats.notRanked")}
          valueClass={rank ? "text-amber-400" : "text-zinc-500"}
        />
        <StatCell
          label={t("stats.published")}
          value={String(stats.total_published)}
        />
        <StatCell
          label={t("stats.pending")}
          value={String(stats.pending)}
          valueClass={stats.pending > 0 ? "text-amber-400" : "text-zinc-500"}
        />
        <StatCell label={t("stats.winLoss")} value={`${stats.wins} / ${stats.losses} (${winRatePct(stats.wins, stats.losses)})`} />
        <StatCell
          label={t("stats.avgPnl")}
          value={formatPnl(stats.avg_pnl)}
          valueClass={stats.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatCell
          label={t("stats.profitFactor")}
          value={formatPF(stats.profit_factor)}
          valueClass="text-emerald-400"
        />
      </div>
      {stats.settled < 3 && (
        <p className="text-xs text-zinc-500 mt-3">
          {t("stats.minSettledHint", { count: stats.settled })}
        </p>
      )}
    </div>
  );
}

const STATUS_CLS: Record<string, string> = {
  pending: "text-amber-400",
  win: "text-emerald-400",
  loss: "text-red-400",
  expired: "text-zinc-500",
};

export function StrategyHistory({
  items,
  total,
  page,
  pageSize,
  onPageChange,
}: {
  items: StrategyHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const t = useTranslations("leaderboard");
  const locale = useLocale();

  const directionLabel = (d: string) =>
    d === "long" ? t("strategyHistory.long") : d === "short" ? t("strategyHistory.short") : t("strategyHistory.neutral");
  const directionCls = (d: string) =>
    d === "long" ? "text-emerald-400" : d === "short" ? "text-red-400" : "text-zinc-500";

  if (items.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-xs text-zinc-500">{t("strategyHistory.noRecords")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-xs md:text-sm text-zinc-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">{t("strategyHistory.symbol")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("strategyHistory.direction")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("strategyHistory.entryPrice")}</th>
              <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("strategyHistory.stopLoss")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("strategyHistory.status")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("strategyHistory.pnl")}</th>
              <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("strategyHistory.mode")}</th>
              <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("strategyHistory.time")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {items.map((item) => {
              const statusText = t(`statusLabels.${item.status}` as Parameters<typeof t>[0]);
              const statusCls = STATUS_CLS[item.status] ?? "text-zinc-400";
              return (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white">
                    {(item.symbol ?? "").replace("USDT", "")}
                  </td>
                  <td className="px-4 py-3 text-xs md:text-sm">
                    <span className={directionCls(item.direction)}>
                      {directionLabel(item.direction)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs md:text-sm font-mono text-zinc-300">
                    {item.entry_price != null ? `$${item.entry_price.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs md:text-sm font-mono text-zinc-500 hidden sm:table-cell">
                    {item.stop_loss != null ? `$${item.stop_loss.toLocaleString()}` : "—"}
                  </td>
                  <td className={`px-4 py-3 text-center text-xs md:text-sm font-medium ${statusCls}`}>
                    {statusText}
                  </td>
                  <td className="px-4 py-3 text-right text-xs md:text-sm font-mono">
                    {item.pnl_pct != null ? (
                      <span className={item.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {formatPnl(item.pnl_pct)}
                      </span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-zinc-500 hidden sm:table-cell">
                    {item.analysis_mode ? t(`modeLabels.${item.analysis_mode}` as Parameters<typeof t>[0]) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-zinc-500 hidden md:table-cell">
                    {new Date(item.created_at).toLocaleDateString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} pageSize={pageSize} onPageChange={onPageChange} totalLabel={t("strategyHistory.records")} />
    </div>
  );
}

export function LeaderboardRules() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("leaderboard");

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info size={14} className="text-zinc-500" />
          <span className="text-xs text-zinc-500">{t("rules.title")}</span>
        </div>
        <ChevronDown
          size={14}
          className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-5 py-4 space-y-2">
          <Rule text={t("rules.rule1")} />
          <Rule text={t("rules.rule2")} />
          <Rule text={t("rules.rule3")} />
          <Rule text={t("rules.rule4")} />
          <Rule text={t("rules.rule5")} />
          <Rule text={t("rules.rule6")} />
        </div>
      )}
    </div>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <p className="text-xs md:text-sm text-zinc-400 flex items-start gap-2">
      <span className="text-zinc-500 mt-0.5 shrink-0">•</span>
      {text}
    </p>
  );
}
