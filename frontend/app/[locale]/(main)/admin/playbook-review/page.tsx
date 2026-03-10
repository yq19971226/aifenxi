"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminPredictions,
  togglePublish,
  deletePrediction,
  batchPublish,
  type AdminPredictionList,
} from "@/lib/api/admin-playbook-sim";
import { localizeText } from "@/components/analysis/helpers";
import { useAuth } from "@/lib/auth-context";
import { getMarketStructureLabel, getMatchPctColor, getRankingReasonCopy } from "../../playbook-sim/playbook-constants";

export default function PlaybookReviewPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterPublished, setFilterPublished] = useState<
    "all" | "true" | "false"
  >("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opError, setOpError] = useState<string | null>(null);

  const isAdmin = !!user && user.role === "admin";

  const { data, isLoading, error: fetchError } = useQuery<AdminPredictionList>({
    queryKey: ["adminPredictions", page, filterPublished],
    queryFn: () =>
      fetchAdminPredictions({
        page,
        page_size: 20,
        published:
          filterPublished === "all"
            ? undefined
            : filterPublished === "true",
      }),
    enabled: isAdmin,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, pub }: { id: string; pub: boolean }) =>
      togglePublish(id, pub),
    onSuccess: () => { setOpError(null); qc.invalidateQueries({ queryKey: ["adminPredictions"] }); },
    onError: (err: Error) => setOpError(err.message || "发布/下架操作失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePrediction(id),
    onSuccess: () => { setOpError(null); qc.invalidateQueries({ queryKey: ["adminPredictions"] }); },
    onError: (err: Error) => setOpError(err.message || "删除失败"),
  });

  const batchMut = useMutation({
    mutationFn: (ids: number[]) => batchPublish(ids),
    onSuccess: () => {
      setOpError(null);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["adminPredictions"] });
    },
    onError: (err: Error) => setOpError(err.message || "批量发布失败"),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!data) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((i) => i.id)));
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-zinc-200">剧本广场审核</h1>

      {/* 错误提示 */}
      {(opError || fetchError) && (
        <div className="rounded-lg border border-[var(--color-bear)]/30 bg-[var(--color-bear)]/5 px-4 py-3 text-sm text-bear">
          {opError || (fetchError instanceof Error ? fetchError.message : "加载失败")}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterPublished}
          onChange={(e) => {
            setFilterPublished(e.target.value as "all" | "true" | "false");
            setPage(1);
          }}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-200"
        >
          <option value="all">全部状态</option>
          <option value="true">已发布</option>
          <option value="false">未发布</option>
        </select>

        {selected.size > 0 && (
          <button
            onClick={() =>
              batchMut.mutate(
                Array.from(selected).map((id) => parseInt(id, 10))
              )
            }
            disabled={batchMut.isPending}
            className="rounded-lg bg-[var(--color-bull)]/20 px-4 py-2 text-xs font-semibold text-bull hover:bg-[var(--color-bull)]/30 disabled:opacity-50"
          >
            {batchMut.isPending
              ? "发布中…"
              : `批量发布 (${selected.size})`}
          </button>
        )}

        <span className="ml-auto text-xs text-zinc-500">
          共 {data?.total || 0} 条记录
        </span>
      </div>

      {/* 表格 */}
      {isLoading ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-12">暂无预测记录</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/[0.08] bg-white/[0.02]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      !!data &&
                      data.items.length > 0 &&
                      selected.size === data.items.length
                    }
                    onChange={selectAll}
                    className="accent-[var(--color-accent)]"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">
                  币种
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">
                  剧本
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">
                  上榜依据
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-zinc-500">
                  匹配度
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">
                  市场结构
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-zinc-500">
                  状态
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-zinc-500">
                  发布
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-zinc-500">
                  准确率
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-zinc-500">
                  时间
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-zinc-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item) => {
                const rankingReason = getRankingReasonCopy({
                  dominant_factors: item.dominant_factors,
                  ranking_reason_summary: item.ranking_reason_summary,
                  decision_sentence: item.decision_sentence,
                });
                const inferredStructureLabels =
                  item.inferred_market_structures?.map((value) => getMarketStructureLabel(value) || value) ?? [];
                const boosterItems =
                  item.matched_confidence_boosters?.map((value) => localizeText(value)) ?? [];
                const invalidationItems =
                  item.matched_invalidation_signals?.map((value) => localizeText(value)) ?? [];
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-white/[0.04] transition-colors ${
                      selected.has(item.id) ? "bg-[var(--color-accent)]/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="accent-[var(--color-accent)]"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-zinc-300 font-mono">
                      {item.symbol}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-zinc-300">
                      <div className="space-y-1">
                        <div>{item.playbook_name}</div>
                        {item.market_structure_type && (
                          <div className="text-[11px] text-indigo-300">
                            {getMarketStructureLabel(item.market_structure_type)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-zinc-300">
                      <div className="max-w-[320px] space-y-1">
                        <div className="text-[11px] text-indigo-200">
                          {rankingReason.decisionSentence || "—"}
                        </div>
                        {rankingReason.dominantFactors.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {rankingReason.dominantFactors.slice(0, 3).map((factor) => (
                              <span
                                key={`${item.id}-${factor}`}
                                className="rounded bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-300"
                              >
                                {factor}
                              </span>
                            ))}
                          </div>
                        )}
                        {(item.structure_explanation ||
                          boosterItems.length > 0 ||
                          invalidationItems.length > 0 ||
                          inferredStructureLabels.length > 0) && (
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 text-[10px] text-zinc-400 space-y-1.5">
                            {item.structure_explanation && (
                              <div>
                                <span className="text-zinc-500">结构解释:</span>{" "}
                                <span className="text-indigo-200">{item.structure_explanation}</span>
                              </div>
                            )}
                            {inferredStructureLabels.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {inferredStructureLabels.slice(0, 3).map((label) => (
                                  <span
                                    key={`${item.id}-structure-${label}`}
                                    className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-200"
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div>
                              <span className="text-zinc-500">Booster:</span>{" "}
                              {boosterItems.length > 0 ? boosterItems.slice(0, 3).join(" / ") : "未命中"}
                            </div>
                            <div>
                              <span className="text-zinc-500">失效信号:</span>{" "}
                              {invalidationItems.length > 0 ? invalidationItems.slice(0, 3).join(" / ") : "未命中"}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right text-xs font-mono">
                      <span className={getMatchPctColor(item.match_pct)}>
                        {item.match_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-indigo-300">
                      {getMarketStructureLabel(item.market_structure_type) || "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top text-center">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs ${
                          item.status === "active"
                            ? "bg-[var(--color-accent)]/10 text-accent"
                            : item.status === "completed"
                              ? "bg-[var(--color-bull)]/10 text-bull"
                              : item.status === "failed"
                                ? "bg-[var(--color-bear)]/10 text-bear"
                                : "bg-white/[0.04] text-zinc-500"
                        }`}
                      >
                        {item.status === "active"
                          ? "进行中"
                          : item.status === "completed"
                            ? "已完成"
                            : item.status === "failed"
                              ? "已失效"
                              : item.status === "expired"
                                ? "已过期"
                                : item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-center">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                          item.published
                            ? "bg-[var(--color-bull)]/10 text-bull"
                            : "bg-[var(--color-bear)]/10 text-bear"
                        }`}
                      >
                        {item.published ? "已发布" : "未发布"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right text-xs font-mono text-zinc-400">
                      {item.final_accuracy != null
                        ? `${(item.final_accuracy * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right text-xs text-zinc-500">
                      {item.created_at?.slice(0, 16).replace("T", " ") || "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() =>
                            toggleMut.mutate({
                              id: item.id,
                              pub: !item.published,
                            })
                          }
                          disabled={toggleMut.isPending}
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                            item.published
                              ? "bg-[var(--color-bear)]/10 text-bear hover:bg-[var(--color-bear)]/20"
                              : "bg-[var(--color-bull)]/10 text-bull hover:bg-[var(--color-bull)]/20"
                          }`}
                        >
                          {item.published ? "下架" : "发布"}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`确定删除 ${item.symbol} - ${item.playbook_name}？`)) {
                              deleteMut.mutate(item.id);
                            }
                          }}
                          disabled={deleteMut.isPending}
                          className="rounded px-2 py-1 text-xs font-medium text-zinc-500 bg-white/[0.04] hover:bg-[var(--color-bear)]/10 hover:text-bear transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      {data && data.total > data.page_size && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded px-3 py-1 text-xs text-zinc-400 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30"
          >
            上一页
          </button>
          <span className="text-xs text-zinc-500 py-1">
            {page} / {Math.ceil(data.total / data.page_size)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(data.total / data.page_size)}
            className="rounded px-3 py-1 text-xs text-zinc-400 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30"
          >
            下一页
          </button>
        </div>
      )}
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
