"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  fetchBacktestSummary,
  fetchBacktestTrades,
  type BacktestSummary,
  type BacktestTradesResult,
} from "@/lib/api/backtest";
import { listSymbols } from "@/lib/api/symbols";

const DAYS_OPTIONS = [7, 30, 60, 90, 180];

function StatCard({ label, value, highlight, negative }: { label: string; value: string | number; highlight?: boolean; negative?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      <p className={`text-xl font-semibold font-mono ${
        negative ? "text-red-400" : highlight ? "text-emerald-400" : "text-white"
      }`}>
        {value}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card rounded-xl p-5">
      <h3 className="text-base font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

const DIR_LABELS: Record<string, string> = {
  bullish: "多头",
  bearish: "空头",
  neutral: "观望",
};

export default function BacktestPage() {
  const [days, setDays] = useState(30);
  const [symbol, setSymbol] = useState<string>("");
  const [tradePage, setTradePage] = useState(1);

  const { data: symbols } = useQuery({
    queryKey: ["symbols"],
    queryFn: listSymbols,
  });

  const { data: summary, isLoading } = useQuery<BacktestSummary>({
    queryKey: ["backtestSummary", days, symbol],
    queryFn: () =>
      fetchBacktestSummary({ days, symbol: symbol || undefined }),
  });

  const { data: trades, isLoading: tradesLoading } =
    useQuery<BacktestTradesResult>({
      queryKey: ["backtestTrades", days, symbol, tradePage],
      queryFn: () =>
        fetchBacktestTrades({
          days,
          symbol: symbol || undefined,
          page: tradePage,
          page_size: 20,
        }),
    });

  const s = summary?.stats;

  return (
    <div className="flex flex-col gap-6 p-6 relative">
      {/* Background ambient light */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#9333EA]/5 blur-[120px] -z-10 rounded-full pointer-events-none" />

      <h1 className="text-xl font-bold text-white tracking-wide drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] relative z-10">策略回测</h1>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-4 relative z-10 p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] focus:outline-none focus:ring-1 focus:ring-[#9333EA]/50"
          title="选择币种"
          aria-label="选择币种"
        >
          <option value="">全部币种</option>
          {(symbols || []).map((s: { symbol: string }) => (
            <option key={s.symbol} value={s.symbol}>
              {s.symbol}
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-lg bg-black/40 p-1 border border-white/[0.05] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`relative rounded-md px-4 py-1.5 text-xs font-bold transition-colors ${
                days === d
                  ? "text-[#9333EA] drop-shadow-[0_0_5px_rgba(147,51,234,0.5)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {days === d && (
                <motion.div
                  layoutId="bt-day"
                  className="absolute inset-0 rounded-md bg-[#9333EA]/10 shadow-[inset_0_1px_0_0_rgba(147,51,234,0.2)]"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative">{d} 天</span>
            </button>
          ))}
        </div>
      </div>

      {/* 限制提示 */}
      {summary?.is_limited && (
        <div className="rounded-xl border border-[#FFB800]/20 bg-[#FFB800]/5 px-4 py-3 shadow-[inset_0_1px_0_0_rgba(255,184,0,0.1)] relative z-10">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FFB800] shadow-[0_0_8px_rgba(255,184,0,0.8)] rounded-l-xl" />
          <p className="text-sm font-medium text-[#FFB800] drop-shadow-[0_0_2px_rgba(255,184,0,0.3)] pl-2">
            免费用户最多查看 {summary.max_days} 天数据。升级旗舰版会员可查看最长 180 天完整回测。
          </p>
        </div>
      )}

      {isLoading ? (
        <Loading />
      ) : (
        s && (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 relative z-10">
              <StatCard label="总交易次数" value={s.total_trades} />
              <StatCard
                label="胜率"
                value={`${(s.win_rate * 100).toFixed(1)}%`}
                highlight={s.win_rate > 0.5}
              />
              <StatCard
                label="总收益"
                value={`${s.total_return_pct >= 0 ? "+" : ""}${s.total_return_pct.toFixed(2)}%`}
                highlight={s.total_return_pct > 0}
                negative={s.total_return_pct < 0}
              />
              <StatCard
                label="最大回撤"
                value={`${s.max_drawdown_pct.toFixed(2)}%`}
                negative
              />
              <StatCard
                label="盈亏比"
                value={s.profit_loss_ratio.toFixed(2)}
                highlight={s.profit_loss_ratio > 1}
              />
              <StatCard
                label="基准收益 (Benchmark)"
                value={`${summary!.benchmark.hold_return_pct >= 0 ? "+" : ""}${summary!.benchmark.hold_return_pct.toFixed(2)}%`}
                highlight={summary!.benchmark.hold_return_pct > 0}
                negative={summary!.benchmark.hold_return_pct < 0}
              />
            </div>

            {/* 收益曲线（简易文本图?*/}
            {summary!.equity_curve.length > 0 && (
              <Card title="收益曲线">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <span className="text-xs text-zinc-500">策略累计收益</span>
                    <p
                      className={`text-lg font-bold font-mono ${
                        s.total_return_pct >= 0
                          ? "text-bull"
                          : "text-bear"
                      }`}
                    >
                      {s.total_return_pct >= 0 ? "+" : ""}
                      {s.total_return_pct.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500">
                      持有不动 ({summary!.benchmark.symbol})
                    </span>
                    <p
                      className={`text-lg font-bold font-mono ${
                        summary!.benchmark.hold_return_pct >= 0
                          ? "text-bull"
                          : "text-bear"
                      }`}
                    >
                      {summary!.benchmark.hold_return_pct >= 0 ? "+" : ""}
                      {summary!.benchmark.hold_return_pct.toFixed(2)}%
                    </p>
                  </div>
                </div>

                {/* 简易柱状图 */}
                <div className="flex items-end gap-px h-24">
                  {summary!.equity_curve.map((pt, idx) => {
                    const maxAbs = Math.max(
                      ...summary!.equity_curve.map((p) =>
                        Math.abs(p.daily_return_pct)
                      ),
                      0.01
                    );
                    const heightPct =
                      (Math.abs(pt.daily_return_pct) / maxAbs) * 100;
                    const isPositive = pt.daily_return_pct >= 0;
                    return (
                      <div
                        key={idx}
                        className="flex-1 min-w-[2px] group relative"
                        style={{ display: "flex", alignItems: "flex-end", height: "100%" }}
                      >
                        <div
                          className={`w-full rounded-t-sm ${
                            isPositive ? "bg-[var(--color-bull)]/60" : "bg-[var(--color-bear)]/60"
                          }`}
                          style={{
                            height: `${Math.max(heightPct, 2)}%`,
                          }}
                        />
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                          <div className="rounded bg-black/80 px-2 py-1 text-xs text-zinc-300 whitespace-nowrap">
                            {pt.date}: {pt.daily_return_pct >= 0 ? "+" : ""}
                            {pt.daily_return_pct.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-zinc-500">
                    {summary!.equity_curve[0]?.date}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {summary!.equity_curve[summary!.equity_curve.length - 1]?.date}
                  </span>
                </div>
              </Card>
            )}

            {/* 额外统计 */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 relative z-10">
              <StatCard
                label="单笔最大盈利"
                value={`+${s.best_trade_pct.toFixed(2)}%`}
                highlight
              />
              <StatCard
                label="单笔最大亏损"
                value={`${s.worst_trade_pct.toFixed(2)}%`}
                negative
              />
              <StatCard
                label="平均单笔盈利"
                value={`+${s.avg_win_pct.toFixed(2)}%`}
                highlight
              />
              <StatCard
                label="平均单笔亏损"
                value={`${s.avg_loss_pct.toFixed(2)}%`}
                negative
              />
            </div>

            {/* 交易列表 */}
            <div className="card rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#0088FF]/5 blur-[60px] -z-10 rounded-full" />
              <h3 className="text-base font-bold text-white tracking-wide drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] mb-6">历史交易记录</h3>
              {tradesLoading ? (
                <Loading />
              ) : trades?.items.length === 0 ? (
                <p className="text-sm font-medium text-zinc-500 text-center py-16">
                  暂无交易记录
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.05]">
                          <th className="pb-3 text-left text-xs font-bold tracking-widest uppercase text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            币种
                          </th>
                          <th className="pb-3 text-left text-xs font-bold tracking-widest uppercase text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            方向
                          </th>
                          <th className="pb-3 text-right text-xs font-bold tracking-widest uppercase text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            入场区间
                          </th>
                          <th className="pb-3 text-right text-xs font-bold tracking-widest uppercase text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            置信度
                          </th>
                          <th className="pb-3 text-right text-xs font-bold tracking-widest uppercase text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            盈亏
                          </th>
                          <th className="pb-3 text-right text-xs font-bold tracking-widest uppercase text-zinc-500 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            时间
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {trades?.items.map((t) => (
                          <tr
                            key={t.id}
                            className="hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="py-4 text-sm font-bold text-white font-mono drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">
                              {t.symbol}
                            </td>
                            <td className="py-4">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold tracking-widest uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] ${
                                t.direction === 'bullish' ? 'bg-[#00FFA3]/10 text-[#00FFA3] drop-shadow-[0_0_5px_rgba(0,255,163,0.5)]' :
                                t.direction === 'bearish' ? 'bg-[#FF3366]/10 text-[#FF3366] drop-shadow-[0_0_5px_rgba(255,51,102,0.5)]' :
                                'bg-white/[0.08] text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]'
                              }`}>
                                {DIR_LABELS[t.direction] || t.direction}
                              </span>
                            </td>
                            <td className="py-4 text-right text-sm text-zinc-400 font-mono font-medium">
                              {t.entry_low.toFixed(2)} ~ {t.entry_high.toFixed(2)}
                            </td>
                            <td className="py-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <div className="h-1.5 w-12 rounded-full bg-white/[0.04] overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
                                  <div
                                    className={`h-full rounded-full shadow-[0_0_8px_currentColor] ${t.confidence >= 0.7 ? "bg-[#00FFA3] text-[#00FFA3]" : t.confidence >= 0.4 ? "bg-[#FFB800] text-[#FFB800]" : "bg-zinc-500 text-zinc-500"}`}
                                    style={{ width: `${t.confidence * 100}%` }}
                                  />
                                </div>
                                <span className={`text-sm font-bold font-mono ${t.confidence >= 0.7 ? "text-[#00FFA3] drop-shadow-[0_0_5px_rgba(0,255,163,0.5)]" : t.confidence >= 0.4 ? "text-[#FFB800] drop-shadow-[0_0_5px_rgba(255,184,0,0.5)]" : "text-zinc-500"}`}>
                                  {(t.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td
                              className={`py-4 text-right text-sm font-mono font-bold drop-shadow-[0_0_5px_currentColor] ${
                                t.pnl_pct > 0
                                  ? "text-[#00FFA3]"
                                  : t.pnl_pct < 0
                                  ? "text-[#FF3366]"
                                  : "text-zinc-400"
                              }`}
                            >
                              {t.pnl_pct > 0 ? "+" : ""}
                              {t.pnl_pct.toFixed(2)}%
                            </td>
                            <td className="py-4 text-right text-sm font-medium text-zinc-500">
                              {t.created_at
                                ?.slice(0, 16)
                                .replace("T", " ") || ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {trades && trades.total > trades.page_size && (
                    <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-white/[0.05]">
                      <button
                        onClick={() =>
                          setTradePage((p) => Math.max(1, p - 1))
                        }
                        disabled={tradePage <= 1}
                        className="rounded-lg px-4 py-2 text-xs font-bold tracking-wide text-zinc-400 bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-white/[0.02] disabled:hover:text-zinc-400"
                      >
                        上一页
                      </button>
                      <span className="flex items-center text-sm font-bold text-zinc-500 px-2">
                        {tradePage} /{" "}
                        {Math.ceil(trades.total / trades.page_size)}
                      </span>
                      <button
                        onClick={() => setTradePage((p) => p + 1)}
                        disabled={
                          tradePage >=
                          Math.ceil(trades.total / trades.page_size)
                        }
                        className="rounded-lg px-4 py-2 text-xs font-bold tracking-wide text-zinc-400 bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-white/[0.02] disabled:hover:text-zinc-400"
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-20">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#9333EA] border-t-transparent drop-shadow-[0_0_8px_rgba(147,51,234,0.5)]" />
    </div>
  );
}
