"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchPredictorStatus,
  fetchEventStats,
  startPredictor,
  stopPredictor,
  type EventPredictorStatus,
  type EventStatsResponse,
} from "@/lib/api/event-contracts";
import {
  Zap,
  Play,
  Square,
  Activity,
  BarChart3,
  Clock,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SYMBOLS = ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

export default function AdminEventContractsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSymbol, setSelectedSymbol] = useState("ETHUSDT");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // ── 查询 ──────────────────────────────────────────────
  const { data: status, isLoading: statusLoading } = useQuery<EventPredictorStatus>({
    queryKey: ["predictor-status"],
    queryFn: fetchPredictorStatus,
    refetchInterval: 5_000,
  });

  const { data: stats } = useQuery<EventStatsResponse>({
    queryKey: ["event-stats-admin", selectedSymbol],
    queryFn: () => fetchEventStats(selectedSymbol),
    refetchInterval: 30_000,
  });

  // ── 操作 ──────────────────────────────────────────────
  const showToast = useCallback((type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleStart = useCallback(async () => {
    setActionLoading(true);
    try {
      await startPredictor(selectedSymbol);
      showToast("ok", `预测器已启动 (${selectedSymbol})`);
      queryClient.invalidateQueries({ queryKey: ["predictor-status"] });
    } catch (e: any) {
      showToast("err", e.message || "启动失败");
    } finally {
      setActionLoading(false);
    }
  }, [selectedSymbol, showToast, queryClient]);

  const handleStop = useCallback(async () => {
    setActionLoading(true);
    try {
      await stopPredictor();
      showToast("ok", "预测器已停止");
      queryClient.invalidateQueries({ queryKey: ["predictor-status"] });
    } catch (e: any) {
      showToast("err", e.message || "停止失败");
    } finally {
      setActionLoading(false);
    }
  }, [showToast, queryClient]);

  if (!user || user.role !== "admin") return null;

  const isRunning = status?.running ?? false;
  const metricsReady = !!(status?.current_metrics && (status.current_metrics as any)?.current_price);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg border text-sm font-mono font-bold shadow-2xl backdrop-blur-xl ${
              toast.type === "ok"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-6 overflow-hidden">
        <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[250px] h-[250px] rounded-full bg-amber-500/[0.04] blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 shadow-[0_0_15px_rgba(251,191,36,0.1)]">
              <Zap className="text-amber-400" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">事件合约管理</h1>
              <p className="text-xs text-zinc-500 font-mono">Event Contract Predictor · Admin Control</p>
            </div>
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-2">
            <motion.span
              className={`h-2.5 w-2.5 rounded-full ${
                isRunning
                  ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,1)]"
                  : "bg-zinc-600"
              }`}
              animate={isRunning ? { opacity: [1, 0.3, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className={`text-xs font-mono font-bold uppercase tracking-widest ${
              isRunning ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "text-zinc-500"
            }`}>
              {statusLoading ? "LOADING..." : isRunning ? "RUNNING" : "STOPPED"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Control Panel ── */}
      <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-6 overflow-hidden">
        <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />

        <div className="relative z-10 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-4 bg-[#00E5FF] rounded-full" />
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">控制面板</h2>
          </div>

          {/* Symbol selector + Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Symbol选择 */}
            <div className="flex-1">
              <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">
                交易对 · SYMBOL
              </label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                disabled={isRunning}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 font-mono outline-none focus:border-[#00E5FF]/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {isRunning && (
                <p className="text-[9px] font-mono text-zinc-600 mt-1">
                  运行中无法切换交易对，请先停止
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-end gap-3">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-sm hover:bg-emerald-500/20 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(52,211,153,0.1)] hover:shadow-[0_0_25px_rgba(52,211,153,0.2)]"
                >
                  {actionLoading ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                  启动预测器
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/20 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:shadow-[0_0_25px_rgba(239,68,68,0.2)]"
                >
                  {actionLoading ? <RefreshCw size={16} className="animate-spin" /> : <Square size={16} />}
                  停止预测器
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Runtime Status ── */}
      {isRunning && status && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <StatusCard
            icon={<TrendingUp size={14} />}
            label="交易对"
            value={status.symbol || "—"}
            color="text-[#00E5FF]"
          />
          <StatusCard
            icon={<Activity size={14} />}
            label="数据流"
            value={status.aggregator_running ? "已连接" : "断开"}
            color={status.aggregator_running ? "text-emerald-400" : "text-red-400"}
          />
          <StatusCard
            icon={<BarChart3 size={14} />}
            label="当前价格"
            value={
              metricsReady
                ? `$${Number((status.current_metrics as any).current_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                : "预热中"
            }
            color={metricsReady ? "text-white" : "text-amber-400"}
          />
          <StatusCard
            icon={<Clock size={14} />}
            label="数据点"
            value={
              metricsReady
                ? `${(status.current_metrics as any).trade_count_30s || 0} trades/30s`
                : "—"
            }
            color="text-zinc-300"
          />
        </motion.div>
      )}

      {/* ── Stats Overview ── */}
      {stats && (
        <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-6 overflow-hidden">
          <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-1 h-4 bg-fuchsia-500 rounded-full" />
              <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">胜率统计</h2>
              <span className="text-[9px] font-mono text-zinc-600 ml-auto">{selectedSymbol}</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {([
                { key: "today" as const, label: "今日" },
                { key: "7d" as const, label: "7日" },
                { key: "30d" as const, label: "30日" },
                { key: "all_time" as const, label: "全部" },
              ] as const).map(({ key, label }) => {
                const d = stats[key];
                const hasData = d.decided > 0;
                const rateColor = !hasData
                  ? "text-zinc-600"
                  : d.win_rate >= 60
                  ? "text-[#00E5FF] drop-shadow-[0_0_12px_rgba(0,229,255,0.5)]"
                  : d.win_rate >= 50
                  ? "text-amber-400"
                  : "text-red-400";

                return (
                  <div key={key} className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-4">
                    <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">{label}</p>
                    <p className={`text-2xl font-black font-mono tabular-nums ${rateColor}`}>
                      {hasData ? `${d.win_rate}%` : "—"}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-600 mt-1">
                      <span className="text-emerald-400">{d.wins}W</span> / <span className="text-red-400">{d.losses}L</span> · {d.total}轮
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 使用说明 ── */}
      <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-5 overflow-hidden">
        <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={12} className="text-amber-400" />
            <h3 className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest">注意事项</h3>
          </div>
          <ul className="text-xs text-zinc-500 space-y-1.5 font-mono leading-relaxed">
            <li>• 启动后需约 <span className="text-zinc-300">30 秒</span> 预热期采集足够数据</li>
            <li>• 每 <span className="text-zinc-300">10 分钟</span> 自动生成一次预测并在到期后自动结算</li>
            <li>• 前端面板入口: <span className="text-[#00E5FF]">侧边栏 → 事件合约</span></li>
            <li>• 需确保服务器可访问 <span className="text-zinc-300">币安 WebSocket</span>（代理配置环境变量 <code className="text-zinc-400">HTTPS_PROXY</code>）</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Status Card ─────────────────────────────────────────

function StatusCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-4 overflow-hidden group hover:border-[#00E5FF]/20 transition-colors">
      <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center gap-1.5 text-zinc-500 mb-2">
          {icon}
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest">{label}</span>
        </div>
        <p className={`text-lg font-bold font-mono tabular-nums ${color}`}>{value}</p>
      </div>
    </div>
  );
}
