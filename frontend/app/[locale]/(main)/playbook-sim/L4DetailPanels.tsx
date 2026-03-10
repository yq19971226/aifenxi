"use client";

import { useTranslations } from "next-intl";
import { Swords, Shield, Gavel, AlertTriangle } from "lucide-react";
import type { DealerPrediction, DefenseStrategy, JudgeAdoption } from "@/lib/api/playbook-sim";
import { localizeText } from "@/components/analysis/helpers";

export function DealerDetailPanel({ dealer }: { dealer: DealerPrediction }) {
  const t = useTranslations("playbook-sim");
  return (
    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Swords size={14} className="text-orange-400" />
        <span className="text-xs font-semibold text-orange-400">{t("dealer.title")}</span>
      </div>
      <p className="text-sm text-zinc-200">{localizeText(dealer.dealer_plan)}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("dealer.targetPrice")}</span>
          <p className="text-sm font-mono text-zinc-200">
            {dealer.target_price_range?.low ?? "?"} ~ {dealer.target_price_range?.high ?? "?"}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("dealer.stageTransProb")}</span>
          <p className="text-sm font-mono text-zinc-200">
            {((dealer.next_stage_probability ?? 0) * 100).toFixed(0)}%
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("dealer.estTime")}</span>
          <p className="text-sm text-zinc-200">{dealer.estimated_transition ? localizeText(dealer.estimated_transition) : "-"}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("dealer.currentStage")}</span>
          <p className="text-sm font-mono text-zinc-200">{t("dealer.stageN", { n: (dealer.current_stage ?? 0) + 1 })}</p>
        </div>
      </div>
      {dealer.tactics?.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("dealer.tactics")}</span>
          <div className="flex flex-wrap gap-1.5">
            {dealer.tactics.map((tactic, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300">{localizeText(tactic)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DefenseDetailPanel({ defense }: { defense: DefenseStrategy }) {
  const t = useTranslations("playbook-sim");
  const riskColor = defense.risk_level === "high" || defense.risk_level === "极高"
    ? "text-red-400" : defense.risk_level === "moderate" || defense.risk_level === "medium" || defense.risk_level === "中等"
    ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-blue-400">{t("defense.title")}</span>
        <span className={`ml-auto text-xs font-mono ${riskColor}`}>
          {t("defense.risk")}: {localizeText(defense.risk_level)}
        </span>
      </div>
      <p className="text-sm text-zinc-200">{localizeText(defense.defense_summary)}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("defense.entryCondition")}</span>
          <p className="text-sm text-zinc-200">{defense.entry?.condition ? localizeText(defense.entry.condition) : "-"}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("defense.stopLossLogic")}</span>
          <p className="text-sm text-zinc-200">{defense.stop_loss?.logic ? localizeText(defense.stop_loss.logic) : "-"}</p>
        </div>
      </div>
      {defense.confirmation_signals?.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("defense.confirmSignals")}</span>
          <div className="flex flex-wrap gap-1.5">
            {defense.confirmation_signals.map((s, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">{localizeText(s)}</span>
            ))}
          </div>
        </div>
      )}
      {defense.risk_warning && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <span className="text-xs text-red-300">{localizeText(defense.risk_warning)}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">{t("defense.confidence")}</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(defense.confidence ?? 0) * 100}%` }} />
        </div>
        <span className="text-xs font-mono text-blue-400">{((defense.confidence ?? 0) * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

export function JudgeDetailPanel({ judge }: { judge: JudgeAdoption }) {
  const t = useTranslations("playbook-sim");
  const adoptionLabel: Record<string, string> = {
    adopt: `✅ ${t("judge.adopt")}`, partial: `⚠️ ${t("judge.partial")}`, wait: `⏸ ${t("judge.wait")}`,
  };

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Gavel size={14} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-400">{t("judge.title")}</span>
        </div>
        <span className="text-sm font-semibold text-white">
          {adoptionLabel[judge.adoption] || judge.adoption}
        </span>
      </div>
      <p className="text-sm text-zinc-200">{localizeText(judge.final_recommendation)}</p>
      {judge.next_move && (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
          <span className="text-xs text-zinc-500">{t("judge.nextAction")}</span>
          <p className="text-sm text-emerald-300 font-medium mt-0.5">{localizeText(judge.next_move)}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <span className="text-xs text-zinc-500">{t("judge.dealerCredibility")}</span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(judge.dealer_credibility ?? 0) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-orange-400">{((judge.dealer_credibility ?? 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-zinc-500">{t("judge.defenseFeasibility")}</span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(judge.defense_feasibility ?? 0) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-blue-400">{((judge.defense_feasibility ?? 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
      {judge.risk_alerts?.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{t("judge.riskAlerts")}</span>
          <ul className="space-y-1">
            {judge.risk_alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />{localizeText(a)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {judge.reasoning && (
        <details className="group">
          <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors">
            {t("judge.reasoning")}
          </summary>
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{localizeText(judge.reasoning)}</p>
        </details>
      )}
    </div>
  );
}
