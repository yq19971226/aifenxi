"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchEventLive,
  fetchEventHistory,
  fetchEventStats,
  type EventLiveSignal,
  type EventHistoryRecord,
  type EventStatsResponse,
} from "@/lib/api/event-contracts";

// ── 辅助常量 ──────────────────────────────────────────────
const POLL_INTERVAL = 2000; // 2 秒轮询实时信号

// ── 页面组件 ──────────────────────────────────────────────
export default function EventContractsPage() {
  const [live, setLive] = useState<EventLiveSignal | null>(null);
  const [history, setHistory] = useState<EventHistoryRecord[]>([]);
  const [stats, setStats] = useState<EventStatsResponse | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── 拉取实时信号 ──
  const pollLive = useCallback(async () => {
    try {
      const data = await fetchEventLive();
      setLive(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || "获取实时信号失败");
    }
  }, []);

  // ── 拉取历史 & 统计 ──
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
    // 每 30 秒刷新历史
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
    <div className="min-h-screen bg-black text-white font-sans selection:bg-indigo-500/30">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* ── 标题 ── */}
        <div className="flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 border-l-2 border-amber-500 bg-amber-500/10 text-[10px] font-mono text-amber-400 mb-3 uppercase tracking-[0.2em]">
              <span className="relative flex h-1.5 w-1.5">
                <span className={`animate-ping absolute inline-flex h-full w-full ${live?.status === "online" ? "bg-emerald-400" : "bg-zinc-400"} opacity-75`} />
                <span className={`relative inline-flex h-1.5 w-1.5 ${live?.status === "online" ? "bg-emerald-500" : "bg-zinc-500"}`} />
              </span>
              {live?.status === "online" ? "实时运行" : live?.status === "warming_up" ? "预热中" : "离线"}
            </div>
            <h1 className="text-3xl font-black tracking-tight uppercase">
              事件合约预测
            </h1>
            <p className="text-zinc-500 text-sm font-mono mt-1">
              10 分钟事件合约 · 订单流 + 技术指标规则引擎 · 自动预测 & 结算
            </p>
          </div>
        </div>

        {error && (
          <div className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm font-mono">
            {error}
          </div>
        )}

        {/* ── 实时信号面板 ── */}
        <LiveSignalPanel live={live} />

        {/* ── 胜率统计 ── */}
        {stats && <StatsPanel stats={stats} />}

        {/* ── 预测历史 ── */}
        <HistoryTable
          records={history}
          total={historyTotal}
          page={page}
          onPageChange={handlePageChange}
          loading={loading}
        />
      </main>
    </div>
  );
}

// ── 实时信号面板 ──────────────────────────────────────────

