"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  fetchPerformanceReview,
  recalculateWeights,
  applyWeights,
  fetchCurrentWeights,
  fetchCalibrationParams,
  updateCalibrationParams,
  fetchDbStats,
  cleanupOldData,
  type PerformanceReview,
  type WeightsPreview,
  type CalibrationParams,
  type DbTableStat,
} from "@/lib/api/learning";
import {
  fetchVpdFactors,
  fetchVpdStats,
  fetchWeightHistory,
  updateVpdFactors,
  resetVpdFactors,
  triggerAiTraining,
  applyAiSuggestion,
  type VpdFactorsResponse,
  type VpdStatsResponse,
  type AiTrainingResult,
  type WeightAuditEntry,
} from "@/lib/api/vpd-factors";
import { useAuth } from "@/lib/auth-context";

/** Inline helper — previously from playbook-constants (removed). */
function getMarketStructureLabel(type: string | null | undefined): string {
  const MAP: Record<string, string> = {
    accumulation: "吸筹", markup: "拉升", distribution: "出货",
    decline: "下跌", re_accumulation: "二次吸筹", capitulation: "恐慌抛售",
  };
  return type ? MAP[type] ?? type : "";
}

// ── Tab 定义 ──────────────────────────────────────────────────

const TABS = [
  { id: "perf", label: "绩效回顾" },
  { id: "weights", label: "权重迭代" },
  { id: "factors", label: "因子分析" },
  { id: "calibration", label: "信号校准" },
  { id: "db", label: "数据维护" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── 绩效回顾 Tab ──────────────────────────────────────────────

function PerfTab() {
  const [days, setDays] = useState(30);

  const { data, isLoading, error } = useQuery<PerformanceReview>({
    queryKey: ["learningPerf", days],
    queryFn: () => fetchPerformanceReview(days),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={error instanceof Error ? error.message : "加载失败"} />;
  if (!data) return null;

  const s = data.stats;
  const dist = data.signal_distribution;

  return (
    <div className="space-y-4">
      {/* 时间范围 */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-zinc-400">回顾天数</label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200"
        >
          {[7, 14, 30, 60, 90].map((d) => (
            <option key={d} value={d}>
              {d}天
            </option>
          ))}
        </select>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="总策略" value={s.total_strategies} />
        <StatCard label="已结算" value={s.settled_count} />
        <StatCard label="胜率" value={`${(s.win_rate * 100).toFixed(1)}%`} highlight={s.win_rate > 0.5} />
        <StatCard label="平均盈利" value={`${s.avg_profit_pct.toFixed(2)}%`} highlight />
        <StatCard label="平均亏损" value={`${s.avg_loss_pct.toFixed(2)}%`} />
        <StatCard label="盈亏比" value={s.profit_loss_ratio.toFixed(2)} highlight={s.profit_loss_ratio > 1} />
      </div>

      {/* 信号分布 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="信号分布">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>做多 (Long)</span>
                <span>{dist.long}</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.08]">
                <div
                  className="h-2 rounded-full bg-[var(--color-bull)]"
                  style={{
                    width: `${dist.long + dist.short > 0 ? (dist.long / (dist.long + dist.short)) * 100 : 50}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>做空 (Short)</span>
                <span>{dist.short}</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.08]">
                <div
                  className="h-2 rounded-full bg-[var(--color-bear)]"
                  style={{
                    width: `${dist.long + dist.short > 0 ? (dist.short / (dist.long + dist.short)) * 100 : 50}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* 按模式胜率 */}
        <Card title="按模式胜率">
          {data.mode_win_rates.length === 0 ? (
            <p className="text-xs text-zinc-500">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {data.mode_win_rates.map((m) => (
                <div key={m.mode} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300 capitalize">{m.mode}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{m.wins}/{m.total}</span>
                    <span className={`text-xs font-mono ${m.win_rate > 0.5 ? "text-bull" : "text-zinc-400"}`}>
                      {(m.win_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="剧本复盘表现">
        {data.playbook_win_rates.length === 0 ? (
          <p className="text-xs text-zinc-500">暂无数据</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {data.playbook_win_rates.map((item) => {
              const completionRate = item.total > 0 ? item.completed / item.total : 0;
              return (
                <div
                  key={`${item.playbook_name}:${item.market_structure_type ?? "unknown"}`}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {item.playbook_name}
                      </p>
                      <p className="mt-1 text-xs text-indigo-300">
                        {getMarketStructureLabel(item.market_structure_type) || "未标注结构"}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-zinc-500">
                      {item.completed}/{item.total}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>完成率</span>
                        <span>{(completionRate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/[0.08]">
                        <div
                          className="h-2 rounded-full bg-indigo-500/70"
                          style={{ width: `${Math.max(completionRate * 100, item.total > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">平均准确率</span>
                      <span className={`font-mono ${item.avg_accuracy >= 0.6 ? "text-bull" : item.avg_accuracy > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                        {(item.avg_accuracy * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="按市场结构聚合表现">
        {data.structure_win_rates.length === 0 ? (
          <p className="text-xs text-zinc-500">暂无数据</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {data.structure_win_rates.map((item, index) => {
              const completionRate = item.total > 0 ? item.completed / item.total : 0;
              return (
                <div
                  key={item.market_structure_type ?? "unknown"}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {getMarketStructureLabel(item.market_structure_type) || "未标注结构"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        覆盖 {item.playbook_count} 个剧本
                        {index === 0 && item.total > 0 ? " · 当前最优结构" : ""}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-zinc-500">
                      {item.completed}/{item.total}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>完成率</span>
                        <span>{(completionRate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/[0.08]">
                        <div
                          className="h-2 rounded-full bg-emerald-500/70"
                          style={{ width: `${Math.max(completionRate * 100, item.total > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">平均准确率</span>
                      <span className={`font-mono ${
                        item.avg_accuracy >= 0.6
                          ? "text-bull"
                          : item.avg_accuracy > 0
                          ? "text-amber-400"
                          : "text-zinc-500"
                      }`}>
                        {(item.avg_accuracy * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 智能体准确率 */}
      <Card title="智能体准确率">
        {Object.keys(s.by_agent).length === 0 ? (
          <p className="text-xs text-zinc-500">暂无数据</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(s.by_agent)
              .sort(([, a], [, b]) => b - a)
              .map(([agent, acc]) => (
                <div
                  key={agent}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <p className="text-xs text-zinc-500 truncate">{agent}</p>
                  <p className={`text-lg font-bold font-mono ${acc > 0.5 ? "text-bull" : "text-zinc-400"}`}>
                    {(acc * 100).toFixed(1)}%
                  </p>
                </div>
              ))}
          </div>
        )}
      </Card>

      {/* 胜率趋势 */}
      <Card title="胜率趋势">
        {data.trend.length === 0 ? (
          <p className="text-xs text-zinc-500">暂无数据</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1 h-32 min-w-[400px] relative">
              {(() => {
                const changelogDates = new Set(
                  data.changelog_markers.map((c) => c.changed_at?.slice(0, 10))
                );
                return data.trend.map((t: { date: string; win_rate: number }) => {
                  const hasChange = changelogDates.has(t.date);
                  const changeItems = hasChange
                    ? data.changelog_markers.filter((c) => c.changed_at?.slice(0, 10) === t.date)
                    : [];
                  return (
                    <div key={t.date} className="flex-1 flex flex-col items-center gap-1 relative">
                      {hasChange && (
                        <div
                          className="absolute top-0 bottom-6 w-px bg-[#FFB800] z-10"
                          title={changeItems.map((c) =>
                            `${c.param_key}: ${c.old_value} → ${c.new_value}`
                          ).join("\n")}
                        >
                          <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-[#FFB800]" />
                        </div>
                      )}
                      <div
                        className={`w-full rounded-t transition-all ${
                          t.win_rate > 0.5 ? "bg-[var(--color-bull)]/40" : "bg-[var(--color-bear)]/40"
                        }`}
                        style={{ height: `${Math.max(t.win_rate * 100, 4)}%` }}
                        title={`${t.date}: ${(t.win_rate * 100).toFixed(1)}%`}
                      />
                      <span className="text-[8px] text-zinc-500 -rotate-45 origin-top-left whitespace-nowrap">
                        {t.date.slice(5)}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </Card>

      {/* 参数变更标记 */}
      {data.changelog_markers.length > 0 && (
        <Card title="参数变更记录">
          <div className="space-y-2">
            {data.changelog_markers.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-xs">
                <span className="text-zinc-500">{c.changed_at?.slice(0, 10)}</span>
                <span className="rounded bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-xs text-accent">
                  {c.param_type}
                </span>
                <span className="text-zinc-300">{c.param_key}</span>
                <span className="text-zinc-500">{c.old_value} → {c.new_value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 权重迭代 Tab ──────────────────────────────────────────────

function WeightsTab() {
  const queryClient = useQueryClient();
  const [lookback, setLookback] = useState(30);
  const [preview, setPreview] = useState<WeightsPreview | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: current } = useQuery({
    queryKey: ["currentWeights"],
    queryFn: fetchCurrentWeights,
  });

  const handleRecalculate = useCallback(async () => {
    setCalculating(true);
    setMsg(null);
    try {
      const res = await recalculateWeights(lookback);
      setPreview(res);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "计算失败");
    } finally {
      setCalculating(false);
    }
  }, [lookback]);

  const handleApply = useCallback(async () => {
    if (!preview) return;
    setApplying(true);
    setMsg(null);
    try {
      await applyWeights(preview.new_weights, `回看${lookback}天`);
      setMsg("权重已应用");
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["currentWeights"] });
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "应用失败");
    } finally {
      setApplying(false);
    }
  }, [preview, lookback, queryClient]);

  const allKeys = new Set([
    ...Object.keys(current?.weights ?? {}),
    ...Object.keys(preview?.new_weights ?? {}),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-xs text-zinc-400">回看天数</label>
        <select
          value={lookback}
          onChange={(e) => setLookback(Number(e.target.value))}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200"
        >
          {[7, 14, 30, 60, 90, 180].map((d) => (
            <option key={d} value={d}>
              {d}天
            </option>
          ))}
        </select>
        <button
          onClick={handleRecalculate}
          disabled={calculating}
          className="rounded-lg bg-[var(--color-accent)]/20 px-4 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-[var(--color-accent)]/30 disabled:opacity-50"
        >
          {calculating ? "计算中..." : "预览新权重"}
        </button>
      </div>

      {msg && (
        <p className={`text-xs ${msg.includes("失败") ? "text-bear" : "text-bull"}`}>{msg}</p>
      )}

      {/* 权重对比表 */}
      <Card title="权重对比">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="pb-2 text-left text-xs font-medium text-zinc-500">模型</th>
                <th className="pb-2 text-right text-xs font-medium text-zinc-500">当前权重</th>
                {preview && <th className="pb-2 text-right text-xs font-medium text-accent">新权重</th>}
                {preview && <th className="pb-2 text-right text-xs font-medium text-zinc-500">变化</th>}
                {preview && <th className="pb-2 text-right text-xs font-medium text-zinc-500">样本数</th>}
              </tr>
            </thead>
            <tbody>
              {Array.from(allKeys).map((key) => {
                const cur = current?.weights?.[key] ?? 0;
                const nw = preview?.new_weights?.[key];
                const detail = preview?.model_details?.[key];
                const diff = nw !== undefined ? nw - cur : undefined;
                return (
                  <tr key={key} className="border-b border-white/[0.04]">
                    <td className="py-2 text-xs text-zinc-300 font-mono">{key}</td>
                    <td className="py-2 text-right text-xs text-zinc-400 font-mono">
                      {(cur * 100).toFixed(1)}%
                    </td>
                    {preview && (
                      <>
                        <td className="py-2 text-right text-xs text-accent font-mono">
                          {nw !== undefined ? `${(nw * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className={`py-2 text-right text-xs font-mono ${
                          diff && diff > 0 ? "text-bull" : diff && diff < 0 ? "text-bear" : "text-zinc-500"
                        }`}>
                          {diff !== undefined ? `${diff > 0 ? "+" : ""}${(diff * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 text-right text-xs text-zinc-500">
                          {detail?.sample_count ?? "—"}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {preview && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleApply}
              disabled={applying}
              className="rounded-lg bg-[var(--color-bull)]/20 px-4 py-2 text-xs font-semibold text-bull transition-all hover:bg-[var(--color-bull)]/30 disabled:opacity-50"
            >
              {applying ? "应用中..." : "应用新权重"}
            </button>
          </div>
        )}
      </Card>

      {/* 三维度评分 */}
      {preview && (
        <Card title="三维度评分详情">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(preview.model_details).map(([key, d]) => (
              <div key={key} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-1">
                <p className="text-xs text-zinc-500 font-mono truncate">{key}</p>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">方向准确率</span>
                  <span className="font-mono text-zinc-200">{(d.direction_accuracy * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">校准度</span>
                  <span className="font-mono text-zinc-200">{(d.calibration_score * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">幅度匹配</span>
                  <span className="font-mono text-zinc-200">{(d.magnitude_score * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs border-t border-white/[0.08] pt-1">
                  <span className="text-zinc-300 font-medium">综合评分</span>
                  <span className="font-mono text-accent font-bold">{(d.composite_score * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 信号校准 Tab ──────────────────────────────────────────────

function CalibrationTab() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<CalibrationParams>({
    queryKey: ["calibrationParams"],
    queryFn: fetchCalibrationParams,
  });

  const [threshold, setThreshold] = useState<number | null>(null);
  const [minAgree, setMinAgree] = useState<number | null>(null);

  const currentThreshold = threshold ?? data?.signal_threshold ?? 0.35;
  const currentMinAgree = minAgree ?? data?.min_agreement ?? 2;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMsg(null);
    try {
      const params: { signal_threshold?: number; min_agreement?: number } = {};
      if (threshold !== null) params.signal_threshold = threshold;
      if (minAgree !== null) params.min_agreement = minAgree;
      await updateCalibrationParams(params);
      setMsg("参数已更新");
      queryClient.invalidateQueries({ queryKey: ["calibrationParams"] });
      setThreshold(null);
      setMinAgree(null);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "更新失败");
    } finally {
      setSaving(false);
    }
  }, [threshold, minAgree, queryClient]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={error instanceof Error ? error.message : "加载失败"} />;

  const rec = data?.recommended;
  const hasChanges = threshold !== null || minAgree !== null;

  return (
    <div className="space-y-4">
      <Card title="共识引擎校准参数">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-500">
              信号阈值 <span className="text-zinc-500">({rec?.signal_threshold.min}~{rec?.signal_threshold.max})</span>
            </label>
            <p className="text-xs text-zinc-500 mt-0.5">
              加权分数超过此值才判定为 bullish/bearish
            </p>
            <input
              type="number"
              step="0.05"
              min={rec?.signal_threshold.min}
              max={rec?.signal_threshold.max}
              value={currentThreshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="mt-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent/40"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-500">
              最小一致数 <span className="text-zinc-500">({rec?.min_agreement.min}~{rec?.min_agreement.max})</span>
            </label>
            <p className="text-xs text-zinc-500 mt-0.5">
              至少几个模型方向一致才可判定
            </p>
            <input
              type="number"
              step="1"
              min={rec?.min_agreement.min}
              max={rec?.min_agreement.max}
              value={currentMinAgree}
              onChange={(e) => setMinAgree(parseInt(e.target.value))}
              className="mt-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent/40"
            />
          </div>
        </div>

        {msg && (
          <p className={`mt-3 text-xs ${msg.includes("失败") ? "text-bear" : "text-bull"}`}>{msg}</p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => {
              setThreshold(rec?.signal_threshold.default ?? 0.35);
              setMinAgree(rec?.min_agreement.default ?? 2);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            恢复默认值
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="rounded-lg bg-[var(--color-accent)]/20 px-4 py-2 text-xs font-semibold text-accent transition-all hover:bg-[var(--color-accent)]/30 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ── 数据维护 Tab ──────────────────────────────────────────────

function DbTab() {
  const queryClient = useQueryClient();
  const [retainDays, setRetainDays] = useState(90);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<Record<string, number> | null>(null);
  const [confirmClean, setConfirmClean] = useState(false);

  const { data: stats, isLoading, error } = useQuery<DbTableStat[]>({
    queryKey: ["dbStats"],
    queryFn: fetchDbStats,
  });

  const handleCleanup = useCallback(async () => {
    setCleaning(true);
    try {
      const res = await cleanupOldData(retainDays);
      setCleanResult(res.deleted);
      setConfirmClean(false);
      queryClient.invalidateQueries({ queryKey: ["dbStats"] });
    } catch {
      // silent
    } finally {
      setCleaning(false);
    }
  }, [retainDays, queryClient]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMsg msg={error instanceof Error ? error.message : "加载失败"} />;

  return (
    <div className="space-y-4">
      <Card title="数据库表统计">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="pb-2 text-left text-xs font-medium text-zinc-500">表名</th>
                <th className="pb-2 text-right text-xs font-medium text-zinc-500">行数</th>
              </tr>
            </thead>
            <tbody>
              {stats?.map((s) => (
                <tr key={s.table} className="border-b border-white/[0.04]">
                  <td className="py-2 text-xs text-zinc-300 font-mono">{s.table}</td>
                  <td className="py-2 text-right text-xs text-zinc-400 font-mono">
                    {s.row_count >= 0 ? s.row_count.toLocaleString() : (
                      <span className="text-bear">{s.error || "错误"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="清理过期数据">
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400">保留天数</label>
          <select
            value={retainDays}
            onChange={(e) => setRetainDays(Number(e.target.value))}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200"
          >
            {[30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d}天
              </option>
            ))}
          </select>

          {!confirmClean ? (
            <button
              onClick={() => setConfirmClean(true)}
              className="rounded-lg bg-[var(--color-bear)]/20 px-4 py-1.5 text-xs font-semibold text-bear transition-all hover:bg-[var(--color-bear)]/30"
            >
              清理
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-bear">确认删除 {retainDays} 天前的数据？</span>
              <button
                onClick={handleCleanup}
                disabled={cleaning}
                className="rounded-lg bg-[var(--color-bear)]/30 px-3 py-1.5 text-xs font-semibold text-bear disabled:opacity-50"
              >
                {cleaning ? "清理中..." : "确认"}
              </button>
              <button
                onClick={() => setConfirmClean(false)}
                className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-400"
              >
                取消
              </button>
            </div>
          )}
        </div>

        {cleanResult && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-bull">清理完成</p>
            {Object.entries(cleanResult).map(([table, count]) => (
              <p key={table} className="text-xs text-zinc-400">
                <span className="font-mono text-zinc-300">{table}</span>: 删除 {count >= 0 ? count : "失败"} 行
              </p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── 因子分析 Tab ──────────────────────────────────────────────

const FACTOR_NAMES: Record<string, string> = {
  f1_peak_divergence: "极值点背离",
  f2_volume_zscore: "量能Z-Score",
  f3_cmf_divergence: "CMF资金流",
  f4_macd_rsi_divergence: "MACD+RSI动量",
  f5_obv_divergence: "OBV趋势",
  f6_derivatives_health: "衍生品健康度",
  f7_vsa_efficiency: "VSA效率",
};

const FACTOR_COLORS: Record<string, string> = {
  f1_peak_divergence: "#3B82F6",
  f2_volume_zscore: "#8B5CF6",
  f3_cmf_divergence: "#06B6D4",
  f4_macd_rsi_divergence: "#F59E0B",
  f5_obv_divergence: "#10B981",
  f6_derivatives_health: "#EF4444",
  f7_vsa_efficiency: "#EC4899",
};

function FactorTab() {
  const queryClient = useQueryClient();
  const [statsDays, setStatsDays] = useState(14);
  const [editing, setEditing] = useState(false);
  const [draftWeights, setDraftWeights] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiTrainingResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [applyingAi, setApplyingAi] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: factors, isLoading: factorsLoading } = useQuery<VpdFactorsResponse>({
    queryKey: ["vpdFactors"],
    queryFn: fetchVpdFactors,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<VpdStatsResponse>({
    queryKey: ["vpdStats", statsDays],
    queryFn: () => fetchVpdStats(statsDays),
  });

  const { data: historyData } = useQuery({
    queryKey: ["vpdWeightHistory"],
    queryFn: fetchWeightHistory,
    enabled: showHistory,
  });

  const handleStartEdit = () => {
    if (!factors) return;
    const w: Record<string, number> = {};
    factors.factors.forEach((f) => (w[f.factor_id] = f.weight));
    setDraftWeights(w);
    setEditing(true);
    setMsg(null);
  };

  const handleSaveWeights = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await updateVpdFactors(draftWeights);
      setMsg(res.message || "权重已更新");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["vpdFactors"] });
    } catch (e: any) {
      setMsg(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("确定恢复默认因子权重？")) return;
    setSaving(true);
    try {
      await resetVpdFactors();
      setMsg("权重已重置为默认值");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["vpdFactors"] });
    } catch (e: any) {
      setMsg(e.message || "重置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAiTrain = async () => {
    setAiLoading(true);
    setMsg(null);
    setAiResult(null);
    try {
      const result = await triggerAiTraining(statsDays);
      setAiResult(result);
      if (!result.ok) setMsg(result.error || "训练失败");
    } catch (e: any) {
      setMsg(e.message || "AI 训练失败");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAi = async () => {
    if (!aiResult?.suggested_weights) return;
    setApplyingAi(true);
    try {
      const res = await applyAiSuggestion(aiResult.suggested_weights);
      setMsg(res.message || "AI 建议已应用");
      setAiResult(null);
      queryClient.invalidateQueries({ queryKey: ["vpdFactors"] });
      queryClient.invalidateQueries({ queryKey: ["vpdWeightHistory"] });
    } catch (e: any) {
      setMsg(e.message || "应用失败");
    } finally {
      setApplyingAi(false);
    }
  };

  if (factorsLoading || statsLoading) return <Loading />;

  const draftTotal = Object.values(draftWeights).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* 消息 */}
      {msg && (
        <p className={`text-xs rounded-lg px-4 py-2 ${
          msg.includes("失败") || msg.includes("不足")
            ? "bg-red-500/10 border border-red-500/20 text-red-400"
            : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
        }`}>
          {msg}
        </p>
      )}

      {/* 总体统计 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="总分析" value={stats?.total_analyses ?? 0} />
        <StatCard label="已追踪" value={stats?.tracked_count ?? 0} />
        <StatCard
          label="1h命中率"
          value={`${stats?.overall_hit_rate_1h ?? 0}%`}
          highlight={(stats?.overall_hit_rate_1h ?? 0) > 50}
        />
        <StatCard
          label="4h命中率"
          value={`${stats?.overall_hit_rate_4h ?? 0}%`}
          highlight={(stats?.overall_hit_rate_4h ?? 0) > 50}
        />
      </div>

      {/* 因子权重可视化 */}
      <Card title="因子权重">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">
              来源：{factors?.source === "database" ? "数据库（自定义）" : "默认"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {factors?.source === "database" && (
              <button
                onClick={handleReset}
                disabled={saving}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                恢复默认
              </button>
            )}
            {!editing ? (
              <button
                onClick={handleStartEdit}
                className="rounded-lg bg-[var(--color-accent)]/20 px-3 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-[var(--color-accent)]/30"
              >
                手动调整
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono ${
                  Math.abs(draftTotal - 1) < 0.05 ? "text-emerald-400" : "text-amber-400"
                }`}>
                  合计: {(draftTotal * 100).toFixed(1)}%
                </span>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveWeights}
                  disabled={saving || draftTotal < 0.8 || draftTotal > 1.2}
                  className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 权重条形图 */}
        <div className="space-y-3">
          {factors?.factors.map((f) => {
            const w = editing ? (draftWeights[f.factor_id] ?? f.weight) : f.weight;
            const stat = stats?.factor_stats.find((fs) => fs.factor_id === f.factor_id);
            const color = FACTOR_COLORS[f.factor_id] || "#888";
            return (
              <div key={f.factor_id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs text-zinc-200 font-medium">
                      {FACTOR_NAMES[f.factor_id] || f.factor_id}
                    </span>
                    {stat && (
                      <span className="text-[10px] text-zinc-500">
                        1h:{stat.hit_rate_1h}% · 4h:{stat.hit_rate_4h}%
                      </span>
                    )}
                  </div>
                  {editing ? (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="0.40"
                      value={w}
                      onChange={(e) =>
                        setDraftWeights((prev) => ({
                          ...prev,
                          [f.factor_id]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-16 rounded border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-right text-xs text-zinc-200 outline-none focus:border-accent/40"
                    />
                  ) : (
                    <span className="text-xs font-mono text-zinc-400">
                      {(w * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-white/[0.06]">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(w * 100 * 2.5, 2)}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 因子命中率详情 */}
      <Card title="因子命中率详情">
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs text-zinc-400">统计天数</label>
          <select
            value={statsDays}
            onChange={(e) => setStatsDays(Number(e.target.value))}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200"
          >
            {[3, 7, 14, 30, 60].map((d) => (
              <option key={d} value={d}>{d}天</option>
            ))}
          </select>
        </div>
        {!stats?.factor_stats.length ? (
          <p className="text-xs text-zinc-500">暂无追踪数据，系统会在分析后自动记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="pb-2 text-left text-xs font-medium text-zinc-500">因子</th>
                  <th className="pb-2 text-right text-xs font-medium text-zinc-500">活跃次数</th>
                  <th className="pb-2 text-right text-xs font-medium text-zinc-500">1h命中率</th>
                  <th className="pb-2 text-right text-xs font-medium text-zinc-500">4h命中率</th>
                  <th className="pb-2 text-right text-xs font-medium text-zinc-500">平均得分</th>
                </tr>
              </thead>
              <tbody>
                {stats.factor_stats.map((fs) => (
                  <tr key={fs.factor_id} className="border-b border-white/[0.04]">
                    <td className="py-2 text-xs text-zinc-300">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: FACTOR_COLORS[fs.factor_id] || "#888" }}
                        />
                        {FACTOR_NAMES[fs.factor_id] || fs.factor_id}
                      </div>
                    </td>
                    <td className="py-2 text-right text-xs text-zinc-400 font-mono">
                      {fs.active_count}
                    </td>
                    <td className={`py-2 text-right text-xs font-mono ${
                      fs.hit_rate_1h > 55 ? "text-emerald-400" : fs.hit_rate_1h < 40 ? "text-red-400" : "text-zinc-400"
                    }`}>
                      {fs.hit_rate_1h}%
                    </td>
                    <td className={`py-2 text-right text-xs font-mono ${
                      fs.hit_rate_4h > 55 ? "text-emerald-400" : fs.hit_rate_4h < 40 ? "text-red-400" : "text-zinc-400"
                    }`}>
                      {fs.hit_rate_4h}%
                    </td>
                    <td className="py-2 text-right text-xs text-zinc-400 font-mono">
                      {fs.avg_score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* AI 训练 */}
      <Card title="DeepSeek V3.2 AI 训练">
        <p className="text-xs text-zinc-500 mb-4">
          使用独立的 DeepSeek API Key 分析因子表现并建议优化权重。AI 建议不会自动生效。
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAiTrain}
            disabled={aiLoading}
            className="rounded-lg bg-gradient-to-r from-[#00D4AA]/20 to-[#00D4AA]/10 border border-[#00D4AA]/20 px-4 py-2 text-xs font-semibold text-[#00D4AA] transition-all hover:from-[#00D4AA]/30 hover:to-[#00D4AA]/20 disabled:opacity-50"
          >
            {aiLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#00D4AA] border-t-transparent" />
                AI 分析中...
              </span>
            ) : (
              "🤖 启动 AI 训练"
            )}
          </button>
          <span className="text-[10px] text-zinc-600">分析近 {statsDays} 天数据</span>
        </div>

        {/* AI 结果 */}
        {aiResult && aiResult.ok && aiResult.ai_result && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-[#00D4AA]/20 bg-[#00D4AA]/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-[#00D4AA]">AI 分析结论</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  模型: {aiResult.model} · {aiResult.tokens_used} tokens
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {aiResult.ai_result.analysis}
              </p>
            </div>

            {/* 权重对比 */}
            {aiResult.ai_result.changes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">建议调整：</p>
                {aiResult.ai_result.changes.map((c) => (
                  <div key={c.factor} className="flex items-center gap-3 text-xs">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: FACTOR_COLORS[c.factor] || "#888" }}
                    />
                    <span className="text-zinc-300 min-w-[80px]">
                      {FACTOR_NAMES[c.factor] || c.factor}
                    </span>
                    <span className="font-mono text-zinc-500">
                      {(c.old * 100).toFixed(1)}%
                    </span>
                    <span className="text-zinc-600">→</span>
                    <span className={`font-mono font-bold ${
                      c.new > c.old ? "text-emerald-400" : c.new < c.old ? "text-red-400" : "text-zinc-400"
                    }`}>
                      {(c.new * 100).toFixed(1)}%
                    </span>
                    <span className="text-zinc-500 truncate">{c.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 警告 */}
            {aiResult.ai_result.warnings?.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                {aiResult.ai_result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-400">⚠️ {w}</p>
                ))}
              </div>
            )}

            {/* 确认应用按钮 */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleApplyAi}
                disabled={applyingAi}
                className="rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {applyingAi ? "应用中..." : "✅ 确认应用 AI 建议"}
              </button>
              <button
                onClick={() => setAiResult(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                忽略
              </button>
              <span className="text-[10px] text-zinc-600">
                置信度: {((aiResult.ai_result.confidence || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* 审计日志 */}
      <Card title="权重变更记录">
        {!showHistory ? (
          <button
            onClick={() => setShowHistory(true)}
            className="text-xs text-accent hover:underline"
          >
            加载变更历史
          </button>
        ) : !historyData?.history?.length ? (
          <p className="text-xs text-zinc-500">暂无权重变更记录</p>
        ) : (
          <div className="space-y-3">
            {historyData.history.map((h: WeightAuditEntry) => (
              <div
                key={h.id}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      h.source === "ai_deepseek"
                        ? "bg-[#00D4AA]/20 text-[#00D4AA]"
                        : h.source === "manual"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-zinc-500/20 text-zinc-400"
                    }`}>
                      {h.source === "ai_deepseek" ? "🤖 AI" : h.source === "manual" ? "✏️ 手动" : `🔄 ${h.source}`}
                    </span>
                    <span className="text-xs text-zinc-400">{h.changed_by}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {h.changed_at ? new Date(h.changed_at).toLocaleString("zh-CN") : ""}
                  </span>
                </div>
                {h.notes && <p className="text-xs text-zinc-500 mb-1">{h.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(h.new_weights).map(([fid, nw]) => {
                    const ow = h.old_weights[fid] ?? 0;
                    const diff = nw - ow;
                    if (Math.abs(diff) < 0.001) return null;
                    return (
                      <span key={fid} className="text-[10px] text-zinc-500">
                        {FACTOR_NAMES[fid] || fid}:{" "}
                        <span className={diff > 0 ? "text-emerald-400" : "text-red-400"}>
                          {diff > 0 ? "+" : ""}{(diff * 100).toFixed(1)}%
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── 通用组件 ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${highlight ? "text-bull" : "text-zinc-200"}`}>
        {value}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface rounded-lg p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">{title}</p>
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return <p className="text-sm text-bear text-center py-8">{msg}</p>;
}

// ── 主页面 ──────────────────────────────────────────────────

export default function LearningPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("perf");

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-zinc-200">自主学习</h1>

      {/* Tab 栏 */}
      <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative rounded-md px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "text-accent"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="learning-tab"
                className="absolute inset-0 rounded-md bg-[var(--color-accent)]/10"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === "perf" && <PerfTab />}
      {activeTab === "weights" && <WeightsTab />}
      {activeTab === "factors" && <FactorTab />}
      {activeTab === "calibration" && <CalibrationTab />}
      {activeTab === "db" && <DbTab />}
    </div>
  );
}
