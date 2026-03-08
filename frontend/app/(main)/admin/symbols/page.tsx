"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { fetchCurrentUser, type UserInfo } from "@/lib/api/auth";
import {
  listAllSymbols,
  addSymbol,
  updateSymbol,
  deleteSymbol,
  fetchKlineProgress,
  type SymbolConfig,
  type SymbolCreateRequest,
  type KlineProgressResponse,
} from "@/lib/api/admin-symbols";

// ── Add Symbol Dialog ────────────────────────────────────────

interface AddSymbolDialogProps {
  onClose: () => void;
  onDone: () => void;
}

function AddSymbolDialog({ onClose, onDone }: AddSymbolDialogProps) {
  const [symbol, setSymbol] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [hasOnchain, setHasOnchain] = useState(true);
  const [hasDerivatives, setHasDerivatives] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!symbol.trim() || !displayName.trim()) {
      setError("请填写交易对和显示名称");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data: SymbolCreateRequest = {
        symbol: symbol.toUpperCase().trim(),
        display_name: displayName.trim(),
        has_onchain: hasOnchain,
        has_derivatives: hasDerivatives,
      };
      await addSymbol(data);
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setSubmitting(false);
    }
  }, [symbol, displayName, hasOnchain, hasDerivatives, onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-md backdrop-blur-md bg-bg-primary border border-white/[0.08] rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-200">添加交易对</h3>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-500">交易对</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="BTCUSDT"
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent/40"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-500">显示名称</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Bitcoin"
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent/40"
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={hasOnchain} onChange={(e) => setHasOnchain(e.target.checked)} className="rounded" />
              链上数据
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={hasDerivatives} onChange={(e) => setHasDerivatives(e.target.checked)} className="rounded" />
              合约数据
            </label>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-bear">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.08] px-4 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.04]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-[var(--color-accent)]/20 px-4 py-2 text-xs font-semibold text-accent transition-all hover:bg-[var(--color-accent)]/30 disabled:opacity-50"
          >
            {submitting ? "添加中…" : "添加"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Symbol Row ───────────────────────────────────────────────

interface SymbolRowProps {
  config: SymbolConfig;
  onToggle: (symbol: string, enabled: boolean) => void;
  onDelete: (symbol: string) => void;
  toggling: string | null;
}

function formatTtl(ttl: number): string {
  if (ttl === -2) return "MISSING";
  if (ttl === -1) return "NO_EXPIRE";
  return `${ttl}s`;
}

function formatAge(ageSec: number | null): string {
  if (ageSec === null) return "-";
  if (ageSec < 60) return `${ageSec}s`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h`;
  return `${Math.floor(ageSec / 86400)}d`;
}

function formatExpiredReasons(reasons: string[]): string {
  if (!reasons.length) return "-";

  const labels: Record<string, string> = {
    missing_kline: "缺K线",
    missing_indicator: "缺指标",
    stale_kline: "K线过旧",
    stale_indicator: "指标过旧",
  };

  return reasons.map((reason) => labels[reason] ?? reason).join("/");
}

function SymbolRow({ config, onToggle, onDelete, toggling }: SymbolRowProps) {
  const isToggling = toggling === config.symbol;

  return (
    <tr className="border-b border-white/[0.04]">
      <td className="py-3 font-mono text-sm text-zinc-200">{config.symbol}</td>
      <td className="py-3 text-sm text-zinc-400">{config.display_name}</td>
      <td className="py-3">
        <span
          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
            config.enabled
              ? "text-bull bg-[var(--color-bull)]/20"
              : "text-zinc-500 bg-zinc-500/20"
          }`}
        >
          {config.enabled ? "启用" : "禁用"}
        </span>
      </td>
      <td className="py-3 text-xs text-zinc-500">{config.collect_interval_sec}s</td>
      <td className="py-3">
        <div className="flex gap-1">
          {config.has_onchain && (
            <span className="rounded bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-xs text-accent">链上</span>
          )}
          {config.has_derivatives && (
            <span className="rounded bg-[#F5A623]/10 px-1.5 py-0.5 text-xs text-[#F5A623]">合约</span>
          )}
        </div>
      </td>
      <td className="py-3 text-xs text-zinc-500">
        {config.error_count > 0 && (
          <span className="text-bear">{config.error_count} 次</span>
        )}
      </td>
      <td className="py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onToggle(config.symbol, !config.enabled)}
            disabled={isToggling}
            className="rounded px-2 py-1 text-xs font-medium text-zinc-400 bg-white/[0.04] border border-white/[0.08] transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          >
            {isToggling ? "…" : config.enabled ? "禁用" : "启用"}
          </button>
          {config.enabled && (
            <button
              type="button"
              onClick={() => onDelete(config.symbol)}
              className="rounded px-2 py-1 text-xs font-medium text-bear bg-[var(--color-bear)]/10 transition-colors hover:bg-[var(--color-bear)]/20"
            >
              删除
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function AdminSymbolsPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(false);

  const { data: user } = useQuery<UserInfo>({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
  });

  const {
    data: symbols = [],
    isLoading,
    error,
  } = useQuery<SymbolConfig[]>({
    queryKey: ["adminSymbols"],
    queryFn: listAllSymbols,
    enabled: !!user?.is_admin,
  });

  const enabledSymbols = symbols.filter((s) => s.enabled).map((s) => s.symbol).sort();

  const {
    data: klineProgress,
    isLoading: klineLoading,
    error: klineError,
  } = useQuery<KlineProgressResponse>({
    queryKey: ["kline-progress", enabledSymbols],
    queryFn: () => fetchKlineProgress(enabledSymbols),
    enabled: !!user?.is_admin && enabledSymbols.length > 0,
    refetchInterval: 15000,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["adminSymbols"] });
    queryClient.invalidateQueries({ queryKey: ["kline-progress"] });
  }, [queryClient]);

  const handleToggle = useCallback(
    async (symbol: string, enabled: boolean) => {
      setToggling(symbol);
      try {
        await updateSymbol(symbol, { enabled });
        refresh();
      } catch {
        // silent
      } finally {
        setToggling(null);
      }
    },
    [refresh]
  );

  const handleDelete = useCallback(
    async (symbol: string) => {
      if (!confirm(`确认禁用交易对 ${symbol}？`)) return;
      try {
        await deleteSymbol(symbol);
        refresh();
      } catch {
        // silent
      }
    },
    [refresh]
  );

  const enabledCount = symbols.filter((s) => s.enabled).length;
  const disabledCount = symbols.filter((s) => !s.enabled).length;
  const progressSymbols = useMemo(() => {
    if (!klineProgress) return [];
    if (!issuesOnly) return klineProgress.symbols;

    return klineProgress.symbols
      .map((symbolProgress) => ({
        ...symbolProgress,
        intervals: symbolProgress.intervals.filter((intervalProgress) => intervalProgress.expired),
      }))
      .filter((symbolProgress) => symbolProgress.intervals.length > 0);
  }, [klineProgress, issuesOnly]);

  const issueSlots = useMemo(() => {
    if (!klineProgress) return 0;
    return klineProgress.symbols.reduce(
      (total, symbolProgress) => total + symbolProgress.intervals.filter((intervalProgress) => intervalProgress.expired).length,
      0,
    );
  }, [klineProgress]);

  if (!user?.is_admin) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-zinc-200">币种管理</h1>
        <div className="card-surface rounded-xl p-6 text-center">
          <p className="text-sm text-bear">权限不足 — 仅管理员可访问</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-200">币种管理</h1>
          <p className="text-xs text-zinc-500 mt-1">
            管理系统支持的交易对，启用 {enabledCount} 个，禁用 {disabledCount} 个
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-[var(--color-accent)]/20 px-4 py-2 text-xs font-semibold text-accent transition-all hover:bg-[var(--color-accent)]/30"
        >
          + 添加交易对
        </button>
      </div>

      {/* Table */}
      <div className="card-surface rounded-xl p-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : error ? (
          <p className="text-sm text-bear text-center py-4">
            {error instanceof Error ? error.message : "加载失败"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="pb-3 text-left text-xs font-medium text-zinc-500">交易对</th>
                  <th className="pb-3 text-left text-xs font-medium text-zinc-500">名称</th>
                  <th className="pb-3 text-left text-xs font-medium text-zinc-500">状态</th>
                  <th className="pb-3 text-left text-xs font-medium text-zinc-500">采集间隔</th>
                  <th className="pb-3 text-left text-xs font-medium text-zinc-500">数据源</th>
                  <th className="pb-3 text-left text-xs font-medium text-zinc-500">错误</th>
                  <th className="pb-3 text-left text-xs font-medium text-zinc-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {symbols.map((s) => (
                  <SymbolRow
                    key={s.symbol}
                    config={s}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    toggling={toggling}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-surface rounded-xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">K线采集联动进度</h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={issuesOnly}
              onChange={(e) => setIssuesOnly(e.target.checked)}
              className="rounded"
            />
            仅显示异常
          </label>
        </div>
        {enabledSymbols.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">暂无启用币种。</p>
        ) : klineLoading ? (
          <p className="mt-3 text-sm text-zinc-500">加载中...</p>
        ) : klineError ? (
          <p className="mt-3 text-sm text-bear">{klineError instanceof Error ? klineError.message : "加载失败"}</p>
        ) : klineProgress ? (
          <div className="mt-3 space-y-3">
            <div className="rounded border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-zinc-500">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  调度器: {klineProgress.running ? <span className="text-bull">运行中</span> : <span className="text-bear">未运行</span>}
                </span>
                <span>轮次: {klineProgress.scheduler.rounds_completed}</span>
                <span>失败: {klineProgress.scheduler.last_failed}</span>
                <span>耗时: {klineProgress.scheduler.last_elapsed_s}s</span>
                <span>最近采集: {klineProgress.scheduler.last_collect_at || "-"}</span>
              </div>
              <p className="mt-2">
                总体: {klineProgress.progress_pct.toFixed(1)}% ({klineProgress.ready_slots}/{klineProgress.total_slots})
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">异常槽位: {issueSlots}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/[0.08]">
                <div
                  className="h-full bg-[var(--color-accent)] transition-all"
                  style={{ width: `${klineProgress.progress_pct}%` }}
                />
              </div>
            </div>

            {progressSymbols.length === 0 ? (
              <p className="text-xs text-zinc-500">当前筛选下无异常项。</p>
            ) : progressSymbols.map((s) => (
              <details key={s.symbol} className="rounded border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs" open>
                <summary className="flex cursor-pointer list-none items-center justify-between text-zinc-300">
                  <span className="font-mono">{s.symbol} <span className="text-zinc-500">({s.latest_price ?? "-"})</span></span>
                  <span className="text-zinc-500">{s.ready_intervals}/{s.total_intervals} · {s.progress_pct.toFixed(1)}%</span>
                </summary>
                <div className="mt-2 space-y-1">
                  {s.intervals.map((itv) => (
                    <div key={`${s.symbol}-${itv.interval}`} className="grid grid-cols-9 gap-2 rounded border border-white/[0.04] px-2 py-1 text-[11px] text-zinc-500">
                      <span className="font-mono text-zinc-300">{itv.interval}</span>
                      <span>K:{itv.kline_count}</span>
                      <span>KT:{formatTtl(itv.kline_ttl)}</span>
                      <span className={itv.kline_fresh ? "text-zinc-400" : "text-bear"}>KA:{formatAge(itv.kline_age_sec)}</span>
                      <span className={itv.indicator === "EXISTS" ? "text-bull" : "text-bear"}>I:{itv.indicator}</span>
                      <span>IT:{formatTtl(itv.indicator_ttl)}</span>
                      <span className={itv.indicator_fresh ? "text-zinc-400" : "text-bear"}>IA:{formatAge(itv.indicator_age_sec)}</span>
                      <span className={itv.expired ? "text-bear" : "text-zinc-400"}>R:{formatExpiredReasons(itv.expired_reasons)}</span>
                      <span className={itv.expired ? "text-bear" : "text-bull"}>
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle bg-current" />
                        {itv.expired ? "EXPIRED" : "FRESH"}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </div>

      {/* Add dialog */}
      <AnimatePresence>
        {showAdd && (
          <AddSymbolDialog
            onClose={() => setShowAdd(false)}
            onDone={() => {
              setShowAdd(false);
              refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
