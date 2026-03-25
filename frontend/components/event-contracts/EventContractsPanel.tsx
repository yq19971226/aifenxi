"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Pause,
  Play,
  Square,
  Activity,
  BarChart3,
  Clock,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "next-intl";
import { useBinancePrice } from "@/lib/hooks/useBinancePrice";
import {
  fetchEventLive,
  fetchEventHistory,
  fetchEventStats,
  startPredictor,
  stopPredictor,
  type EventLiveSignal,
  type EventHistoryRecord,
  type EventStatsResponse,
} from "@/lib/api/event-contracts";

// ── 常量 ──────────────────────────────────────────────────
const POLL_INTERVAL = 10000;

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
  const { user } = useAuth();
  const t = useTranslations("eventContracts");
  const isAdmin = user?.role === "admin";
  const [live, setLive] = useState<EventLiveSignal | null>(null);
  const [history, setHistory] = useState<EventHistoryRecord[]>([]);
  const [stats, setStats] = useState<EventStatsResponse | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 币安 WebSocket 实时价格（< 1s 延迟）
  const { price: wsPrice, connected: wsConnected } = useBinancePrice("ethusdt");

  // Admin state
  const [selectedSymbol, setSelectedSymbol] = useState("ETHUSDT");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const showToast = useCallback((type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleStart = useCallback(async () => {
    setActionLoading(true);
    try {
      await startPredictor(selectedSymbol);
      showToast("ok", `${t("admin.predictorStarted")} (${selectedSymbol})`);
    } catch (e: any) {
      showToast("err", e.message || t("admin.startFailed"));
    } finally {
      setActionLoading(false);
    }
  }, [selectedSymbol, showToast, t]);

  const handleStop = useCallback(async () => {
    setActionLoading(true);
    try {
      await stopPredictor();
      showToast("ok", t("admin.predictorStopped"));
    } catch (e: any) {
      showToast("err", e.message || t("admin.stopFailed"));
    } finally {
      setActionLoading(false);
    }
  }, [showToast, t]);

  // 用 ref 记录上次数据的 JSON，只在数据实际变化时才 setState，避免无意义 re-render
  const prevLiveJson = useRef("");
  const prevHistJson = useRef("");
  const prevStatsJson = useRef("");
  const initialLoaded = useRef(false);

  const pollLive = useCallback(async () => {
    try {
      const data = await fetchEventLive();
      const json = JSON.stringify(data);
      if (json !== prevLiveJson.current) {
        prevLiveJson.current = json;
        setLive(data);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to fetch live signal");
    }
  }, []);

  // silent=true 时后台静默刷新，不触发 loading 状态
  const loadData = useCallback(async (p = 1, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [histData, statsData] = await Promise.all([
        fetchEventHistory("ETHUSDT", p, 20),
        fetchEventStats("ETHUSDT"),
      ]);
      const hJson = JSON.stringify(histData.records);
      const sJson = JSON.stringify(statsData);
      if (hJson !== prevHistJson.current) {
        prevHistJson.current = hJson;
        setHistory(histData.records);
        setHistoryTotal(histData.total);
      }
      if (sJson !== prevStatsJson.current) {
        prevStatsJson.current = sJson;
        setStats(statsData);
      }
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 首次加载：显示 loading 状态
    pollLive();
    loadData(1, false).then(() => { initialLoaded.current = true; });
    // 后续轮询：静默更新，不闪烁
    timerRef.current = setInterval(pollLive, POLL_INTERVAL);
    const histTimer = setInterval(() => loadData(page, true), 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(histTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (p: number) => {
    setPage(p);
    loadData(p);
  };

  const isOnline = live?.status === "online";

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
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
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-6 lg:p-8">
        <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-[#00E5FF]/[0.04] blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[200px] h-[200px] rounded-full bg-amber-500/[0.03] blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              <span className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]">
                {t("subtitle")}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {t("title")}
            </h1>
            <p className="text-zinc-500 text-sm font-mono mt-1 max-w-lg">
              {t("description")}
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
              {live?.status === "online" ? t("status.online") : live?.status === "warming_up" ? t("status.warmingUp") : t("status.offline")}
            </span>
          </div>
        </div>

        {/* ── Admin Controls ── */}
        {isAdmin && (
          <div className="relative z-10 mt-5 pt-5 border-t border-white/[0.06] flex items-center gap-3 flex-wrap">
            <span className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-[0.2em] mr-1">ADMIN</span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-[#00E5FF]/40 transition-colors"
            >
              {["ETHUSDT", "BTCUSDT", "BNBUSDT", "SOLUSDT", "DOGEUSDT"].map((s) => (
                <option key={s} value={s} className="bg-[#0a0d14] text-zinc-300">{s}</option>
              ))}
            </select>
            {isOnline ? (
              <button
                onClick={handleStop}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-all"
              >
                {actionLoading ? <RefreshCw size={12} className="animate-spin" /> : <Square size={12} />}
                {t("admin.stopPredictor")}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-all"
              >
                {actionLoading ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                {t("admin.startPredictor")}
              </button>
            )}
          </div>
        )}
      </motion.div>

      {error && (
        <motion.div variants={itemVariants} className="rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl px-5 py-3 text-red-400 text-sm font-mono flex items-center gap-2">
          <ShieldCheck size={14} className="text-red-400 shrink-0" />
          {error}
        </motion.div>
      )}

      {/* ── Live Signal Panel ── */}
      <motion.div variants={itemVariants}>
        <LiveSignalPanel live={live} isAdmin={isAdmin} onStart={handleStart} actionLoading={actionLoading} wsPrice={wsPrice} wsConnected={wsConnected} />
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

// ── 倒计时 Hook ───────────────────────────────────────────

function useCountdown(expireTimeIso: string | undefined) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!expireTimeIso) { setRemaining(0); return; }
    const target = new Date(expireTimeIso).getTime();

    function tick() {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setRemaining(diff);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expireTimeIso]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  return { remaining, display: `${mm}:${ss}` };
}

// ── 实时信号面板 ──────────────────────────────────────────

function LiveSignalPanel({ live, isAdmin, onStart, actionLoading, wsPrice, wsConnected }: {
  live: EventLiveSignal | null;
  isAdmin: boolean;
  onStart: () => void;
  actionLoading: boolean;
  wsPrice: number | null;
  wsConnected: boolean;
}) {
  const t = useTranslations("eventContracts");
  const countdown = useCountdown(live?.round_expire_time);

  if (!live || live.status !== "online") {
    return (
      <div className="relative rounded-xl border border-white/[0.06] bg-[#0a0d14]/90 backdrop-blur-3xl p-12 text-center overflow-hidden">
        <div className="absolute inset-0 bg-scanline opacity-[0.03] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full bg-zinc-500/[0.05] blur-[60px]" />
        <div className="relative z-10">
          <Pause size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500 font-mono text-sm">
            {live?.status === "warming_up" ? t("offline.warmingUp") : t("offline.notRunning")}
          </p>
          {isAdmin && !live?.status?.includes("warming") && (
            <button
              onClick={onStart}
              disabled={actionLoading}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)] disabled:opacity-40 transition-all"
            >
              {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {t("offline.clickToStart")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const pred = live.prediction;
  const isUp = pred?.direction === "up";
  const isDown = pred?.direction === "down";
  const strengthPct = ((pred?.strength || 0) * 100).toFixed(0);

  // 优先使用 WebSocket 实时价格，回退到轮询价格
  const displayPrice = wsPrice ?? live.current_price;

  // Neon color scheme per direction
  const neonColor = isUp
    ? { text: "text-[#00E5FF]", glow: "drop-shadow-[0_0_15px_rgba(0,229,255,0.6)]", bar: "bg-[#00E5FF]", bg: "bg-[#00E5FF]/[0.04]", border: "border-[#00E5FF]/20" }
    : isDown
    ? { text: "text-red-400", glow: "drop-shadow-[0_0_15px_rgba(248,113,113,0.6)]", bar: "bg-red-400", bg: "bg-red-400/[0.04]", border: "border-red-400/20" }
    : { text: "text-zinc-400", glow: "", bar: "bg-zinc-500", bg: "bg-zinc-500/[0.04]", border: "border-zinc-500/20" };

  const DirIcon = isUp ? TrendingUp : isDown ? TrendingDown : Pause;
  const dirLabel = isUp ? t("live.bullish") : isDown ? t("live.bearish") : t("live.watching");

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
        {/* Centered direction + price + countdown + strength */}
        <div className="flex flex-col items-center text-center space-y-6 max-w-md mx-auto">

          {/* Direction */}
          <div>
            <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 flex items-center justify-center gap-1.5">
              <span className="w-1 h-3 bg-amber-500 rounded-full" />
              {t("live.predictionDirection")}
            </p>
            <div className="flex items-center justify-center gap-4">
              <motion.div
                className={`p-3 rounded-xl ${neonColor.bg} border ${neonColor.border}`}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <DirIcon size={32} className={`${neonColor.text} ${neonColor.glow}`} />
              </motion.div>
              <p className={`text-3xl font-black font-mono tracking-tight ${neonColor.text} ${neonColor.glow}`}>
                {dirLabel}
              </p>
            </div>
          </div>

          {/* Price — real-time via Binance WebSocket */}
          <div>
            <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 flex items-center justify-center gap-2">
              {t("live.currentPrice")}
              {wsConnected && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t("live.realtime")}
                </span>
              )}
            </p>
            <p className="text-4xl font-black font-mono text-white tabular-nums tracking-tight">
              <span className="text-fuchsia-400/60 text-xl mr-0.5">$</span>
              {displayPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Round countdown */}
          {live.round_expire_time && (
            <div>
              <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 flex items-center justify-center gap-1.5">
                <Clock size={10} className="text-zinc-500" />
                {t("live.roundExpiry")}
              </p>
              <p className={`text-2xl font-black font-mono tabular-nums tracking-tight ${
                countdown.remaining <= 0
                  ? "text-zinc-500"
                  : countdown.remaining <= 60
                  ? "text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.5)]  animate-pulse"
                  : "text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.4)]"
              }`}>
                {countdown.remaining <= 0 ? t("live.expired") : countdown.display}
              </p>
            </div>
          )}

          {/* Strength bar */}
          <div className="w-full">
            <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2">
              {t("live.signalStrength")}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 rounded-full bg-white/[0.04] overflow-hidden border border-white/[0.06]">
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

        <p className="text-[9px] font-mono text-zinc-600 mt-6 text-center tabular-nums">
          {t("live.lastUpdated")}: {live.updated_at ? new Date(live.updated_at).toLocaleTimeString() : "—"}
        </p>
      </div>
    </div>
  );
}


// ── 统计面板 ─────────────────────────────────────────────

function StatsPanel({ stats }: { stats: EventStatsResponse }) {
  const t = useTranslations("eventContracts");

  const periods = [
    { key: "today" as const, label: t("stats.today"), icon: Clock },
    { key: "7d" as const, label: t("stats.7d"), icon: Activity },
    { key: "30d" as const, label: t("stats.30d"), icon: BarChart3 },
    { key: "all_time" as const, label: t("stats.allTime"), icon: Zap },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {periods.map(({ key, label, icon: Icon }, idx) => {
        const d = stats[key];
        const rate = d.win_rate ?? 0;
        const hasData = d.decided > 0;
        const rateColor = !hasData
          ? "text-zinc-400"
          : rate >= 60
          ? "text-[#00E5FF] drop-shadow-[0_0_15px_rgba(0,229,255,0.6)] glow-cyan"
          : rate >= 50
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
              <div className="flex items-center gap-2 mb-4">
                <Icon size={12} className="text-zinc-400" />
                <p className="text-xs font-mono font-black text-zinc-400 uppercase tracking-[0.15em]">{label}</p>
              </div>
              <p className={`text-3xl font-black font-mono tabular-nums ${rateColor}`}>
                {rate}%
              </p>
              <div className="mt-3 space-y-1">
                <p className="text-xs font-mono text-zinc-400">
                  <span className="text-emerald-400 font-bold">{d.wins}</span>
                  <span className="text-zinc-400 mx-1">{t("stats.wins")}</span>
                  <span className="text-zinc-500">/</span>
                  <span className="text-red-400 font-bold ml-1">{d.losses}</span>
                  <span className="text-zinc-400 mx-1">{t("stats.losses")}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400 font-bold ml-1">{d.skipped}</span>
                  <span className="text-zinc-400 ml-1">{t("stats.skipped")}</span>
                </p>
                <p className="text-[11px] font-mono text-zinc-500">
                  {t("stats.totalRounds", { count: d.total })}
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
  const t = useTranslations("eventContracts");
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
            {t("history.title")}
          </h2>
        </div>
        <span className="text-[9px] font-mono text-zinc-600 tabular-nums">{t("history.totalRecords", { count: total })}</span>
      </div>

      <div className="relative z-10 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-[0.15em] border-b border-white/[0.04]">
              <th className="px-4 py-3">{t("history.round")}</th>
              <th className="px-4 py-3">{t("history.direction")}</th>
              <th className="px-4 py-3">{t("history.strength")}</th>
              <th className="px-4 py-3">{t("history.entryPrice")}</th>
              <th className="px-4 py-3">{t("history.settlePrice")}</th>
              <th className="px-4 py-3">{t("history.result")}</th>
              <th className="px-4 py-3">{t("history.time")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-600 font-mono text-sm">
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    {t("history.loading")}
                  </motion.span>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-600 font-mono text-sm">
                  {t("history.noRecords")}
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
                          {r.direction === "up" ? t("directions.up") : t("directions.down")}
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-zinc-600">{t("directions.skip")}</span>
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
            <ChevronLeft size={12} /> {t("history.prevPage")}
          </button>
          <span className="text-[10px] font-mono font-bold text-zinc-500 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-mono font-bold text-zinc-400 border border-white/[0.08] rounded-lg hover:bg-white/[0.04] hover:border-[#00E5FF]/20 hover:text-[#00E5FF] disabled:opacity-20 transition-all"
          >
            {t("history.nextPage")} <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Result Badge ─────────────────────────────────────────

function ResultBadge({ result, status }: { result: string | null; status: string }) {
  const t = useTranslations("eventContracts");

  if (result === "win") {
    return (
      <span className="text-[9px] font-mono font-black text-[#00E5FF] px-2 py-0.5 rounded-md bg-[#00E5FF]/[0.08] border border-[#00E5FF]/20 drop-shadow-[0_0_6px_rgba(0,229,255,0.3)] tracking-widest">
        {t("results.win")}
      </span>
    );
  }
  if (result === "lose") {
    return (
      <span className="text-[9px] font-mono font-black text-red-400 px-2 py-0.5 rounded-md bg-red-500/[0.08] border border-red-500/20 drop-shadow-[0_0_6px_rgba(248,113,113,0.3)] tracking-widest">
        {t("results.lose")}
      </span>
    );
  }
  if (result === "draw") {
    return (
      <span className="text-[9px] font-mono font-black text-amber-300 px-2 py-0.5 rounded-md bg-amber-500/[0.08] border border-amber-500/20 tracking-widest">
        {t("results.draw")}
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
        {t("results.pending")}
      </motion.span>
    );
  }
  return (
    <span className="text-[9px] font-mono font-bold text-zinc-600 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.06] tracking-widest">
      {t("results.skipped")}
    </span>
  );
}
