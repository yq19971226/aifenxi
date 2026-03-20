import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useNumberFormatter } from "@/lib/i18n/formatters";
import {
  TrendingUp,
  TrendingDown,
  Eye,
  BarChart3,
  AlertTriangle,
  Crosshair,
} from "lucide-react";
import type { SymbolOverview } from "@/lib/api/dashboard";

export function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 skeleton rounded-lg" />
            <div className="space-y-1.5">
              <div className="h-3 w-12 skeleton rounded" />
              <div className="h-6 w-8 skeleton rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SummaryCards({ symbols }: { symbols: SymbolOverview[] }) {
  const { formatNumber, formatPercent } = useNumberFormatter();
  const t = useTranslations("dashboard.summary");
  
  const stats = useMemo(() => {
    const bullish = symbols.filter((s) => s.direction === "long").length;
    const bearish = symbols.filter((s) => s.direction === "short").length;
    const neutral = symbols.length - bullish - bearish;
    const avgConf = symbols.length > 0
      ? (symbols.reduce((sum, s) => sum + s.confidence, 0) / symbols.length) * 100
      : 0;
    const actionable = symbols.filter((s) => s.is_worth_taking).length;
    const alerts = symbols.filter(
      (s) => s.alert_level === "high" || s.alert_level === "critical"
    ).length;
    return { bullish, bearish, neutral, avgConf, actionable, alerts };
  }, [symbols]);

  const cards = [
    {
      label: t("watchedSymbols"),
      value: formatNumber(symbols.length, 0),
      icon: Eye,
      color: "text-blue-400",
      bg: "bg-blue-500/[0.08]",
    },
    {
      label: t("bullish"),
      value: formatNumber(stats.bullish, 0),
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/[0.08]",
    },
    {
      label: t("bearish"),
      value: formatNumber(stats.bearish, 0),
      icon: TrendingDown,
      color: "text-red-400",
      bg: "bg-red-500/[0.08]",
    },
    {
      label: t("avgConfidence"),
      value: formatPercent(stats.avgConf, 0),
      icon: BarChart3,
      color: "text-yellow-400",
      bg: "bg-yellow-500/[0.08]",
    },
    {
      label: t("actionable"),
      value: formatNumber(stats.actionable, 0),
      icon: Crosshair,
      color: stats.actionable > 0 ? "text-accent" : "text-zinc-500",
      bg: stats.actionable > 0 ? "bg-accent/[0.08]" : "bg-white/[0.04]",
    },
    {
      label: t("riskAlert"),
      value: formatNumber(stats.alerts, 0),
      icon: AlertTriangle,
      color: stats.alerts > 0 ? "text-red-400" : "text-zinc-500",
      bg: stats.alerts > 0 ? "bg-red-500/[0.08]" : "bg-white/[0.04]",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
          className="card px-4 py-3.5"
        >
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
              <c.icon size={15} className={c.color} />
            </div>
            <div>
              <p className="text-xs md:text-sm text-zinc-500 leading-none">{c.label}</p>
              <p className={`text-xl md:text-2xl font-semibold font-mono mt-0.5 leading-none ${c.color}`}>
                {c.value}
              </p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
