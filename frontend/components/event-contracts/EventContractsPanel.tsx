"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Pause,
  Activity,
  BarChart3,
  Clock,
  ChevronLeft,
  ChevronRight,
  Signal,
  ShieldCheck,
  Flame,
} from "lucide-react";
import {
  fetchEventLive,
  fetchEventHistory,
  fetchEventStats,
  type EventLiveSignal,
  type EventHistoryRecord,
  type EventStatsResponse,
} from "@/lib/api/event-contracts";

// ── 常量 ──────────────────────────────────────────────────
const POLL_INTERVAL = 2000;

// ── 容器动画 ──────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// ── 页面组件 ──────────────────────────────────────────────
export default function EventContractsPanel() {
  const [live, setLive] = useState<EventLiveSignal | null>(null);
  const [history, setHistory] = useState<EventHistoryRecord[]>([]);
  const [stats, setStats] = useState<EventStatsResponse | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const pollLive = useCallback(async () => {
    try {
      const data = await fetchEventLive();
      setLive(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || "获取实时信号失败");
    }
  }, []);

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const [histData, statsData] = await Promise.all([
        fetchEventHistory("ETHUSDT", p, 20),
        fetchEventStats("ETHUSDT"),
      ]);
      setHistory(histData.records);
      setHistoryTotal(histData.total);
      setStats(statsData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    pollLive();
    loadData(1);
    timerRef.current = setInterval(pollLive, POLL_INTERVAL);
    const histTimer = setInterval(() => loadData(page), 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(histTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (p: number) => {
    setPage(p);
    loadData(p);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Header ── */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-6 lg:p-8">
        <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-[#00E5FF]/[0.04] blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[200px] h-[200px] rounded-full bg-amber-500/[0.03] blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              <span className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]">
                Event Contract Predictor
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              事件合约预测
            </h1>
            <p className="text-zinc-500 text-sm font-mono mt-1 max-w-lg">
              10 分钟事件合约 · 订单流 + 技术指标规则引擎 · 自动预测 & 结算
            </p>
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-2">
            <motion.span
              className={`h-2 w-2 rounded-full ${
                live?.status === "online"
                  ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,1)]"
                  : "bg-zinc-600"
              }`}
              animate={live?.status === "online" ? { opacity: [1, 0.3, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${
              live?.status === "online" ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "text-zinc-500"
            }`}>
              {live?.status === "online" ? "LIVE" : live?.status === "warming_up" ? "WARMING UP" : "OFFLINE"}
            </span>
          </div>
        </div>
      </motion.div>

      {error && (
        <motion.div variants={itemVariants} className="rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl px-5 py-3 text-red-400 text-sm font-mono flex items-center gap-2">
          <ShieldCheck size={14} className="text-red-400 shrink-0" />
          {error}
        </motion.div>
      )}

      {/* ── Live Signal Panel ── */}
      <motion.div variants={itemVariants}>
        <LiveSignalPanel live={live} />
      </motion.div>

      {/* ── Stats ── */}
      {stats && (
        <motion.div variants={itemVariants}>
          <StatsPanel stats={stats} />
        </motion.div>
      )}

      {/* ── History ── */}
      <motion.div variants={itemVariants}>
        <HistoryTable
          records={history}
          total={historyTotal}
          page={page}
          onPageChange={handlePageChange}
          loading={loading}
        />
      </motion.div>
    </motion.div>
  );
}

// ── 实时信号面板 ──────────────────────────────────────────

function LiveSignalPanel({ live }: { live: EventLiveSignal | null }) {
  if (!live || live.status !== "online") {
    return (
      <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-12 text-center overflow-hidden">
        <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full bg-zinc-500/[0.05] blur-[60px]" />
        <div className="relative z-10">
          <Pause size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500 font-mono text-sm">
            {live?.status === "warming_up" ? "数据预热中，请等待约 30 秒..." : "预测器当前未运行"}
          </p>
        </div>
      </div>
    );
  }

  const pred = live.prediction;
  const metrics = live.metrics;
  const isUp = pred?.direction === "up";
  const isDown = pred?.direction === "down";
  const strengthPct = ((pred?.strength || 0) * 100).toFixed(0);

  // Neon color scheme per direction
  const neonColor = isUp
    ? { text: "text-[#00E5FF]", glow: "drop-shadow-[0_0_15px_rgba(0,229,255,0.6)]", bar: "bg-[#00E5FF]", bg: "bg-[#00E5FF]/[0.04]", border: "border-[#00E5FF]/20" }
    : isDown
    ? { text: "text-red-400", glow: "drop-shadow-[0_0_15px_rgba(248,113,113,0.6)]", bar: "bg-red-400", bg: "bg-red-400/[0.04]", border: "border-red-400/20" }
    : { text: "text-zinc-400", glow: "", bar: "bg-zinc-500", bg: "bg-zinc-500/[0.04]", border: "border-zinc-500/20" };

  const DirIcon = isUp ? TrendingUp : isDown ? TrendingDown : Pause;
  const dirLabel = isUp ? "看涨 BULLISH" : isDown ? "看跌 BEARISH" : "观望 NEUTRAL";

  return (
    <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl overflow-hidden">
      <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />

      {/* Ambient glow per direction */}
      {isUp && <div className="absolute top-0 left-0 w-[400px] h-[300px] rounded-full bg-[#00E5FF]/[0.04] blur-[120px] pointer-events-none" />}
      {isDown && <div className="absolute top-0 right-0 w-[400px] h-[300px] rounded-full bg-red-500/[0.04] blur-[120px] pointer-events-none" />}

      {/* Top neon bar */}
      <motion.div
        className={`h-[2px] ${neonColor.bar}`}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ transformOrigin: "left" }}
      />

      <div className="relative z-10 p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left: Direction + Price */}
          <div className="space-y-5">
            {/* Direction */}
            <div>
              <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 bg-amber-500 rounded-full" />
                PREDICTION
              </p>
              <div className="flex items-center gap-3">
                <motion.div
                  className={`p-2.5 rounded-lg ${neonColor.bg} border ${neonColor.border}`}
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <DirIcon size={24} className={`${neonColor.text} ${neonColor.glow}`} />
                </motion.div>
                <div>
                  <p className={`text-xl font-black font-mono tracking-tight ${neonColor.text} ${neonColor.glow}`}>
                    {dirLabel}
                  </p>
                </div>
              </div>
            </div>

            {/* Price */}
            <div>
              <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 bg-fuchsia-500 rounded-full" />
                CURRENT PRICE
              </p>
              <p className="text-3xl font-black font-mono text-white tabular-nums tracking-tight">
                <span className="text-fuchsia-400/60 text-lg mr-0.5">$</span>
                {live.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Strength bar */}
            <div>
              <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                <span className="w-1 h-3 bg-indigo-500 rounded-full" />
                SIGNAL STRENGTH
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 rounded-full bg-white/[0.04] overflow-hidden border border-white/[0.06]">
                  <motion.div
                    className={`h-full rounded-full ${neonColor.bar} shadow-[0_0_12px_rgba(0,229,255,0.3)]`}
                    initial={{ width: 0 }}
                    animate={{ width: `${strengthPct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <span className={`text-sm font-black font-mono tabular-nums ${neonColor.text} ${neonColor.glow}`}>
                  {strengthPct}%
                </span>
              </div>
            </div>
          </div>

          {/* Middle: Primary signals */}
          <div className="space-y-1">
            <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
              <Signal size={10} className="text-[#00E5FF]" />
              PRIMARY · 订单流
            </p>
            <MetricRow label="买/卖比 (30s)" value={metrics?.buy_sell_ratio_30s} format={(v) => v.toFixed(2)} bullish={v => v > 1.3} bearish={v => v < 0.77} />
            <MetricRow label="订单簿失衡" value={metrics?.orderbook_imbalance} format={(v) => `${(v * 100).toFixed(1)}%`} bullish={v => v > 0.2} bearish={v => v < -0.2} />
            <MetricRow label="大单净流向" value={metrics?.large_order_flow} format={(v) => `$${Math.abs(v).toLocaleString()}`} bullish={v => v > 0} bearish={v => v < 0} prefix={metrics?.large_order_flow && metrics.large_order_flow > 0 ? "+" : ""} />
            <MetricRow label="成交笔数" value={metrics?.trade_count_30s} format={(v) => v.toString()} />
          </div>

          {/* Right: Secondary signals */}
          <div className="space-y-1">
            <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
              <BarChart3 size={10} className="text-amber-400" />
              SECONDARY · 技术指标
            </p>
            <MetricRow label="RSI(14)" value={metrics?.rsi_1m} format={(v) => v.toFixed(1)} bullish={v => v > 55} bearish={v => v < 45} />
            <MetricRow label="EMA5 vs EMA10" value={metrics?.ema5_vs_ema10} format={(v) => v.toFixed(4)} bullish={v => v > 0} bearish={v => v < 0} />
            <MetricRow label="成交量比" value={metrics?.volume_ratio} format={(v) => `${v.toFixed(2)}x`} bullish={v => v > 1.5} />
          </div>
        </div>

        {/* Triggered Signals */}
        {pred?.signals && pred.signals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6 pt-5 border-t border-white/[0.05]"
          >
            <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
              <Flame size={10} className="text-orange-400" />
              TRIGGERED SIGNALS
            </p>
            <div className="flex flex-wrap gap-2">
              {pred.signals.map((s, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-md border ${
                    s.includes("bullish")
                      ? "text-[#00E5FF] border-[#00E5FF]/20 bg-[#00E5FF]/[0.08] drop-shadow-[0_0_6px_rgba(0,229,255,0.3)]"
                      : s.includes("bearish")
                      ? "text-red-400 border-red-500/20 bg-red-500/[0.08] drop-shadow-[0_0_6px_rgba(248,113,113,0.3)]"
                      : "text-zinc-400 border-white/10 bg-white/[0.03]"
                  }`}
                >
                  {s}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        <p className="text-[9px] font-mono text-zinc-600 mt-4 tabular-nums">
          LAST UPDATE: {live.updated_at ? new Date(live.updated_at).toLocaleTimeString() : "—"}
        </p>
      </div>
    </div>
  );
}

// ── 指标行 ───────────────────────────────────────────────

function MetricRow({
  label,
  value,
  format,
  bullish,
  bearish,
  prefix = "",
}: {
  label: string;
  value: number | null | undefined;
  format: (v: number) => string;
  bullish?: (v: number) => boolean;
  bearish?: (v: number) => boolean;
  prefix?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors group">
        <span className="text-[11px] font-mono text-zinc-500">{label}</span>
        <span className="text-[11px] font-mono text-zinc-700">—</span>
      </div>
    );
  }

  const isBull = bullish?.(value);
  const isBear = bearish?.(value);
  const color = isBull
    ? "text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]"
    : isBear
    ? "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]"
    : "text-zinc-300";

  return (
    <div className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors group border-l-2 border-transparent hover:border-[#00E5FF]/40">
      <span className="text-[11px] font-mono text-zinc-500 group-hover:text-zinc-400 transition-colors">{label}</span>
      <span className={`text-[13px] font-mono font-black tabular-nums ${color}`}>
        {prefix}{format(value)}
        {isBull && <TrendingUp size={10} className="inline ml-1 text-[#00E5FF]" />}
        {isBear && <TrendingDown size={10} className="inline ml-1 text-red-400" />}
      </span>
    </div>
  );
}

// ── 统计面板 ─────────────────────────────────────────────

function StatsPanel({ stats }: { stats: EventStatsResponse }) {
  const periods = [
    { key: "today" as const, label: "TODAY", icon: Clock },
    { key: "7d" as const, label: "7 DAYS", icon: Activity },
    { key: "30d" as const, label: "30 DAYS", icon: BarChart3 },
    { key: "all_time" as const, label: "ALL TIME", icon: Zap },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {periods.map(({ key, label, icon: Icon }, idx) => {
        const d = stats[key];
        const hasData = d.decided > 0;
        const rateColor = !hasData
          ? "text-zinc-600"
          : d.win_rate >= 60
          ? "text-[#00E5FF] drop-shadow-[0_0_15px_rgba(0,229,255,0.6)] glow-cyan"
          : d.win_rate >= 50
          ? "text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]"
          : "text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.5)]";

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-5 overflow-hidden group hover:border-[#00E5FF]/20 transition-colors"
          >
            <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />
            <div className="absolute top-0 right-0 w-[80px] h-[80px] rounded-full bg-[#00E5FF]/[0.03] blur-[40px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-4">
                <Icon size={10} className="text-zinc-500" />
                <p className="text-[9px] font-mono font-black text-zinc-500 uppercase tracking-[0.2em]">{label}</p>
              </div>
              <p className={`text-3xl font-black font-mono tabular-nums ${rateColor}`}>
                {hasData ? `${d.win_rate}%` : "—"}
              </p>
              <div className="mt-3 space-y-0.5">
                <p className="text-[10px] font-mono text-zinc-500">
                  <span className="text-emerald-400">{d.wins}</span>
                  <span className="text-zinc-600 mx-1">WIN</span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-red-400 ml-1">{d.losses}</span>
                  <span className="text-zinc-600 mx-1">LOSE</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500 ml-1">{d.skipped}</span>
                  <span className="text-zinc-600 ml-1">SKIP</span>
                </p>
                <p className="text-[9px] font-mono text-zinc-700">
                  TOTAL {d.total} ROUNDS
                </p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── 历史表格 ─────────────────────────────────────────────

function HistoryTable({
  records,
  total,
  page,
  onPageChange,
  loading,
}: {
  records: EventHistoryRecord[];
  total: number;
  page: number;
  onPageChange: (p: number) => void;
  loading: boolean;
}) {
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl overflow-hidden">
      <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />

      {/* Header bar — terminal style */}
      <div className="relative z-10 px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
        <div className="flex items-center gap-2">
          {/* MacOS dots decoration */}
          <div className="flex items-center gap-1 mr-3">
            <span className="w-2 h-2 rounded-full bg-red-500/60" />
            <span className="w-2 h-2 rounded-full bg-amber-500/60" />
            <span className="w-2 h-2 rounded-full bg-emerald-500/60" />
          </div>
          <h2 className="text-[10px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em] flex items-center gap-2">
            <span className="w-0.5 h-3 bg-fuchsia-500 rounded-full" />
            PREDICTION HISTORY
          </h2>
        </div>
        <span className="text-[9px] font-mono text-zinc-600 tabular-nums">{total} RECORDS</span>
      </div>

      <div className="relative z-10 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.15em] border-b border-white/[0.04]">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">DIR</th>
              <th className="px-4 py-3">STR</th>
              <th className="px-4 py-3">ENTRY</th>
              <th className="px-4 py-3">SETTLE</th>
              <th className="px-4 py-3">RESULT</th>
              <th className="px-4 py-3">TIME</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-600 font-mono text-sm">
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    LOADING...
                  </motion.span>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-600 font-mono text-sm">
                  NO PREDICTIONS YET
                </td>
              </tr>
            ) : (
              <AnimatePresence mode="popLayout">
                {records.map((r, idx) => (
                  <motion.tr
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.02, duration: 0.25 }}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] hover:border-l-[3px] hover:border-l-[#00E5FF]/40 transition-all group"
                  >
                    <td className="px-4 py-3 text-[11px] font-mono text-zinc-600 tabular-nums group-hover:text-zinc-400">
                      {r.round_num}
                    </td>
                    <td className="px-4 py-3">
                      {r.direction ? (
                        <span className={`text-[11px] font-mono font-black flex items-center gap-1 ${
                          r.direction === "up"
                            ? "text-[#00E5FF] drop-shadow-[0_0_6px_rgba(0,229,255,0.4)]"
                            : "text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.4)]"
                        }`}>
                          {r.direction === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {r.direction.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-zinc-600">SKIP</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-zinc-400 tabular-nums">
                      {(r.strength * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-zinc-300 tabular-nums">
                      ${r.entry_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-zinc-300 tabular-nums">
                      {r.settle_price
                        ? `$${r.settle_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ResultBadge result={r.result} status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-[9px] font-mono text-zinc-600 tabular-nums">
                      {r.predict_time ? new Date(r.predict_time).toLocaleString() : "—"}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="relative z-10 px-5 py-3 border-t border-white/[0.04] flex items-center justify-center gap-3">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-mono font-bold text-zinc-400 border border-white/[0.08] rounded-lg hover:bg-white/[0.04] hover:border-[#00E5FF]/20 hover:text-[#00E5FF] disabled:opacity-20 transition-all"
          >
            <ChevronLeft size={12} /> PREV
          </button>
          <span className="text-[10px] font-mono font-bold text-zinc-500 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-mono font-bold text-zinc-400 border border-white/[0.08] rounded-lg hover:bg-white/[0.04] hover:border-[#00E5FF]/20 hover:text-[#00E5FF] disabled:opacity-20 transition-all"
          >
            NEXT <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Result Badge ─────────────────────────────────────────

function ResultBadge({ result, status }: { result: string | null; status: string }) {
  if (result === "win") {
    return (
      <span className="text-[9px] font-mono font-black text-[#00E5FF] px-2 py-0.5 rounded-md bg-[#00E5FF]/[0.08] border border-[#00E5FF]/20 drop-shadow-[0_0_6px_rgba(0,229,255,0.3)] tracking-widest">
        ✓ WIN
      </span>
    );
  }
  if (result === "lose") {
    return (
      <span className="text-[9px] font-mono font-black text-red-400 px-2 py-0.5 rounded-md bg-red-500/[0.08] border border-red-500/20 drop-shadow-[0_0_6px_rgba(248,113,113,0.3)] tracking-widest">
        ✗ LOSE
      </span>
    );
  }
  if (status === "pending") {
    return (
      <motion.span
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-[9px] font-mono font-black text-amber-400 px-2 py-0.5 rounded-md bg-amber-500/[0.08] border border-amber-500/20 tracking-widest"
      >
        ⏳ WAIT
      </motion.span>
    );
  }
  return (
    <span className="text-[9px] font-mono font-bold text-zinc-600 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.06] tracking-widest">
      ⏸ SKIP
    </span>
  );
}
