"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, TrendingUp, TrendingDown, Minus, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/api/auth";
import { useTranslations } from "next-intl";

interface SignalStabilityData {
  recent_signals: Array<{
    signal: string;
    confidence: number;
    regime: string | null;
    time: string;
  }>;
  consistency: number;
  current_streak: number;
  dominant_signal: string;
  duration_minutes: number;
  total_count: number;
  stability_grade: string;
}

const SIGNAL_COLORS: Record<string, string> = {
  bullish: "bg-emerald-500",
  bearish: "bg-red-500",
  neutral: "bg-zinc-500",
};

const SIGNAL_ICONS: Record<string, React.ElementType> = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
};

const GRADE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  low: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  no_data: { bg: "bg-zinc-500/10", text: "text-zinc-500", border: "border-zinc-500/20" },
};

export function SignalStabilityBar({
  symbol,
  mode,
}: {
  symbol: string;
  mode: string;
}) {
  const t = useTranslations("analysis.stability");
  const [data, setData] = useState<SignalStabilityData | null>(null);

  useEffect(() => {
    if (!symbol || !mode) return;

    const fetchStability = async () => {
      await new Promise(r => setTimeout(r, 800));
      try {
        const res = await authFetch(`/api/analysis/signal-stability/${symbol}/${mode}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // silent
      }
    };

    fetchStability();
  }, [symbol, mode]);

  if (!data || data.total_count < 2) return null;

  const grade = GRADE_STYLES[data.stability_grade] || GRADE_STYLES["no_data"];
  const gradeLabel = t(`grade.${data.stability_grade}` as "grade.high" | "grade.medium" | "grade.low" | "grade.no_data");
  const consistencyPct = Math.round(data.consistency * 100);

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return t("durationMin", { min: minutes });
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? t("durationHourMin", { h, min: m }) : t("durationHour", { h });
  };

  const signalLabel = t(`signal.${data.dominant_signal}` as "signal.bullish" | "signal.bearish" | "signal.neutral");

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card border border-border/50 overflow-hidden"
    >
      <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        {/* Left: Stability grade badge */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wider",
              grade.bg,
              grade.text,
              grade.border
            )}
          >
            <Activity size={12} />
            {t("title")}: {gradeLabel}
          </div>

          {/* Signal dot trail (recent 5 signals as colored dots) */}
          <div className="flex items-center gap-1">
            {data.recent_signals.map((s, i) => (
              <div
                key={s.time || `sig-${i}`}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all",
                  SIGNAL_COLORS[s.signal] || "bg-zinc-600",
                  i === 0 ? "ring-2 ring-white/20 scale-110" : "opacity-60"
                )}
                title={`${s.signal} (${Math.round(s.confidence * 100)}%)`}
              />
            ))}
          </div>
        </div>

        {/* Right: Metrics */}
        <div className="flex items-center gap-5 text-[11px] text-zinc-400 font-mono">
          {/* Streak */}
          <div className="flex items-center gap-1.5">
            {(() => {
              const Icon = SIGNAL_ICONS[data.dominant_signal] || Minus;
              return <Icon size={12} className={
                data.dominant_signal === "bullish" ? "text-emerald-400" :
                data.dominant_signal === "bearish" ? "text-red-400" : "text-zinc-500"
              } />;
            })()}
            <span>
              {t("streak")}<span className="text-white font-bold mx-0.5">{data.current_streak}</span>{t("streakTimes", { count: "" })}
              <span className={
                data.dominant_signal === "bullish" ? "text-emerald-400" :
                data.dominant_signal === "bearish" ? "text-red-400" : "text-zinc-400"
              }>{signalLabel}</span>
            </span>
          </div>

          {/* Consistency */}
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  consistencyPct >= 80 ? "bg-emerald-500" :
                  consistencyPct >= 60 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${consistencyPct}%` }}
              />
            </div>
            <span>{t("consistency")} <span className="text-white font-bold">{consistencyPct}%</span></span>
          </div>

          {/* Duration */}
          {data.duration_minutes > 0 && (
            <div className="flex items-center gap-1">
              <Timer size={11} className="text-zinc-500" />
              <span>{t("duration")} <span className="text-white font-bold">{formatDuration(data.duration_minutes)}</span></span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
