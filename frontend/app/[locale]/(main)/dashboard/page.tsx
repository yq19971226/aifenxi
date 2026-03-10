"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { PageTransition } from "@/components/layout/PageTransition";
import { ModuleErrorBoundary } from "@/components/layout/ModuleErrorBoundary";
import { fetchDashboardOverview, fetchDashboardSignals } from "@/lib/api/dashboard";
import { fetchOnchainCapabilities } from "@/lib/api/onchain";
import { formatPrice } from "@/lib/utils/format";
import {
  DirectionBadge,
  AlertBadge,
  ConfidenceBar,
  OnchainBadge,
} from "@/components/dashboard/Badges";
import { SummaryCards, SummaryCardsSkeleton } from "@/components/dashboard/SummaryCards";
import { SignalTimeline, SignalTimelineSkeleton } from "@/components/dashboard/SignalTimeline";
import { OpportunityRank, RiskRadar, OpportunityRiskSkeleton } from "@/components/dashboard/OpportunityRisk";
import { ExpandedDetail } from "@/components/dashboard/ExpandedDetail";
import {
  ChevronRight,
  Shield,
  AlertTriangle,
  BookOpen,
  X,
} from "lucide-react";
import Link from "next/link";
import { useOnlineCount } from "@/lib/hooks/useOnlineCount";

