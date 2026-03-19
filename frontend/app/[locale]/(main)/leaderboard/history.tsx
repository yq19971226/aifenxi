"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ChevronDown, Info, User, ChevronUp, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { StrategyHistoryItem, MyStats } from "@/lib/api/leaderboard";
import { formatPnl, formatPF, winRatePct, StatCell, Pagination } from "./components";

export function StickyStatsBar({
  stats,
  rank,
  historyData,
  historyPage,
  pageSize,
  onHistoryPageChange,
  showHistory,
  setShowHistory,
}: {
  stats: MyStats;
  rank: number | null;
  historyData: any;
  historyPage: number;
  pageSize: number;
  onHistoryPageChange: (p: number) => void;
  showHistory: boolean;
  setShowHistory: (s: boolean) => void;
}) {
  const t = useTranslations("leaderboard");
  
  const isHighWR = stats.wins / Math.max(stats.wins + stats.losses, 1) >= 0.8;
  const pfValue = stats.profit_factor || 0;
  const isHighPF = pfValue >= 2.0 && pfValue < 99;

  return (
    <div className="sticky bottom-0 left-0 right-0 z-40 w-full mb-0 safe-pb">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl border-t border-indigo-500/30 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]" />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto px-4 md:px-8">
        
        {/* Toggle Button Container - perfectly centered on the top edge */}
        {stats.total_published > 0 && (
          <div className="absolute -top-[14px] left-1/2 -translate-x-1/2 z-50">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 bg-black border border-indigo-500/30 px-6 py-1.5 shadow-[0_0_15px_rgba(99,102,241,0.2)] hover:border-indigo-400 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all group"
            >
              <History size={12} className="text-indigo-400 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-black font-mono text-zinc-300 uppercase tracking-[0.2em]">
                {showHistory ? t("history.collapse") : t("history.expand")}
              </span>
              {showHistory ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronUp size={12} className="text-zinc-500" />}
            </button>
          </div>
        )}

        {/* History Expandable Area */}
        <AnimatePresence>
          {showHistory && historyData && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-8 pb-4 border-b border-white/[0.05] max-h-[50vh] overflow-y-auto custom-scrollbar">
                <StrategyHistory
                  items={historyData.items}
                  total={historyData.total}
                  page={historyPage}
                  pageSize={pageSize}
                  onPageChange={onHistoryPageChange}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HUD Main Bar */}
        <div className="flex flex-col lg:flex-row items-center justify-between py-4 gap-4 lg:gap-8">
          
          <div className="flex items-center gap-4 w-full lg:w-auto mt-2 lg:mt-0">
            <div className="flex items-center justify-center w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)] shrink-0">
              <User size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono mb-1">{t("stats.myRecord")}</p>
              <p className="text-xs font-bold text-white tracking-widest font-mono">{stats.anonymous_id}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-6 gap-y-4 w-full lg:w-auto flex-1 lg:flex-none">
            <StatCell
              label={t("stats.rank")}
              value={rank ? `#${rank}` : t("stats.notRanked")}
              valueClass={rank ? "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "text-zinc-500"}
            />
            <StatCell
              label={t("stats.published")}
              value={String(stats.total_published)}
              valueClass="text-zinc-300"
            />
            <StatCell
              label={t("stats.pending")}
              value={String(stats.pending)}
              valueClass={stats.pending > 0 ? "text-amber-400" : "text-zinc-500"}
            />
            <StatCell 
              label={t("stats.winLoss")} 
              value={`${stats.wins} / ${stats.losses} (${winRatePct(stats.wins, stats.losses)})`} 
              valueClass={isHighWR ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "text-white"}
            />
            <StatCell
              label={t("stats.avgPnl")}
              value={formatPnl(stats.avg_pnl)}
              valueClass={stats.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <StatCell
              label={t("stats.profitFactor")}
              value={formatPF(stats.profit_factor)}
              valueClass={isHighPF ? "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "text-emerald-400"}
            />
          </div>

        </div>
        
        {/* Helper Hint */}
        {!rank && stats.settled < 5 && (
          <div className="absolute right-4 top-1 lg:static lg:w-full text-right pb-2 pointer-events-none">
             <p className="text-[8px] font-mono text-indigo-400/60 uppercase tracking-widest animate-pulse">
               {t("stats.minSettledHint", { min: 3, count: stats.settled })}
             </p>
          </div>
        )}

      </div>
    </div>
  );
}

const STATUS_CLS: Record<string, string> = {
  pending: "text-amber-400 border-amber-500/20 bg-amber-500/5",
  win: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
  loss: "text-red-400 border-red-500/20 bg-red-500/5",
  expired: "text-zinc-500 border-white/10 bg-white/5",
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
    d === "long" ? "text-emerald-400 shadow-[0_0_5px_rgba(16,185,129,0.2)]" : d === "short" ? "text-red-400 shadow-[0_0_5px_rgba(248,113,113,0.2)]" : "text-zinc-500";

  if (items.length === 0) {
    return (
      <div className="border border-white/[0.05] bg-white/[0.02] p-10 text-center">
        <p className="text-[10px] font-black font-mono text-zinc-600 uppercase tracking-widest">{t("strategyHistory.noRecords")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-white/[0.1] bg-white/[0.01]">
              <th className="px-5 py-3 text-left text-[9px] font-black font-mono uppercase text-zinc-500 tracking-[0.2em]">{t("strategyHistory.symbol")}</th>
              <th className="px-5 py-3 text-left text-[9px] font-black font-mono uppercase text-zinc-500 tracking-[0.2em]">{t("strategyHistory.direction")}</th>
              <th className="px-5 py-3 text-right text-[9px] font-black font-mono uppercase text-zinc-500 tracking-[0.2em]">{t("strategyHistory.entryPrice")}</th>
              <th className="px-5 py-3 text-right text-[9px] font-black font-mono uppercase text-zinc-500 tracking-[0.2em] hidden sm:table-cell">{t("strategyHistory.stopLoss")}</th>
              <th className="px-5 py-3 text-center text-[9px] font-black font-mono uppercase text-zinc-500 tracking-[0.2em]">{t("strategyHistory.status")}</th>
              <th className="px-5 py-3 text-right text-[9px] font-black font-mono uppercase text-zinc-500 tracking-[0.2em]">{t("strategyHistory.pnl")}</th>
              <th className="px-5 py-3 text-right text-[9px] font-black font-mono uppercase text-zinc-500 tracking-[0.2em] hidden sm:table-cell">{t("strategyHistory.mode")}</th>
              <th className="px-5 py-3 text-right text-[9px] font-black font-mono uppercase text-zinc-500 tracking-[0.2em] hidden md:table-cell">{t("strategyHistory.time")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {items.map((item) => {
              const statusText = t(`statusLabels.${item.status}` as Parameters<typeof t>[0]);
              const statusCls = STATUS_CLS[item.status] ?? "text-zinc-500 border-white/10";
              return (
                <tr key={item.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-5 py-4 text-[11px] font-black font-mono text-white tracking-widest">
                    {(item.symbol ?? "").replace("USDT", "")}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-[9px] font-black font-mono uppercase tracking-widest ${directionCls(item.direction)}`}>
                      {directionLabel(item.direction)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-xs md:text-sm font-mono text-zinc-300">
                    {item.entry_price != null ? `$${item.entry_price.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-5 py-4 text-right text-xs md:text-sm font-mono text-zinc-500 hidden sm:table-cell">
                    {item.stop_loss != null ? `$${item.stop_loss.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-block px-3 py-1 text-[9px] font-black font-mono uppercase tracking-[0.2em] border ${statusCls}`}>
                      {statusText}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-black font-mono tracking-tight">
                    {item.pnl_pct != null ? (
                      <span className={item.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {formatPnl(item.pnl_pct)}
                      </span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 hidden sm:table-cell">
                    {item.analysis_mode ? t(`modeLabels.${item.analysis_mode}` as Parameters<typeof t>[0]) : "—"}
                  </td>
                  <td className="px-5 py-4 text-right text-[10px] uppercase font-mono tracking-wider text-zinc-500 hidden md:table-cell">
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
    <div className="relative border border-white/[0.05] bg-black/60 shadow-xl overflow-hidden group mb-32">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-6 w-6 items-center justify-center bg-zinc-800/50 border border-white/10 text-zinc-400 group-hover:text-zinc-300 transition-colors">
            <Info size={12} />
          </span>
          <span className="text-[11px] font-black font-mono text-zinc-400 uppercase tracking-[0.2em] group-hover:text-zinc-300">{t("rules.title")}</span>
        </div>
        <ChevronDown
          size={14}
          className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.04] bg-white/[0.01] px-6 py-6 space-y-3"
          >
            <Rule text={t("rules.rule1")} />
            <Rule text={t("rules.rule2")} />
            <Rule text={t("rules.rule3")} />
            <Rule text={t("rules.rule4")} />
            <Rule text={t("rules.rule5")} />
            <Rule text={t("rules.rule6")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-1 h-1 bg-indigo-500/50 rounded-full mt-2 shrink-0 shadow-[0_0_5px_rgba(99,102,241,0.5)]" />
      <p className="text-xs md:text-sm text-zinc-400 font-sans leading-relaxed">
        {text}
      </p>
    </div>
  );
}
