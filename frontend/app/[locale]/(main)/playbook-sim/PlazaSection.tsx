"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { BarChart3, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { PlazaFeed, PlazaStats } from "@/lib/api/playbook-sim";
import { localizeText } from "@/components/analysis/helpers";
import { getMarketStructureLabel, getMatchPctColor, getRankingReasonCopy, getStatusBadge } from "./playbook-constants";

interface Props {
  plaza?: PlazaFeed;
  plazaLoading: boolean;
  plazaStats?: PlazaStats;
}

export default function PlazaSection({ plaza, plazaLoading, plazaStats }: Props) {
  const t = useTranslations("playbook-sim");
  const locale = useLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatPrice = (value?: number | null) => {
    if (value == null || Number.isNaN(value)) return "—";
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      {plazaStats && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-amber-400" />
            <span className="text-sm font-semibold text-white">{t("plazaSection.statsTitle")}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t("plazaSection.totalPredictions")}</span>
              <p className="text-sm font-semibold text-white mt-1">{plazaStats.total_predictions}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t("plazaSection.activeCount")}</span>
              <p className="text-sm font-semibold text-emerald-400 mt-1">{plazaStats.active_count}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t("plazaSection.completedCount")}</span>
              <p className="text-sm font-semibold text-white mt-1">{plazaStats.completed_count}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t("plazaSection.avgAccuracy")}</span>
              <p className="text-sm font-semibold text-amber-400 mt-1">
                {(plazaStats.avg_accuracy * 100).toFixed(1)}%
              </p>
            </div>
          </div>
          {plazaStats.top_playbooks.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              <span className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">{t("plazaSection.topPlaybooks")}</span>
              <div className="space-y-1.5">
                {plazaStats.top_playbooks.slice(0, 3).map((p, idx) => (
                  <div key={`${p.name}-${idx}`} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.02]">
                    <span className="text-xs text-zinc-300">{p.name}</span>
                    <span className="text-sm font-mono text-indigo-400">{p.count} {t("plazaSection.times")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="xl:col-span-2 card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <span className="text-sm font-semibold text-white">{t("plazaSection.plazaTitle")}</span>
          <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
            {t("plazaSection.predictionCount", { count: plaza?.total || 0 })}
          </span>
        </div>
        {plazaLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="animate-spin text-zinc-500" />
          </div>
        ) : !plaza || plaza.items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-zinc-500">{t("plazaSection.noRecords")}</span>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {plaza.items.map((item) => {
              const badge = getStatusBadge(item.status, item.risk_flag);
              const marketStructureLabel = getMarketStructureLabel(item.market_structure_type);
              const stageCount = item.stages?.length ?? 0;
              const currentStage =
                item.current_stage_idx != null && item.current_stage_idx >= 0
                  ? item.current_stage_idx + 1
                  : null;
              const isExpanded = expandedId === item.id;
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
                <div key={item.id} className="px-5 py-3 transition-colors hover:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-medium text-white font-mono">{item.symbol}</span>
                        <span className="text-xs text-zinc-400 truncate">{item.playbook_name}</span>
                        {item.created_at && (
                          <span className="text-xs text-zinc-500">
                            {new Date(item.created_at).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {marketStructureLabel && (
                          <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-300">
                            {marketStructureLabel}
                          </span>
                        )}
                        {item.signal && item.signal !== "neutral" && (
                          <span className={`rounded px-2 py-0.5 text-[11px] ${
                            item.signal === "bullish"
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-red-500/10 text-red-300"
                          }`}>
                            {item.signal === "bullish" ? t("plazaSection.bullishSim") : t("plazaSection.bearishSim")}
                          </span>
                        )}
                        {item.risk_note && (
                          <span className="truncate text-[11px] text-amber-300">
                            {t("plazaSection.riskPrefix")}: {item.risk_note}
                          </span>
                        )}
                      </div>
                      {(rankingReason.decisionSentence || rankingReason.dominantFactors.length > 0) && (
                        <div className="mt-2 space-y-1">
                          {rankingReason.decisionSentence && (
                            <div className="truncate text-[11px] text-indigo-200">
                              {rankingReason.decisionSentence}
                            </div>
                          )}
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
                        </div>
                      )}
                    </div>
                    <div className="flex items-start gap-3 shrink-0">
                      <div className="text-right">
                        <span className={`block text-sm font-mono font-semibold ${getMatchPctColor(item.match_pct)}`}>
                          {item.match_pct.toFixed(0)}%
                        </span>
                        <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${badge.bg} ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="rounded border border-white/[0.08] bg-white/[0.03] p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                        aria-label={isExpanded ? "收起详情" : "展开详情"}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">阶段进度</div>
                          <div className="mt-1 text-xs text-zinc-200">
                            {currentStage && stageCount > 0 ? `第 ${currentStage}/${stageCount} 阶段` : "—"}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            已验证 {item.verified_stages ?? 0} 阶段
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">复盘结果</div>
                          <div className="mt-1 text-xs text-zinc-200">
                            {item.final_accuracy != null ? `准确率 ${(item.final_accuracy * 100).toFixed(1)}%` : "等待结算"}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            状态 {badge.label}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">价格上下文</div>
                          <div className="mt-1 text-xs text-zinc-200">快照价 {formatPrice(item.snapshot_price)}</div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            阶段入场价 {formatPrice(item.stage_entry_price)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">风险备注</div>
                          <div className="mt-1 text-xs text-zinc-200">
                            {item.risk_note || item.failure_reason || "—"}
                          </div>
                          {item.failure_reason && (
                            <div className="mt-1 text-[11px] text-red-300">
                              失效原因: {item.failure_reason}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-indigo-500/10 bg-indigo-500/5 p-3">
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">结构解释</div>
                          <div className="mt-1 text-xs text-indigo-200">
                            {item.structure_explanation || "—"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {inferredStructureLabels.length > 0 ? (
                              inferredStructureLabels.slice(0, 3).map((label) => (
                                <span
                                  key={`${item.id}-structure-${label}`}
                                  className="rounded bg-white/[0.05] px-2 py-0.5 text-[10px] text-zinc-300"
                                >
                                  {label}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-zinc-500">无额外结构线索</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3">
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Booster 命中</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {boosterItems.length > 0 ? (
                              boosterItems.slice(0, 4).map((label) => (
                                <span
                                  key={`${item.id}-booster-${label}`}
                                  className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"
                                >
                                  {label}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-zinc-500">未命中</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 p-3">
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">失效信号命中</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {invalidationItems.length > 0 ? (
                              invalidationItems.slice(0, 4).map((label) => (
                                <span
                                  key={`${item.id}-invalid-${label}`}
                                  className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200"
                                >
                                  {label}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-zinc-500">未命中</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
