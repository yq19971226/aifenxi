"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PageTransition } from "@/components/layout/PageTransition";
import { PerformanceSummary } from "@/components/performance/PerformanceSummary";
import { WinRateTrend } from "@/components/performance/WinRateTrend";
import { PnlCurve } from "@/components/performance/PnlCurve";
import { AgentAccuracyCard } from "@/components/performance/AgentAccuracyCard";
import {
  performanceApi,
  type PerformanceStats,
  type TrendDataPoint,
} from "@/lib/api/performance";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { FilterBar } from "./FilterBar";

// ── Main Page ────────────────────────────────────────────────

const DEFAULT_STATS: PerformanceStats = {
  total_strategies: 0,
  settled_count: 0,
  win_rate: 0,
  avg_profit_pct: 0,
  avg_loss_pct: 0,
  profit_loss_ratio: 0,
  by_agent: {},
};

export default function PerformancePage() {
  const t = useTranslations('performance');
  const [symbol, setSymbol] = useState("");
  const [days, setDays] = useState(30);
  const [direction, setDirection] = useState("");
  const { user } = useAuth();
  const membershipLevel = effectiveLevel(user);

  const statsQuery = useQuery({
    queryKey: ["perf-stats", symbol, days, direction],
    queryFn: () =>
      performanceApi.getStats(symbol || undefined, days, direction || undefined),
  });

  const trendQuery = useQuery({
    queryKey: ["perf-trend", days],
    queryFn: () => performanceApi.getTrend(days),
  });

  const stats = statsQuery.data ?? DEFAULT_STATS;
  const trendData: TrendDataPoint[] = trendQuery.data ?? [];

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('title')}</h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            {t('subtitle')}
          </p>
        </div>

        {/* Filters */}
        <div className="card p-5">
          <FilterBar
            symbol={symbol}
            onSymbolChange={setSymbol}
            days={days}
            onDaysChange={setDays}
            direction={direction}
            onDirectionChange={setDirection}
          />
        </div>

        {/* Performance Summary */}
        {statsQuery.isLoading ? (
          <div className="space-y-4">
            <div className="card p-6">
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton w="3rem" h="0.5rem" className="mb-2" />
                    <Skeleton w="4rem" h="1.5rem" />
                  </div>
                ))}
              </div>
            </div>
            <SkeletonCard lines={3} />
          </div>
        ) : statsQuery.error ? (
          <div className="card p-6 text-center">
            <p className="text-sm font-medium text-red-400">{t('error.loadFailed')}</p>
          </div>
        ) : (
          <PerformanceSummary stats={stats} membershipLevel={membershipLevel} />
        )}

        {/* Agent Accuracy Ranking */}
        {!statsQuery.isLoading && !statsQuery.error && (
          <AgentAccuracyCard byAgent={stats.by_agent} />
        )}

        {/* Trend Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <WinRateTrend data={trendData} />
          <PnlCurve data={trendData} />
        </div>

      </div>
    </PageTransition>
  );
}
