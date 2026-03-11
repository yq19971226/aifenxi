"use client";

import { useQueries } from "@tanstack/react-query";
import { BarChart3, Lock, TrendingUp, Activity, Layers } from "lucide-react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import type { PlanCapabilities } from "@/lib/api/onchain";
import { fetchOnchainData } from "@/lib/api/onchain";

const METRIC_META: Record<string, { unit: string; icon: typeof BarChart3 }> = {
  price:             { unit: "USD",  icon: TrendingUp },
  market_cap:        { unit: "USD",  icon: Layers },
  nvt:               { unit: "",     icon: Activity },
  mvrv:              { unit: "",     icon: BarChart3 },
  stock_to_flow:     { unit: "",     icon: BarChart3 },
  exchange_flow:     { unit: "USD",  icon: Activity },
};

function formatValue(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  if (unit === "USD") {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  }
  return value.toFixed(2);
}

interface OnchainSectionProps {
  symbol: string;
  capabilities: PlanCapabilities["user_capabilities"] | null;
}

export function OnchainSection({ symbol, capabilities }: OnchainSectionProps) {
  const t = useTranslations('onchain');
  const locale = useLocale();
  const accessibleMetrics = capabilities?.metrics ?? [];
  const hasSymbolAccess = capabilities?.symbols?.some(
    (s) => s.toUpperCase() === symbol.toUpperCase()
  );

  // 指标列表固定，保证 hooks 调用次数稳定
  const displayMetrics = Object.keys(METRIC_META);

  // 批量查询：用 enabled 控制是否实际发起请求
  const queries = useQueries({
    queries: displayMetrics.map((metric) => ({
      queryKey: ["onchain", symbol, metric],
      queryFn: () => fetchOnchainData(symbol, metric),
      enabled: !!hasSymbolAccess && accessibleMetrics.includes(metric),
      staleTime: 60_000,
      retry: 1,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading && q.fetchStatus !== "idle");

  if (!hasSymbolAccess) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={13} className="text-purple-400" />
          <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{t('title')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Lock size={14} className="text-zinc-500" />
          <p className="text-xs text-zinc-500">{t('noAccess.message')}</p>
          <Link
            href={`/${locale}/settings/membership`}
            className="text-xs text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {t('noAccess.upgrade')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 size={13} className="text-purple-400" />
        <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{t('title')}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {displayMetrics.map((metric, idx) => {
          const meta = METRIC_META[metric];
          const hasAccess = accessibleMetrics.includes(metric);
          const Icon = meta.icon;

          if (!hasAccess) {
            return (
              <div key={metric} className="flex items-center gap-2 rounded-md bg-white/[0.02] border border-white/[0.04] px-3 py-2 opacity-50">
                <Lock size={10} className="text-zinc-500 shrink-0" />
                <span className="text-xs text-zinc-500">{t(`metrics.${metric}`)}</span>
              </div>
            );
          }

          const value = queries[idx]?.data?.data?.value ?? null;

          return (
            <div key={metric} className="rounded-md bg-white/[0.03] border border-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={10} className="text-zinc-500" />
                <span className="text-xs text-zinc-500">{t(`metrics.${metric}`)}</span>
              </div>
              {isLoading ? (
                <div className="h-4 w-16 skeleton rounded" />
              ) : (
                <span className="text-sm font-mono font-medium text-zinc-200">
                  {formatValue(value, meta.unit)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
