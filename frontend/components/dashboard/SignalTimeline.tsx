"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ChevronRight,
  Crosshair,
  BarChart3,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { SignalEvent } from "@/lib/api/dashboard";

const SIGNAL_CONFIG: Record<string, { icon: typeof Zap; color: string; bg: string }> = {
  direction_change: { icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10" },
  confidence_drop: { icon: TrendingDown, color: "text-amber-400", bg: "bg-amber-500/10" },
  confidence_rise: { icon: BarChart3, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  opportunity: { icon: Crosshair, color: "text-accent", bg: "bg-accent/10" },
  risk_alert: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
};

const DEFAULT_VISIBLE = 5;

export function SignalTimeline({ signals }: { signals: SignalEvent[] }) {
  const t = useTranslations("analysis.timeline");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? signals : signals.slice(0, DEFAULT_VISIBLE);

  const formatRelativeTime = (isoStr: string): string => {
    const now = Date.now();
    const then = new Date(isoStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.round(diffMs / 60_000);

    if (diffMin < 1) return t("justNow");
    if (diffMin < 60) return t("minutesAgo", { min: diffMin });
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return t("hoursAgo", { h: diffHr });
    return t("daysAgo", { d: Math.round(diffHr / 24) });
  };

  if (signals.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-accent" />
          <h3 className="text-sm font-semibold text-white">{t("title")}</h3>
          <span className="text-xs text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded-full">0</span>
        </div>
        <p className="text-xs text-zinc-500">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          <h3 className="text-sm font-semibold text-white">{t("title")}</h3>
          <span className="text-xs text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded-full font-mono">
            {signals.length}
          </span>
        </div>
        {signals.length > DEFAULT_VISIBLE && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showAll ? t("collapse") : t("showAll", { count: signals.length })} ›
          </button>
        )}
      </div>

      <div className="space-y-1">
        {visible.map((sig, idx) => {
          const cfg = SIGNAL_CONFIG[sig.type] || SIGNAL_CONFIG.direction_change;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={`${sig.symbol}-${sig.type}-${sig.timestamp}-${idx}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.03 }}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${cfg.bg}`}>
                  <Icon size={12} className={cfg.color} />
                </div>
                <span className="text-sm text-zinc-300 truncate">{sig.message}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="text-xs text-zinc-500 font-mono">
                  {formatRelativeTime(sig.timestamp)}
                </span>
                <ChevronRight size={12} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function SignalTimelineSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-4 skeleton rounded" />
        <div className="h-4 w-16 skeleton rounded" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 px-3">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 skeleton rounded-md" />
              <div className="h-4 w-40 skeleton rounded" />
            </div>
            <div className="h-3 w-14 skeleton rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
