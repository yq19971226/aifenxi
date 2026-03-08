"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
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
import { mapConfidenceLabel } from "@/lib/utils/confidence";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// ── Filter options ───────────────────────────────────────────

const DAYS_OPTIONS: { label: string; value: number }[] = [
  { label: "7", value: 7 },
  { label: "30", value: 30 },
  { label: "90", value: 90 },
];

const DIRECTION_OPTIONS: { label: string; value: string }[] = [
  { label: "全部", value: "" },
  { label: "多头", value: "long" },
  { label: "空头", value: "short" },
];

// ── Helpers ──────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function directionLabel(d: string): string {
  if (d === "long") return "多头";
  if (d === "short") return "空头";
  return "中性";
}

function statusLabel(s: string): string {
  if (s === "hit_stop_loss") return "止损";
  if (s === "hit_target") return "止盈";
  if (s === "timeout") return "超时";
  return "进行中";
}

function statusColor(s: string): string {
  if (s === "hit_target") return "text-[#00FFA3]";
  if (s === "hit_stop_loss") return "text-[#FF3366]";
  if (s === "timeout") return "text-[#FFB800]";
  return "text-zinc-400";
}

function pnlColor(pnl: number | null): string {
  if (pnl === null) return "text-zinc-400";
  return pnl >= 0 ? "text-[#00FFA3]" : "text-[#FF3366]";
}

// ── Snapshot Detail Panel ────────────────────────────────────

interface SnapshotPanelProps {
  snapshotId: string;
  onClose: () => void;
}

