"use client";

import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useNumberFormatter } from "@/lib/i18n/formatters";
import { useTranslations } from "next-intl";
import type { PerformanceStats } from "@/lib/api/performance";

// ── Props ────────────────────────────────────────────────────

export interface PerformanceSummaryProps {
  stats: PerformanceStats;
  membershipLevel: number; // 0=free, 1=pro, 2=flagship
}

// ── Sub-components ───────────────────────────────────────────

function LockedOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm border border-white/[0.06]">
      <div className="flex flex-col items-center gap-2">
        <Lock size={14} className="text-indigo-400" />
        <span className="text-sm font-medium tracking-wide text-indigo-400">{label}</span>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  colorClass?: string;
  locked?: boolean;
  lockedLabel?: string;
}

function StatCard({ label, value, colorClass = "text-white", locked = false, lockedLabel = "" }: StatCardProps) {
  return (
    <div className="relative rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 hover:bg-white/[0.04] transition-colors overflow-hidden">
      {locked && <LockedOverlay label={lockedLabel} />}
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">{label}</p>
      <p className={`text-xl font-bold tracking-tight ${colorClass}`}>{value}</p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" },
  }),
};

export function PerformanceSummary({ stats, membershipLevel }: PerformanceSummaryProps) {
  const isFree = membershipLevel === 0;
  const { formatPercent, formatNumber } = useNumberFormatter();
  const t = useTranslations("performance.summary");

  const cards: StatCardProps[] = [
    {
      label: t("winRate"),
      value: formatPercent(stats.win_rate * 100, 1),
      colorClass: stats.win_rate >= 0.5 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: t("totalStrategies"),
      value: formatNumber(stats.total_strategies, 0),
      colorClass: "text-zinc-100",
    },
    {
      label: t("settled"),
      value: formatNumber(stats.settled_count, 0),
      colorClass: "text-zinc-300",
      locked: isFree,
      lockedLabel: t("upgradeToUnlock"),
    },
    {
      label: t("profitLossRatio"),
      value: `${formatNumber(stats.profit_loss_ratio, 1)}:1`,
      colorClass: stats.profit_loss_ratio >= 1 ? "text-emerald-400" : "text-red-400",
      locked: isFree,
      lockedLabel: t("upgradeToUnlock"),
    },
    {
      label: t("sharpeRatio"),
      value: formatNumber(stats.sharpe_ratio, 2),
      colorClass: stats.sharpe_ratio >= 1.0 ? "text-emerald-400" : stats.sharpe_ratio >= 0 ? "text-amber-400" : "text-red-400",
      locked: isFree,
      lockedLabel: t("upgradeToUnlock"),
    },
    {
      label: t("avgProfit"),
      value: `+${formatPercent(stats.avg_profit_pct, 2)}`,
      colorClass: "text-emerald-400",
      locked: isFree,
      lockedLabel: t("upgradeToUnlock"),
    },
    {
      label: t("avgLoss"),
      value: formatPercent(stats.avg_loss_pct, 2),
      colorClass: "text-red-400",
      locked: isFree,
      lockedLabel: t("upgradeToUnlock"),
    },
  ];

  return (
    <div className="card p-6 md:p-8">
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-5 mb-6">
        <div className="w-2 h-6 rounded-full bg-indigo-500" />
        <h2 className="text-xl font-bold text-white tracking-tight">{t("title")}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            custom={i}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <StatCard {...card} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
