"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Lock, ChevronRight } from "lucide-react";
import type { PerformanceStats } from "@/lib/api/performance";

// ── Props ────────────────────────────────────────────────────

export interface PerformanceSummaryProps {
  stats: PerformanceStats;
  membershipLevel: number; // 0=free, 1=pro, 2=flagship
}

// ── Helpers ──────────────────────────────────────────────────

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatRatio(value: number): string {
  return `${value.toFixed(1)}:1`;
}

// ── Sub-components ───────────────────────────────────────────

function LockedOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[16px] bg-black/60 backdrop-blur-sm border border-white/[0.05]">
      <div className="flex flex-col items-center gap-2">
        <Lock size={14} className="text-blue-400" />
        <span className="text-sm font-medium tracking-wide text-blue-400">{"\u5347\u7EA7\u89E3\u9501"}</span>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  colorClass?: string;
  locked?: boolean;
}

function StatCard({ label, value, colorClass = "text-white", locked = false }: StatCardProps) {
  const isBull = colorClass.includes('bull');
  const isBear = colorClass.includes('bear');
  const glowHex = isBull ? 'rgba(0,255,163,0.3)' : (isBear ? 'rgba(255,51,102,0.3)' : 'transparent');

  return (
    <div className="relative rounded-[16px] bg-white/[0.02] border border-white/[0.04] p-4 group hover:bg-white/[0.04] transition-colors overflow-hidden">
      {locked && <LockedOverlay />}
      <p className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-2">{label}</p>
      <p
        className={`stat-value text-xl font-bold tracking-tight ${colorClass}`}
        style={glowHex !== 'transparent' ? { textShadow: `0 0 15px ${glowHex}` } : {}}
      >
        {value}
      </p>
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

  const cards: StatCardProps[] = [
    {
      label: "\u80DC\u7387",
      value: formatPct(stats.win_rate),
      colorClass: stats.win_rate >= 0.5 ? "text-bull" : "text-bear",
    },
    {
      label: "\u603B\u7B56\u7565\u6570",
      value: String(stats.total_strategies),
      colorClass: "text-zinc-100",
    },
    {
      label: "\u5DF2\u7ED3\u7B97",
      value: String(stats.settled_count),
      colorClass: "text-zinc-300",
      locked: isFree,
    },
    {
      label: "\u76C8\u4E8F\u6BD4",
      value: formatRatio(stats.profit_loss_ratio),
      colorClass: stats.profit_loss_ratio >= 1 ? "text-bull" : "text-bear",
      locked: isFree,
    },
    {
      label: "\u5E73\u5747\u76C8\u5229",
      value: `+${stats.avg_profit_pct.toFixed(2)}%`,
      colorClass: "text-bull",
      locked: isFree,
    },
    {
      label: "\u5E73\u5747\u4E8F\u635F",
      value: `${stats.avg_loss_pct.toFixed(2)}%`,
      colorClass: "text-bear",
      locked: isFree,
    },
  ];

  return (
    <div className="card p-6 md:p-8 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-1/4 w-64 h-64 rounded-full bg-blue-500/5 blur-[80px] pointer-events-none" />

      <div className="flex items-center justify-between border-b border-white/[0.05] pb-5 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]"></div>
          <h2 className="text-xl font-bold text-white tracking-tight">{"\u7B56\u7565\u7EE9\u6548"}</h2>
        </div>
        <Link
          href="/performance"
          className="flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
        >
          {"\u67E5\u770B\u8BE6\u60C5"}
          <ChevronRight size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 relative z-10">
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

      {/* Agent accuracy */}
      {Object.keys(stats.by_agent).length > 0 && (
        <div className="mt-8 relative z-10">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">{"\u6A21\u578B\u9884\u6D4B\u51C6\u786E\u7387"}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(stats.by_agent)
              .sort(([, a], [, b]) => b - a)
              .map(([agent, accuracy]) => {
                const isHighAcc = accuracy >= 0.5;
                const accColor = isHighAcc ? "var(--color-bull)" : "var(--color-bear)";
                const accGlow = isHighAcc ? "rgba(0,255,163,0.4)" : "rgba(255,51,102,0.4)";

                return (
                  <div
                    key={agent}
                    className="rounded-[16px] bg-white/[0.02] border border-white/[0.04] p-4 flex flex-col justify-center"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm font-medium text-zinc-300 truncate pr-2">{agent}</p>
                      <span
                        className="stat-value text-sm font-bold"
                        style={{ color: accColor, textShadow: `0 0 10px ${accGlow}` }}
                      >
                        {(accuracy * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${Math.min(accuracy * 100, 100)}%`,
                          backgroundColor: accColor,
                          boxShadow: `0 0 8px ${accColor}`
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