function SnapshotPanel({ snapshotId, onClose }: SnapshotPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["snapshot-detail", snapshotId],
    queryFn: () => performanceApi.getSnapshotDetail(snapshotId),
    enabled: !!snapshotId,
  });

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card rounded-2xl p-6 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#0088FF]/10 blur-[50px] -z-10 rounded-full" />
        <div className="flex items-center justify-between mb-4 relative z-10">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">策略详情</p>
          <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-[#00FFA3] hover:drop-shadow-[0_0_5px_#00FFA3] transition-all">
            关闭
          </button>
        </div>
        <div className="space-y-3 relative z-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-3">
                <Skeleton w="3rem" h="0.5rem" className="mb-1" />
                <Skeleton w="5rem" h="0.875rem" />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  if (error || !data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card rounded-2xl p-6 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF3366]/10 blur-[50px] -z-10 rounded-full" />
        <div className="flex items-center justify-between mb-4 relative z-10">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">策略详情</p>
          <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-[#00FFA3] hover:drop-shadow-[0_0_5px_#00FFA3] transition-all">
            关闭
          </button>
        </div>
        <p className="text-sm text-[#FF3366] drop-shadow-[0_0_8px_rgba(255,51,102,0.6)] relative z-10">加载失败</p>
      </motion.div>
    );
  }

  const { snapshot, checkpoints } = data;
  const entryMid = ((snapshot.entry_low + snapshot.entry_high) / 2).toFixed(2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="card rounded-2xl p-6 relative overflow-hidden group"
    >
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#0088FF]/10 blur-[80px] -z-10 rounded-full group-hover:bg-[#0088FF]/20 transition-colors duration-700" />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#00FFA3]/5 blur-[80px] -z-10 rounded-full" />
      <div className="flex items-center justify-between mb-6 relative z-10">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">策略详情</p>
        <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-[#00FFA3] hover:drop-shadow-[0_0_5px_#00FFA3] transition-all">
          关闭
        </button>
      </div>

      {/* Snapshot info grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 relative z-10">
        <InfoCell label="交易" value={snapshot.symbol} />
        <InfoCell label="方向" value={directionLabel(snapshot.direction)} />
        <InfoCell label="入场区间" value={`${snapshot.entry_low} ?${snapshot.entry_high}`} />
        <InfoCell label="入场中位" value={entryMid} />
        <InfoCell label="止损" value={String(snapshot.stop_loss)} />
        <InfoCell label="目标" value={snapshot.targets.join(" / ")} />
        <InfoCell label="置信度" value={`${(snapshot.confidence * 100).toFixed(0)}% · ${mapConfidenceLabel(snapshot.confidence)}`} />
        <InfoCell label="生成价格" value={String(snapshot.price_at_generation)} />
        <InfoCell label="状态" value={statusLabel(snapshot.status)} colorClass={statusColor(snapshot.status)} />
        <InfoCell
          label="盈亏"
          value={snapshot.pnl_pct !== null ? `${snapshot.pnl_pct >= 0 ? "+" : ""}${snapshot.pnl_pct.toFixed(2)}%` : ""}
          colorClass={pnlColor(snapshot.pnl_pct)}
        />
        {snapshot.settlement_price !== null && (
          <InfoCell label="结算价格" value={String(snapshot.settlement_price)} />
        )}
        <InfoCell label="生成时间" value={formatTime(snapshot.created_at)} />
      </div>

      {/* Checkpoints */}
      {checkpoints.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/[0.05] relative z-10">
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">价格检查点</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {checkpoints
              .sort((a, b) => a.checkpoint_hours - b.checkpoint_hours)
              .map((cp) => (
                <div
                  key={cp.checkpoint_hours}
                  className="rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-3 hover:bg-white/[0.04] transition-colors"
                >
                  <p className="text-xs text-[#0088FF] drop-shadow-[0_0_5px_rgba(0,136,255,0.5)]">{cp.checkpoint_hours}h</p>
                  <p className="text-base font-mono font-medium text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] my-1">{cp.actual_price}</p>
                  <p className="text-xs text-zinc-600">{formatTime(cp.recorded_at)}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function InfoCell({ label, value, colorClass = "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" }: { label: string; value: string; colorClass?: string }) {
  // If it's a specific color from status/pnl, we inject the right drop-shadow
  let shadowClass = "";
  if (colorClass.includes("text-bull") || colorClass.includes("text-[#00FFA3]")) {
    colorClass = "text-[#00FFA3]";
    shadowClass = "drop-shadow-[0_0_8px_rgba(0,255,163,0.6)]";
  } else if (colorClass.includes("text-bear") || colorClass.includes("text-[#FF3366]")) {
    colorClass = "text-[#FF3366]";
    shadowClass = "drop-shadow-[0_0_8px_rgba(255,51,102,0.6)]";
  } else if (colorClass.includes("text-yellow")) {
    colorClass = "text-[#FFB800]";
    shadowClass = "drop-shadow-[0_0_8px_rgba(255,184,0,0.6)]";
  }

  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-3 hover:bg-white/[0.04] transition-colors">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-base font-mono font-medium ${colorClass} ${shadowClass}`}>{value}</p>
    </div>
  );
}

// ── Filter Bar ───────────────────────────────────────────────

interface FilterBarProps {
  symbol: string;
  onSymbolChange: (v: string) => void;
  days: number;
  onDaysChange: (v: number) => void;
  direction: string;
  onDirectionChange: (v: string) => void;
}

function FilterBar({ symbol, onSymbolChange, days, onDaysChange, direction, onDirectionChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Symbol input */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="perf-symbol" className="text-xs font-medium uppercase tracking-widest text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">交易对</label>
        <input
          id="perf-symbol"
          type="text"
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value.toUpperCase())}
          placeholder="全部"
          className="h-9 w-36 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 text-sm font-medium text-white placeholder:text-zinc-600 focus:border-[#00FFA3]/50 focus:bg-[#00FFA3]/5 focus:shadow-[0_0_15px_rgba(0,255,163,0.15)] focus:outline-none transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        />
      </div>

      {/* Days selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">时间范围</span>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.02] border border-white/[0.05] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDaysChange(opt.value)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-300 ${
                days === opt.value
                  ? "bg-[#00FFA3]/10 text-[#00FFA3] drop-shadow-[0_0_5px_rgba(0,255,163,0.5)]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Direction selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">方向</span>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.02] border border-white/[0.05] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
          {DIRECTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDirectionChange(opt.value)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-300 ${
                direction === opt.value
                  ? "bg-[#0088FF]/10 text-[#0088FF] drop-shadow-[0_0_5px_rgba(0,136,255,0.5)]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PerformancePage() {
  // Filter state
  const [symbol, setSymbol] = useState("");
  const [days, setDays] = useState(30);
  const [direction, setDirection] = useState("");

  // Snapshot detail
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const { user } = useAuth();
  const membershipLevel = effectiveLevel(user);

  // ── Data queries ──────────────────────────────────────────
  const statsQuery = useQuery({
    queryKey: ["perf-stats", symbol, days, direction],
    queryFn: () =>
      performanceApi.getStats(
        symbol || undefined,
        days,
        direction || undefined
      ),
  });

  const trendQuery = useQuery({
    queryKey: ["perf-trend", days],
    queryFn: () => performanceApi.getTrend(days),
  });

  // ── Callbacks ─────────────────────────────────────────────
  const handleCloseDetail = useCallback(() => setSelectedSnapshotId(null), []);

  // ── Default empty stats ───────────────────────────────────
  const defaultStats: PerformanceStats = {
    total_strategies: 0,
    settled_count: 0,
    win_rate: 0,
    avg_profit_pct: 0,
    avg_loss_pct: 0,
    profit_loss_ratio: 0,
    by_agent: {},
  };

  const stats = statsQuery.data ?? defaultStats;
  const trendData: TrendDataPoint[] = trendQuery.data ?? [];

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 p-6 relative">
        {/* Ambient background glows for the page */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#0088FF]/10 blur-[120px] -z-20 rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#00FFA3]/5 blur-[120px] -z-20 rounded-full pointer-events-none" />
        
        {/* Header */}
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">策略绩效</h1>
          <p className="mt-1.5 text-sm font-medium text-zinc-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
            追踪策略建议的历史表现，评估系统准确率
          </p>
        </div>

        {/* Filters */}
        <div className="card rounded-2xl p-5 relative overflow-hidden z-10">
          <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent pointer-events-none" />
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
          <div className="space-y-4 relative z-10">
            <div className="card rounded-2xl p-6">
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
          <div className="card rounded-2xl p-6 relative z-10 text-center">
            <p className="text-sm font-medium text-[#FF3366] drop-shadow-[0_0_8px_rgba(255,51,102,0.6)]">绩效数据加载失败</p>
          </div>
        ) : (
          <div className="relative z-10">
            <PerformanceSummary stats={stats} membershipLevel={membershipLevel} />
          </div>
        )}

        {/* Agent Accuracy Ranking */}
        {!statsQuery.isLoading && !statsQuery.error && (
          <AgentAccuracyCard byAgent={stats.by_agent} />
        )}

        {/* Trend Charts ?side by side on lg */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 relative z-10">
          <WinRateTrend data={trendData} />
          <PnlCurve data={trendData} />
        </div>

        {/* Snapshot Detail */}
        <AnimatePresence mode="wait">
          {selectedSnapshotId && (
            <SnapshotPanel
              key={selectedSnapshotId}
              snapshotId={selectedSnapshotId}
              onClose={handleCloseDetail}
            />
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
