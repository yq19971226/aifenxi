"use client";

import { useState } from "react";
import { ChevronDown, Info, User } from "lucide-react";
import type { StrategyHistoryItem, MyStats } from "@/lib/api/leaderboard";
import { formatPnl, formatPF, StatCell, Pagination } from "./components";

// ── My Stats Card ────────────────────────────────────────────

export function MyStatsCard({
  stats,
  rank,
}: {
  stats: MyStats;
  rank: number | null;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <User size={14} className="text-indigo-400" />
        <span className="text-xs font-medium text-zinc-400">我的战绩</span>
        <span className="text-xs font-mono text-zinc-500 ml-auto">
          {stats.anonymous_id}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <StatCell
          label="排名"
          value={rank ? `#${rank}` : "未上榜"}
          valueClass={rank ? "text-amber-400" : "text-zinc-500"}
        />
        <StatCell
          label="已发布"
          value={String(stats.total_published)}
        />
        <StatCell
          label="待结算"
          value={String(stats.pending)}
          valueClass={stats.pending > 0 ? "text-amber-400" : "text-zinc-500"}
        />
        <StatCell label="胜/负" value={`${stats.wins} / ${stats.losses}`} />
        <StatCell
          label="平均盈亏"
          value={formatPnl(stats.avg_pnl)}
          valueClass={stats.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatCell
          label="PF"
          value={formatPF(stats.profit_factor)}
          valueClass="text-emerald-400"
        />
      </div>
      {stats.settled < 3 && (
        <p className="text-xs text-zinc-500 mt-3">
          至少 3 条已结算策略才可上榜（当前 {stats.settled} 条）
        </p>
      )}
    </div>
  );
}

// ── Strategy History ─────────────────────────────────────────

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  pending: { text: "待结算", cls: "text-amber-400" },
  win: { text: "盈利", cls: "text-emerald-400" },
  loss: { text: "亏损", cls: "text-red-400" },
  expired: { text: "已过期", cls: "text-zinc-500" },
};

const MODE_LABELS: Record<string, string> = {
  intraday: "日内",
  trend: "趋势",
  scalping: "超短线",
};

export function StrategyHistory({
  items,
  total,
  page,
  pageSize,
  onPageChange,
}: {
  items: StrategyHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-xs text-zinc-500">暂无已发布策略记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-xs md:text-sm text-zinc-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">币种</th>
              <th className="px-4 py-3 text-left font-medium">方向</th>
              <th className="px-4 py-3 text-right font-medium">入场价</th>
              <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">止损</th>
              <th className="px-4 py-3 text-center font-medium">状态</th>
              <th className="px-4 py-3 text-right font-medium">盈亏</th>
              <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">模式</th>
              <th className="px-4 py-3 text-right font-medium hidden md:table-cell">时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {items.map((item) => {
              const st = STATUS_LABELS[item.status] ?? { text: item.status, cls: "text-zinc-400" };
              return (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white">
                    {item.symbol.replace("USDT", "")}
                  </td>
                  <td className="px-4 py-3 text-xs md:text-sm">
                    <span className={item.direction === "long" ? "text-emerald-400" : item.direction === "short" ? "text-red-400" : "text-zinc-500"}>
                      {item.direction === "long" ? "做多" : item.direction === "short" ? "做空" : "中性"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs md:text-sm font-mono text-zinc-300">
                    {item.entry_price != null ? `$${item.entry_price.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs md:text-sm font-mono text-zinc-500 hidden sm:table-cell">
                    {item.stop_loss != null ? `$${item.stop_loss.toLocaleString()}` : "—"}
                  </td>
                  <td className={`px-4 py-3 text-center text-xs md:text-sm font-medium ${st.cls}`}>
                    {st.text}
                  </td>
                  <td className="px-4 py-3 text-right text-xs md:text-sm font-mono">
                    {item.pnl_pct != null ? (
                      <span className={item.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {formatPnl(item.pnl_pct)}
                      </span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-zinc-500 hidden sm:table-cell">
                    {item.analysis_mode ? (MODE_LABELS[item.analysis_mode] ?? item.analysis_mode) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-zinc-500 hidden md:table-cell">
                    {new Date(item.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} pageSize={pageSize} onPageChange={onPageChange} totalLabel="条记录" />
    </div>
  );
}

// ── Leaderboard Rules ────────────────────────────────────────

export function LeaderboardRules() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info size={14} className="text-zinc-500" />
          <span className="text-xs text-zinc-500">排行榜规则</span>
        </div>
        <ChevronDown
          size={14}
          className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-5 py-4 space-y-2">
          <Rule text="排名指标为 Profit Factor（总利润 ÷ 总亏损绝对值），越高越好" />
          <Rule text="仅日内和趋势模式的策略参与排行，超短线模式不计入" />
          <Rule text="回退策略（数据不足时自动生成）和中性方向策略不计入" />
          <Rule text="同用户同币种去重：日内 24h 内 / 趋势 7d 内仅保留首条" />
          <Rule text="至少 3 条已结算策略才可上榜" />
          <Rule text="匿名编号基于用户 ID 哈希，无法反推身份" />
        </div>
      )}
    </div>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <p className="text-xs md:text-sm text-zinc-400 flex items-start gap-2">
      <span className="text-zinc-500 mt-0.5 shrink-0">•</span>
      {text}
    </p>
  );
}
