"use client";

import { useTranslations, useLocale } from "next-intl";
import { Shield, Clock, Brain, Eye, Activity, BarChart3 } from "lucide-react";
import type { SimResult, PlaybookMatch } from "@/lib/api/playbook-sim";
import type { PlaybookLatest, PhaseHistory } from "@/lib/api/playbook";
import CounterStrategyPanel from "./CounterStrategyPanel";
import { localizeText } from "@/components/analysis/helpers";
import { getMarketStructureLabel } from "./playbook-constants";

interface Props {
  sim: SimResult;
  activeMatch: PlaybookMatch | null;
  latest?: PlaybookLatest | null;
  phaseHistory?: PhaseHistory | null;
}

export default function AnalysisColumn({ sim, activeMatch, latest, phaseHistory }: Props) {
  const t = useTranslations("playbook-sim");
  const locale = useLocale();
  const matchedStructureLabels = (activeMatch?.inferred_market_structures ?? [])
    .map((value) => getMarketStructureLabel(value) || value)
    .slice(0, 3);
  const matchedBoosterItems = (activeMatch?.matched_confidence_boosters ?? []).slice(0, 2);
  const matchedInvalidationItems = (activeMatch?.matched_invalidation_signals ?? []).slice(0, 2);
  const scoreBreakdown = activeMatch?.score_breakdown;
  const dominantDrivers = scoreBreakdown
    ? [
        { label: "特征命中", value: scoreBreakdown.feature_score },
        { label: "数据域命中", value: scoreBreakdown.domain_score },
        { label: "环境命中", value: scoreBreakdown.regime_score },
        { label: "结构命中", value: scoreBreakdown.structure_score },
        { label: "Booster 加分", value: scoreBreakdown.booster_bonus },
        { label: "阶段加分", value: scoreBreakdown.stage_bonus },
      ]
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];
  const dominantSummary = dominantDrivers.slice(0, 2).map((item) => item.label).join(" + ");
  const invalidationSummary =
    (scoreBreakdown?.invalidation_penalty ?? 0) > 0 ? "，但被失效信号部分压分" : "";

  const rankingReasons: string[] = [];
  if (activeMatch?.structure_matched) {
    rankingReasons.push(`结构命中: ${getMarketStructureLabel(activeMatch.market_structure_type) || "当前结构"}`);
  } else if (matchedStructureLabels.length > 0) {
    rankingReasons.push(`识别结构: ${matchedStructureLabels.join(" / ")}`);
  }
  if ((activeMatch?.matched_domains ?? 0) > 0 && (activeMatch?.total_domains ?? 0) > 0) {
    rankingReasons.push(`数据域命中 ${activeMatch?.matched_domains}/${activeMatch?.total_domains}`);
  }
  if ((activeMatch?.matched_regimes ?? 0) > 0 && (activeMatch?.total_regimes ?? 0) > 0) {
    rankingReasons.push(`环境命中 ${activeMatch?.matched_regimes}/${activeMatch?.total_regimes}`);
  }
  if (matchedBoosterItems.length > 0) {
    rankingReasons.push(`Booster 加分 ${matchedBoosterItems.length} 项`);
  }
  if ((scoreBreakdown?.stage_bonus ?? 0) > 0) {
    rankingReasons.push("当前阶段对齐");
  }

  return (
    <div className="xl:col-span-7 space-y-5">
      {activeMatch && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-indigo-400" />
            <span className="text-sm font-semibold text-white">当前排名依据</span>
          </div>
          <div className="space-y-3">
            {dominantSummary && (
              <div className="rounded-lg border border-indigo-500/10 bg-indigo-500/5 p-3">
                <span className="text-[11px] uppercase tracking-widest text-zinc-500">主导因子</span>
                <p className="mt-1 text-sm text-indigo-200">
                  当前主要由 {dominantSummary} 推上榜首{invalidationSummary}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {rankingReasons.length > 0 ? (
                rankingReasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200"
                  >
                    {reason}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-500">当前主要依赖基础特征与阶段命中。</span>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="text-[11px] uppercase tracking-widest text-zinc-500">结构解释</span>
                <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
                  {activeMatch.structure_matched
                    ? `当前快照直接命中 ${getMarketStructureLabel(activeMatch.market_structure_type) || "该结构"}。`
                    : matchedStructureLabels.length > 0
                    ? `当前快照识别到 ${matchedStructureLabels.join(" / ")}，但未完全对齐主结构。`
                    : "当前快照没有形成明确结构命中。"}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3">
                <span className="text-[11px] uppercase tracking-widest text-zinc-500">Booster</span>
                {matchedBoosterItems.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {matchedBoosterItems.map((item) => (
                      <li key={item} className="text-xs text-zinc-300 leading-relaxed">
                        + {localizeText(item)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">当前没有额外增强项加分。</p>
                )}
              </div>
              <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 p-3">
                <span className="text-[11px] uppercase tracking-widest text-zinc-500">失效信号</span>
                {matchedInvalidationItems.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {matchedInvalidationItems.map((item) => (
                      <li key={item} className="text-xs text-amber-200 leading-relaxed">
                        - {localizeText(item)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">当前没有检测到失效信号扣分。</p>
                )}
              </div>
            </div>
            {scoreBreakdown && (
              <div className="grid gap-2 md:grid-cols-4">
                <div className="text-xs text-zinc-400">特征 <span className="ml-2 font-mono text-white">{(scoreBreakdown.feature_score * 100).toFixed(0)}%</span></div>
                <div className="text-xs text-zinc-400">数据域 <span className="ml-2 font-mono text-white">{(scoreBreakdown.domain_score * 100).toFixed(0)}%</span></div>
                <div className="text-xs text-zinc-400">环境 <span className="ml-2 font-mono text-white">{(scoreBreakdown.regime_score * 100).toFixed(0)}%</span></div>
                <div className="text-xs text-zinc-400">结构 <span className="ml-2 font-mono text-white">{(scoreBreakdown.structure_score * 100).toFixed(0)}%</span></div>
                <div className="text-xs text-zinc-400">Booster <span className="ml-2 font-mono text-emerald-300">+{(scoreBreakdown.booster_bonus * 100).toFixed(0)}%</span></div>
                <div className="text-xs text-zinc-400">失效扣分 <span className="ml-2 font-mono text-amber-300">-{(scoreBreakdown.invalidation_penalty * 100).toFixed(0)}%</span></div>
                <div className="text-xs text-zinc-400">阶段加分 <span className="ml-2 font-mono text-indigo-300">+{(scoreBreakdown.stage_bonus * 100).toFixed(0)}%</span></div>
                <div className="text-xs text-zinc-400">综合 <span className="ml-2 font-mono text-white">{(scoreBreakdown.weighted_score * 100).toFixed(1)}%</span></div>
              </div>
            )}
            {dominantDrivers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dominantDrivers.map((item, idx) => (
                  <span
                    key={`${item.label}-${idx}`}
                    className="rounded bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-300"
                  >
                    {idx + 1}. {item.label} {(item.value * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {latest?.all_probabilities && Object.keys(latest.all_probabilities).length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-emerald-400" />
            <span className="text-sm font-semibold text-white">{t("analysis.probDist")}</span>
          </div>
          <div className="space-y-2.5">
            {Object.entries(latest.all_probabilities)
              .sort(([, a], [, b]) => b - a)
              .map(([name, prob]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-24 shrink-0 truncate">{name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${prob >= 0.5 ? "bg-red-500" : prob >= 0.3 ? "bg-amber-500" : "bg-indigo-500"}`}
                      style={{ width: `${Math.min(prob * 100, 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono w-10 text-right ${prob >= 0.5 ? "text-red-400" : prob >= 0.3 ? "text-amber-400" : "text-zinc-300"}`}>
                    {(prob * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {sim.llm_prediction && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={14} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">{t("analysis.aiPrediction")}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t("analysis.currentStage")}</span>
              <p className="text-sm font-semibold text-white mt-1">{t("analysis.stageN", { n: sim.llm_prediction.current_stage + 1 })}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t("analysis.nextStageProb")}</span>
              <p className="text-sm font-semibold text-emerald-400 mt-1">{(sim.llm_prediction.next_stage_probability * 100).toFixed(0)}%</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t("analysis.estTransition")}</span>
              <p className="text-sm font-semibold text-indigo-400 mt-1">{localizeText(sim.llm_prediction.estimated_transition)}</p>
            </div>
          </div>
          {(sim.llm_prediction.key_observations ?? []).length > 0 && (
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">{t("analysis.keyObservations")}</span>
              <ul className="space-y-2">
                {(sim.llm_prediction.key_observations ?? []).map((obs, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Eye size={12} className="text-purple-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-zinc-300 leading-relaxed">{localizeText(obs)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeMatch?.counter_strategy && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={14} className="text-emerald-400" />
            <span className="text-sm font-semibold text-white">{t("analysis.counterStrategy")}</span>
          </div>
          <CounterStrategyPanel cs={activeMatch.counter_strategy} />
        </div>
      )}

      {latest?.reasoning && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-indigo-400" />
            <span className="text-sm font-semibold text-white">{t("analysis.reasoning")}</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{localizeText(latest.reasoning)}</p>
          {latest.next_move && (
            <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t("analysis.nextMove")}</span>
              <p className="text-sm font-medium text-emerald-400 mt-1">{localizeText(latest.next_move)}</p>
            </div>
          )}
        </div>
      )}

      {phaseHistory && phaseHistory.transitions.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-zinc-400" />
            <span className="text-sm font-semibold text-white">{t("analysis.phaseHistory")}</span>
          </div>
          <div className="space-y-2">
            {phaseHistory.transitions.slice(-6).reverse().map((tr, i) => (
              <div key={i} className="flex items-center gap-3 text-xs p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-indigo-400 w-24 shrink-0 font-mono text-sm">
                  {new Date(tr.ts).toLocaleString(locale, {
                    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                <span className="text-zinc-400">{localizeText(tr.from)}</span>
                <span className="text-zinc-500">&rarr;</span>
                <span className="text-white font-medium">{localizeText(tr.to)}</span>
                <span className="text-zinc-500 text-sm truncate ml-auto">{localizeText(tr.reason)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
