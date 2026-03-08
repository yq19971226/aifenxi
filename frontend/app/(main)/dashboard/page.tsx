"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { ModuleErrorBoundary } from "@/components/layout/ModuleErrorBoundary";
import {
  fetchDashboardOverview,
  type SymbolOverview,
} from "@/lib/api/dashboard";
import { fetchOnchainCapabilities, type PlanCapabilities } from "@/lib/api/onchain";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Shield,
  Brain,
  Activity,
  AlertTriangle,
  BarChart3,
  Eye,
  Target,
  Zap,
  Lock,
} from "lucide-react";

function DirectionBadge({ direction }: { direction: string }) {
  if (direction === "long") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-sm font-medium text-emerald-400">
        <TrendingUp size={14} />
        {"看涨"}
      </span>
    );
  }
  if (direction === "short") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-sm font-medium text-red-400">
        <TrendingDown size={14} />
        {"看跌"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2.5 py-1 text-sm font-medium text-zinc-400">
      <Minus size={14} />
      {"中性"}
    </span>
  );
}

function AlertBadge({ level }: { level: string }) {
  const config: Record<string, { color: string; label: string }> = {
    none: { color: "text-zinc-500", label: "正常" },
    low: { color: "text-emerald-400", label: "安全" },
    medium: { color: "text-yellow-400", label: "警惕" },
    high: { color: "text-orange-400", label: "危险" },
    critical: { color: "text-red-400", label: "极危" },
  };
  const { color, label } = config[level] || config.none;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${color}`}>
      <span className={`h-2 w-2 rounded-full ${color.replace("text-", "bg-")}`} />
      {label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const barColor =
    pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-500" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-mono text-zinc-300">{pct}%</span>
    </div>
  );
}

function formatPrice(price: number | null): string {
  if (price == null) return "--";
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function OnchainBadge({ symbol, capabilities }: { symbol: string; capabilities: PlanCapabilities["user_capabilities"] | null }) {
  const hasAccess = capabilities?.symbols?.some(
    (s) => s.toUpperCase() === symbol.toUpperCase()
  );

  if (!capabilities) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        <span className="h-2 w-2 rounded-full bg-zinc-500 animate-pulse" />
        {"加载中..."}
      </span>
    );
  }

  if (hasAccess) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 cursor-pointer hover:text-emerald-300 transition-colors">
        <BarChart3 size={12} />
        {"查看"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
      <Lock size={12} />
      {"T2"}
    </span>
  );
}

function ExpandedDetail({ item }: { item: SymbolOverview }) {
  return (
    <tr>
      <td colSpan={7} className="px-0 py-0">
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="border-t border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 策略摘要 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Target size={13} className="text-blue-400" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{"策略摘要"}</p>
                </div>
                {item.entry_low != null && item.entry_high != null ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">{"入场区间"}</span>
                      <span className="font-mono text-zinc-200 bg-white/[0.04] px-2 py-0.5 rounded">
                        {formatPrice(item.entry_low)} – {formatPrice(item.entry_high)}
                      </span>
                    </div>
                    {item.stop_loss != null && (
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500">{"止损"}</span>
                        <span className="font-mono text-red-400 bg-red-500/[0.08] px-2 py-0.5 rounded">
                          {formatPrice(item.stop_loss)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 italic">{"暂无策略数据"}</p>
                )}
              </div>

              {/* 防御状态 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield size={13} className="text-emerald-400" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{"防御状态"}</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">{"庄家意图"}</span>
                    <span className="text-zinc-300">{item.dealer_intent || "未检测"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">{"合谋检测"}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.collusion_detected
                        ? "bg-red-500/10 text-red-400"
                        : "bg-emerald-500/10 text-emerald-400"
                    }`}>
                      {item.collusion_detected ? "异常" : "正常"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 快捷入口 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap size={13} className="text-yellow-400" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{"快捷操作"}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/consensus?symbol=${item.symbol}`}
                    className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Brain size={12} />
                    {"综合分析"}
                  </Link>
                  <Link
                    href={`/playbook-sim?symbol=${item.symbol}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/[0.08] text-zinc-300 hover:bg-white/[0.04] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Activity size={12} />
                    {"剧本推演"}
                  </Link>
                </div>
              </div>
            </div>

            {/* AI 简评 */}
            {item.reasoning && (
              <div className="mt-4 rounded-xl bg-white/[0.02] border border-white/[0.06] p-3.5">
                <div className="flex items-start gap-2">
                  <Brain size={13} className="text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                    {item.reasoning}
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </td>
    </tr>
  );
}

function SummaryCards({ symbols }: { symbols: SymbolOverview[] }) {
  const stats = useMemo(() => {
    const bullish = symbols.filter((s) => s.direction === "long").length;
    const bearish = symbols.filter((s) => s.direction === "short").length;
    const neutral = symbols.length - bullish - bearish;
    const avgConf = symbols.length > 0
      ? Math.round((symbols.reduce((sum, s) => sum + s.confidence, 0) / symbols.length) * 100)
      : 0;
    const alerts = symbols.filter(
      (s) => s.alert_level === "high" || s.alert_level === "critical"
    ).length;
    return { bullish, bearish, neutral, avgConf, alerts };
  }, [symbols]);

  const cards = [
    {
      label: "监控币种",
      value: symbols.length,
      icon: Eye,
      color: "text-blue-400",
      bg: "bg-blue-500/[0.08]",
    },
    {
      label: "看涨",
      value: stats.bullish,
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/[0.08]",
    },
    {
      label: "看跌",
      value: stats.bearish,
      icon: TrendingDown,
      color: "text-red-400",
      bg: "bg-red-500/[0.08]",
    },
    {
      label: "平均置信度",
      value: `${stats.avgConf}%`,
      icon: BarChart3,
      color: "text-yellow-400",
      bg: "bg-yellow-500/[0.08]",
    },
    {
      label: "风险预警",
      value: stats.alerts,
      icon: AlertTriangle,
      color: stats.alerts > 0 ? "text-red-400" : "text-zinc-500",
      bg: stats.alerts > 0 ? "bg-red-500/[0.08]" : "bg-white/[0.04]",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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

export default function DashboardPage() {
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

  const userCapabilities = capabilitiesData?.user_capabilities ?? null;

  const symbols = data?.symbols ?? [];

  const toggleExpand = (symbol: string) => {
    setExpandedSymbol((prev) => (prev === symbol ? null : symbol));
  };

  return (
    <PageTransition>
      <div className="relative z-10 mx-auto max-w-[1500px] px-4 md:px-8 py-8 space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-white">{"多币种概览"}</h1>
            <p className="text-xs md:text-sm text-zinc-500 mt-1">
              {"AI 实时监控 "}{symbols.length}{" 个币种，点击展开查看详情"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {"30s 自动刷新"}
          </div>
        </div>

        {/* ── Error ── */}
        {error && !isLoading && (
          <div className="card p-5 flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-400 shrink-0" />
            <div>
              <p className="text-sm text-zinc-300">{"加载失败"}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{error instanceof Error ? error.message : "获取概览数据失败，30s 后自动重试"}</p>
            </div>
          </div>
        )}

        {/* ── Summary Cards ── */}
        {!isLoading && symbols.length > 0 && <SummaryCards symbols={symbols} />}

        {/* ── Overview Table ── */}
        <ModuleErrorBoundary moduleName={"币种概览"}>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 md:px-6 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider w-8" />
                  <th className="px-3 md:px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {"币种"}
                  </th>
                  <th className="px-3 md:px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {"最新价"}
                  </th>
                  <th className="px-3 md:px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {"AI 判断"}
                  </th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {"置信度"}
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {"防御状态"}
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left text-xs md:text-sm font-medium text-zinc-500 uppercase tracking-wider">
                    {"链上数据"}
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
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-zinc-500">
                      {"暂无币种数据，请在后台「币种管理」中添加"}
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
                              {item.display_name || item.symbol.replace("USDT", "")}
                            </span>
                            <span className="text-xs text-zinc-600 font-mono">
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
                          <DirectionBadge direction={item.direction} />
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
                          <ExpandedDetail item={item} />
                        )}
                      </AnimatePresence>
                    </motion.tbody>
                  );
                })
              )}
            </table>
          </div>
        </ModuleErrorBoundary>

        {/* ── Legend ── */}
        <div className="flex flex-wrap gap-6 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Shield size={12} className="text-emerald-400" />
            {"安全 = 无异常检测"}
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-yellow-400" />
            {"警惕 = 庄家活动迹象"}
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-red-400" />
            {"危险 = 庄家操盘确认"}
          </span>
        </div>
      </div>
    </PageTransition>
  );
}