function NewUserBanner() {
  const t = useTranslations('dashboard');
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("axiom_guide_dismissed") === "1";
    }
    return false;
  });

  if (dismissed) return null;

  const hide = () => {
    setDismissed(true);
    try { localStorage.setItem("axiom_guide_dismissed", "1"); } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 rounded-lg border border-blue-500/10 bg-blue-500/[0.04] px-4 py-3"
    >
      <BookOpen size={16} className="shrink-0 text-blue-400" />
      <p className="flex-1 text-sm text-blue-300/80">
        {t('guideBanner')}{" "}
        <Link href="/guide" className="underline underline-offset-2 hover:text-blue-200 transition-colors">
          {t('guideBannerLink')}
        </Link>
      </p>
      <button type="button" onClick={hide} className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors">
        <X size={14} />
      </button>
    </motion.div>
  );
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: fetchDashboardOverview,
    refetchInterval: 30_000,
  });

  const { data: capabilitiesData } = useQuery({
    queryKey: ["onchain-capabilities"],
    queryFn: fetchOnchainCapabilities,
    staleTime: 300_000,
  });

  const { data: signalsData, isLoading: signalsLoading } = useQuery({
    queryKey: ["dashboard-signals"],
    queryFn: () => fetchDashboardSignals(20),
    refetchInterval: 60_000,
  });

  const userCapabilities = capabilitiesData?.user_capabilities ?? null;
  const { count: onlineCount, enabled: onlineEnabled } = useOnlineCount();

  const symbols = data?.symbols ?? [];

  const toggleExpand = (symbol: string) => {
    setExpandedSymbol((prev) => (prev === symbol ? null : symbol));
  };

  return (
    <PageTransition>
      <div className="relative z-10 mx-auto max-w-[1500px] px-4 md:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-white">{t('title')}</h1>
            <p className="text-xs md:text-sm text-zinc-500 mt-1">
              {t('subtitle', { count: symbols.length })}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            {onlineEnabled && onlineCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {onlineCount} {t('onlineLabel')}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {t('autoRefresh')}
            </span>
          </div>
        </div>

        <AnimatePresence>
          <NewUserBanner />
        </AnimatePresence>

        {error && !isLoading && (
          <div className="card p-5 flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-400 shrink-0" />
            <div>
              <p className="text-sm text-zinc-300">{t('error.loadFailed')}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{error instanceof Error ? error.message : t('error.fetchFailed')}</p>
            </div>
          </div>
        )}

        {isLoading ? <SummaryCardsSkeleton /> : symbols.length > 0 ? <SummaryCards symbols={symbols} /> : null}

        {signalsLoading ? <SignalTimelineSkeleton /> : (
          <SignalTimeline signals={signalsData?.signals ?? []} />
        )}

        {isLoading ? <OpportunityRiskSkeleton /> : symbols.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OpportunityRank symbols={symbols} />
            <RiskRadar symbols={symbols} />
          </div>
        ) : null}

        <ModuleErrorBoundary moduleName={t('table.symbol')}>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 md:px-6 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider w-8" />
                  <th className="px-3 md:px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {t('table.symbol')}
                  </th>
                  <th className="px-3 md:px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {t('table.price')}
                  </th>
                  <th className="px-3 md:px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {t('table.aiJudgment')}
                  </th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {t('table.confidence')}
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {t('table.defenseStatus')}
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {t('table.onchainData')}
                  </th>
                </tr>
              </thead>
              {isLoading ? (
                <tbody className="divide-y divide-white/[0.04]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4" />
                      <td className="px-4 py-4">
                        <div className="h-4 w-16 skeleton rounded" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 w-20 skeleton rounded" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-5 w-14 skeleton rounded-full" />
                      </td>
                      <td className="hidden md:table-cell px-4 py-4">
                        <div className="h-1.5 w-16 skeleton rounded-full" />
                      </td>
                      <td className="hidden lg:table-cell px-4 py-4">
                        <div className="h-4 w-12 skeleton rounded" />
                      </td>
                      <td className="hidden lg:table-cell px-4 py-4">
                        <div className="h-4 w-10 skeleton rounded" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ) : symbols.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={100} className="px-6 py-12 text-center text-sm text-zinc-500">
                      {t('table.noData')}
                    </td>
                  </tr>
                </tbody>
              ) : (
                symbols.map((item, idx) => {
                  const isExpanded = expandedSymbol === item.symbol;
                  const hasWarning =
                    item.alert_level === "high" || item.alert_level === "critical";
                  return (
                    <motion.tbody
                      key={item.symbol}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: idx * 0.04 }}
                      className="divide-y divide-white/[0.04]"
                    >
                      <tr
                        onClick={() => toggleExpand(item.symbol)}
                        className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${
                          isExpanded ? "bg-white/[0.03]" : ""
                        } ${hasWarning ? "border-l-2 border-l-red-500/50" : ""}`}
                      >
                        <td className="px-3 md:px-6 py-4 text-zinc-500">
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronRight size={14} />
                          </motion.div>
                        </td>
                        <td className="px-3 md:px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-base md:text-lg font-medium text-white">
                              {item.display_name || (item.symbol ?? "").replace("USDT", "")}
                            </span>
                            <span className="text-xs text-zinc-500 font-mono">
                              {item.symbol}
                            </span>
                            {hasWarning && (
                              <AlertTriangle size={12} className="text-red-400 animate-pulse" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 md:px-4 py-4">
                          <span className="font-mono text-base md:text-lg text-zinc-200">
                            {formatPrice(item.latest_price)}
                          </span>
                        </td>
                        <td className="px-3 md:px-4 py-4">
                          <DirectionBadge direction={item.direction} isWorthTaking={item.is_worth_taking} />
                        </td>
                        <td className="hidden md:table-cell px-4 py-4">
                          <ConfidenceBar value={item.confidence} />
                        </td>
                        <td className="hidden lg:table-cell px-4 py-4">
                          <AlertBadge level={item.alert_level} />
                        </td>
                        <td className="hidden lg:table-cell px-4 py-4">
                          <OnchainBadge symbol={item.symbol} capabilities={userCapabilities} />
                        </td>
                      </tr>
                      <AnimatePresence>
                        {isExpanded && (
                          <ExpandedDetail item={item} capabilities={userCapabilities} />
                        )}
                      </AnimatePresence>
                    </motion.tbody>
                  );
                })
              )}
            </table>
          </div>
        </ModuleErrorBoundary>

        <div className="flex flex-wrap gap-6 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Shield size={12} className="text-emerald-400" />
            {t('legend.safe')}
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-yellow-400" />
            {t('legend.caution')}
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-orange-400" />
            {t('legend.danger')}
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-red-400" />
            {t('legend.critical')}
          </span>
        </div>
      </div>
    </PageTransition>
  );
}