function LiveSignalPanel({ live }: { live: EventLiveSignal | null }) {
  if (!live || live.status !== "online") {
    return (
      <div className="border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-zinc-500 font-mono text-sm">
          {live?.status === "warming_up" ? "⏳ 数据预热中，请等待约 30 秒..." : "⚫ 预测器当前未运行"}
        </p>
      </div>
    );
  }

  const pred = live.prediction;
  const metrics = live.metrics;
  const dirColor = pred?.direction === "up" ? "emerald" : pred?.direction === "down" ? "red" : "zinc";
  const dirLabel = pred?.direction === "up" ? "📈 看涨" : pred?.direction === "down" ? "📉 看跌" : "⏸ 观望";
  const strengthPct = ((pred?.strength || 0) * 100).toFixed(0);

  return (
    <div className="border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* 顶部方向条 */}
      <div className={`h-1 bg-${dirColor}-500`} />

      <div className="p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左: 方向 + 价格 */}
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">当前预测</p>
              <p className={`text-3xl font-black text-${dirColor}-400`}>
                {dirLabel}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">当前价格</p>
              <p className="text-2xl font-black text-white font-mono">
                ${live.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">信号强度</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full bg-${dirColor}-500 transition-all duration-500`}
                    style={{ width: `${strengthPct}%` }}
                  />
                </div>
                <span className="text-sm font-mono text-zinc-400">{strengthPct}%</span>
              </div>
            </div>
          </div>

          {/* 中: 主信号 */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-0.5 h-3 bg-indigo-500" />
              主信号 (订单流)
            </p>
            <MetricRow
              label="买/卖比 (30s)"
              value={metrics?.buy_sell_ratio_30s}
              format={(v) => v.toFixed(2)}
              bullish={v => v > 1.3}
              bearish={v => v < 0.77}
            />
            <MetricRow
              label="订单簿失衡"
              value={metrics?.orderbook_imbalance}
              format={(v) => `${(v * 100).toFixed(1)}%`}
              bullish={v => v > 0.2}
              bearish={v => v < -0.2}
            />
            <MetricRow
              label="大单净流向"
              value={metrics?.large_order_flow}
              format={(v) => `$${Math.abs(v).toLocaleString()}`}
              bullish={v => v > 0}
              bearish={v => v < 0}
              prefix={metrics?.large_order_flow && metrics.large_order_flow > 0 ? "+" : ""}
            />
            <MetricRow
              label="成交笔数"
              value={metrics?.trade_count_30s}
              format={(v) => v.toString()}
            />
          </div>

          {/* 右: 辅助信号 */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-0.5 h-3 bg-amber-500" />
              辅助信号 (技术指标)
            </p>
            <MetricRow
              label="RSI(14)"
              value={metrics?.rsi_1m}
              format={(v) => v.toFixed(1)}
              bullish={v => v > 55}
              bearish={v => v < 45}
            />
            <MetricRow
              label="EMA5 vs EMA10"
              value={metrics?.ema5_vs_ema10}
              format={(v) => v.toFixed(4)}
              bullish={v => v > 0}
              bearish={v => v < 0}
            />
            <MetricRow
              label="成交量比"
              value={metrics?.volume_ratio}
              format={(v) => `${v.toFixed(2)}x`}
              bullish={v => v > 1.5}
            />
          </div>
        </div>

        {/* 信号明细 */}
        {pred?.signals && pred.signals.length > 0 && (
          <div className="mt-6 pt-4 border-t border-white/[0.05]">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">触发信号</p>
            <div className="flex flex-wrap gap-2">
              {pred.signals.map((s, i) => (
                <span
                  key={i}
                  className={`text-[10px] font-mono px-2 py-0.5 border ${
                    s.includes("bullish")
                      ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                      : s.includes("bearish")
                      ? "text-red-400 border-red-500/20 bg-red-500/10"
                      : "text-zinc-400 border-white/10 bg-white/5"
                  }`}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-[9px] font-mono text-zinc-600 mt-4">
          最后更新: {live.updated_at ? new Date(live.updated_at).toLocaleTimeString() : "-"}
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
      <div className="flex justify-between items-center py-1">
        <span className="text-[11px] font-mono text-zinc-500">{label}</span>
        <span className="text-[11px] font-mono text-zinc-600">-</span>
      </div>
    );
  }

  const isBull = bullish?.(value);
  const isBear = bearish?.(value);
  const color = isBull ? "text-emerald-400" : isBear ? "text-red-400" : "text-zinc-300";

  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[11px] font-mono text-zinc-500">{label}</span>
      <span className={`text-[13px] font-mono font-bold ${color}`}>
        {prefix}{format(value)}
        {isBull && " ▲"}
        {isBear && " ▼"}
      </span>
    </div>
  );
}

// ── 统计面板 ─────────────────────────────────────────────

function StatsPanel({ stats }: { stats: EventStatsResponse }) {
  const periods = [
    { key: "today" as const, label: "今日" },
    { key: "7d" as const, label: "7天" },
    { key: "30d" as const, label: "30天" },
    { key: "all_time" as const, label: "总计" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {periods.map(({ key, label }) => {
        const d = stats[key];
        const rateColor = d.win_rate >= 60 ? "text-emerald-400" : d.win_rate >= 50 ? "text-amber-400" : "text-red-400";
        return (
          <div key={key} className="border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">{label}</p>
            <p className={`text-3xl font-black font-mono ${rateColor}`}>
              {d.decided > 0 ? `${d.win_rate}%` : "-"}
            </p>
            <p className="text-[10px] font-mono text-zinc-600 mt-2">
              {d.wins}胜 / {d.losses}败 · {d.skipped}跳过
            </p>
            <p className="text-[10px] font-mono text-zinc-700">
              共 {d.total} 轮
            </p>
          </div>
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
    <div className="border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between">
        <h2 className="text-[10px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em] flex items-center gap-2">
          <span className="w-0.5 h-3 bg-indigo-500" />
          预测历史
        </h2>
        <span className="text-[10px] font-mono text-zinc-600">共 {total} 条</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/[0.04]">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">方向</th>
              <th className="px-4 py-3">强度</th>
              <th className="px-4 py-3">入场价</th>
              <th className="px-4 py-3">结算价</th>
              <th className="px-4 py-3">结果</th>
              <th className="px-4 py-3">时间</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600 font-mono text-sm">
                  加载中...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600 font-mono text-sm">
                  暂无预测记录
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono text-zinc-500">
                    {r.round_num}
                  </td>
                  <td className="px-4 py-3">
                    {r.direction ? (
                      <span className={`text-[11px] font-mono font-bold ${r.direction === "up" ? "text-emerald-400" : "text-red-400"}`}>
                        {r.direction === "up" ? "📈 UP" : "📉 DOWN"}
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-zinc-600">⏸ SKIP</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-zinc-400">
                    {(r.strength * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-zinc-300">
                    ${r.entry_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-zinc-300">
                    {r.settle_price
                      ? `$${r.settle_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {r.result === "win" && (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20">
                        ✓ WIN
                      </span>
                    )}
                    {r.result === "lose" && (
                      <span className="text-[10px] font-mono font-bold text-red-400 px-2 py-0.5 bg-red-500/10 border border-red-500/20">
                        ✗ LOSE
                      </span>
                    )}
                    {!r.result && r.status === "pending" && (
                      <span className="text-[10px] font-mono text-amber-400 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20">
                        ⏳ 等待
                      </span>
                    )}
                    {!r.result && r.status === "skipped" && (
                      <span className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 bg-white/5 border border-white/10">
                        ⏸ 跳过
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[10px] font-mono text-zinc-600">
                    {r.predict_time ? new Date(r.predict_time).toLocaleString() : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-white/[0.04] flex items-center justify-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-1 text-[10px] font-mono text-zinc-400 border border-white/10 hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            ← 上一页
          </button>
          <span className="text-[10px] font-mono text-zinc-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-[10px] font-mono text-zinc-400 border border-white/10 hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}
