"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
    <div className="card rounded-lg p-5">
      <h3 className="text-base font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

const DIRECTION_KEYS = ["bullish", "bearish", "neutral"] as const;
// DIR_LABELS resolved dynamically via t('directions.*') inside component

export default function BacktestPage() {
  const t = useTranslations('backtest');
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
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-bold text-white tracking-wide">{t('title')}</h1>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-4 p-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          title={t('filter.selectSymbol')}
          aria-label={t('filter.selectSymbol')}
        >
          <option value="">{t('filter.allSymbols')}</option>
          {(symbols || []).map((s: { symbol: string }) => (
            <option key={s.symbol} value={s.symbol}>
              {s.symbol}
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-lg bg-black/40 p-1 border border-white/[0.05]">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`relative rounded-md px-4 py-1.5 text-xs font-bold transition-colors ${
                days === d
                  ? "text-indigo-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {days === d && (
                <motion.div
                  layoutId="bt-day"
                  className="absolute inset-0 rounded-md bg-indigo-500/10"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative">{t('filter.days', { d })}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 限制提示 */}
      {summary?.is_limited && (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400 rounded-l-xl" />
          <p className="text-sm font-medium text-amber-400 pl-2">
            {t('limited', { max: summary.max_days })}
          </p>
        </div>
      )}

      {isLoading ? (
        <Loading />
      ) : summary && !s ? (
        <div className="card p-6 text-center">
          <p className="text-sm font-medium text-red-400">{t('error.loadFailed')}</p>
        </div>
      ) : (
        s && (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label={t('stats.totalTrades')} value={s.total_trades} />
              <StatCard
                label={t('stats.winRate')}
                value={`${(s.win_rate * 100).toFixed(1)}%`}
                highlight={s.win_rate > 0.5}
              />
              <StatCard
                label={t('stats.totalReturn')}
                value={`${s.total_return_pct >= 0 ? "+" : ""}${s.total_return_pct.toFixed(2)}%`}
                highlight={s.total_return_pct > 0}
                negative={s.total_return_pct < 0}
              />
              <StatCard
                label={t('stats.maxDrawdown')}
                value={`${s.max_drawdown_pct.toFixed(2)}%`}
                negative
              />
              <StatCard
                label={t('stats.profitLossRatio')}
                value={s.profit_loss_ratio.toFixed(2)}
                highlight={s.profit_loss_ratio > 1}
              />
              <StatCard
                label={t('stats.benchmark')}
                value={`${summary!.benchmark.hold_return_pct >= 0 ? "+" : ""}${summary!.benchmark.hold_return_pct.toFixed(2)}%`}
                highlight={summary!.benchmark.hold_return_pct > 0}
                negative={summary!.benchmark.hold_return_pct < 0}
              />
            </div>

            {/* 收益曲线（简易文本图?*/}
            {summary!.equity_curve.length > 0 && (
              <Card title={t('equityCurve.title')}>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <span className="text-xs text-zinc-500">{t('equityCurve.strategyReturn')}</span>
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
                      {t('equityCurve.holdReturn', { symbol: summary!.benchmark.symbol })}
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label={t('stats.bestTrade')}
                value={`+${s.best_trade_pct.toFixed(2)}%`}
                highlight
              />
              <StatCard
                label={t('stats.worstTrade')}
                value={`${s.worst_trade_pct.toFixed(2)}%`}
                negative
              />
              <StatCard
                label={t('stats.avgWin')}
                value={`+${s.avg_win_pct.toFixed(2)}%`}
                highlight
              />
              <StatCard
                label={t('stats.avgLoss')}
                value={`${s.avg_loss_pct.toFixed(2)}%`}
                negative
              />
            </div>

            {/* 交易列表 */}
            <div className="card rounded-lg p-6">
              <h3 className="text-base font-semibold text-white mb-6">{t('trades.title')}</h3>
              {tradesLoading ? (
                <Loading />
              ) : trades?.items.length === 0 ? (
                <p className="text-sm font-medium text-zinc-500 text-center py-16">
                  {t('trades.empty')}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.05]">
                          <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                            {t('trades.columns.symbol')}
                          </th>
                          <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                            {t('trades.columns.direction')}
                          </th>
                          <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                            {t('trades.columns.entryRange')}
                          </th>
                          <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                            {t('trades.columns.confidence')}
                          </th>
                          <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                            {t('trades.columns.pnl')}
                          </th>
                          <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                            {t('trades.columns.time')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {trades?.items.map((tr) => (
                          <tr
                            key={tr.id}
                            className="hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="py-4 text-sm font-semibold text-white font-mono">
                              {tr.symbol}
                            </td>
                            <td className="py-4">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold uppercase ${
                                tr.direction === 'bullish' ? 'bg-emerald-400/10 text-emerald-400' :
                                tr.direction === 'bearish' ? 'bg-red-400/10 text-red-400' :
                                'bg-white/[0.08] text-zinc-300'
                              }`}>
                                {tr.direction === 'bullish' ? t('directions.bullish') : tr.direction === 'bearish' ? t('directions.bearish') : t('directions.neutral')}
                              </span>
                            </td>
                            <td className="py-4 text-right text-sm text-zinc-400 font-mono font-medium">
                              {tr.entry_low.toFixed(2)} ~ {tr.entry_high.toFixed(2)}
                            </td>
                            <td className="py-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <div className="h-1.5 w-12 rounded-full bg-white/[0.04] overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${tr.confidence >= 0.7 ? "bg-emerald-400" : tr.confidence >= 0.4 ? "bg-amber-400" : "bg-zinc-500"}`}
                                    style={{ width: `${tr.confidence * 100}%` }}
                                  />
                                </div>
                                <span className={`text-sm font-bold font-mono ${tr.confidence >= 0.7 ? "text-emerald-400" : tr.confidence >= 0.4 ? "text-amber-400" : "text-zinc-500"}`}>
                                  {(tr.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td
                              className={`py-4 text-right text-sm font-mono font-bold ${
                                tr.pnl_pct > 0
                                  ? "text-emerald-400"
                                  : tr.pnl_pct < 0
                                  ? "text-red-400"
                                  : "text-zinc-400"
                              }`}
                            >
                              {tr.pnl_pct > 0 ? "+" : ""}
                              {tr.pnl_pct.toFixed(2)}%
                            </td>
                            <td className="py-4 text-right text-sm font-medium text-zinc-500">
                              {(tr.created_at != null ? String(tr.created_at).slice(0, 16) : "").replace("T", " ") || ""}
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
                        {t('trades.pagination.prev')}
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
                        {t('trades.pagination.next')}
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
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}
