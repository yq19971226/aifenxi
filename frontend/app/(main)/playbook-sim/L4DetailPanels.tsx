"use client";

import { Swords, Shield, Gavel, AlertTriangle } from "lucide-react";
import type { DealerPrediction, DefenseStrategy, JudgeAdoption } from "@/lib/api/playbook-sim";

export function DealerDetailPanel({ dealer }: { dealer: DealerPrediction }) {
  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Swords size={14} className="text-orange-400" />
        <span className="text-xs font-semibold text-orange-400">庄家AI推演</span>
      </div>
      <p className="text-sm text-zinc-200">{dealer.dealer_plan}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">目标价位</span>
          <p className="text-sm font-mono text-zinc-200">
            {dealer.target_price_range?.low ?? "?"} ~ {dealer.target_price_range?.high ?? "?"}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">阶段转换概率</span>
          <p className="text-sm font-mono text-zinc-200">
            {((dealer.next_stage_probability ?? 0) * 100).toFixed(0)}%
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">预计时间</span>
          <p className="text-sm text-zinc-200">{dealer.estimated_transition || "-"}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">当前阶段</span>
          <p className="text-sm font-mono text-zinc-200">第{(dealer.current_stage ?? 0) + 1}阶段</p>
        </div>
      </div>
      {dealer.tactics?.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">庄家手段</span>
          <div className="flex flex-wrap gap-1.5">
            {dealer.tactics.map((t, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300">{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DefenseDetailPanel({ defense }: { defense: DefenseStrategy }) {
  const riskColor = defense.risk_level === "high" || defense.risk_level === "极高"
    ? "text-red-400" : defense.risk_level === "moderate" || defense.risk_level === "中等"
    ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-blue-400">防御AI反制</span>
        <span className={`ml-auto text-xs font-mono ${riskColor}`}>
          风险: {defense.risk_level}
        </span>
      </div>
      <p className="text-sm text-zinc-200">{defense.defense_summary}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">进场条件</span>
          <p className="text-sm text-zinc-200">{defense.entry?.condition || "-"}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">止损逻辑</span>
          <p className="text-sm text-zinc-200">{defense.stop_loss?.logic || "-"}</p>
        </div>
      </div>
      {defense.confirmation_signals?.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">确认信号</span>
          <div className="flex flex-wrap gap-1.5">
            {defense.confirmation_signals.map((s, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">{s}</span>
            ))}
          </div>
        </div>
      )}
      {defense.risk_warning && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <span className="text-xs text-red-300">{defense.risk_warning}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">防御置信度</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(defense.confidence ?? 0) * 100}%` }} />
        </div>
        <span className="text-xs font-mono text-blue-400">{((defense.confidence ?? 0) * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

export function JudgeDetailPanel({ judge }: { judge: JudgeAdoption }) {
  const adoptionLabel: Record<string, string> = {
    adopt: "✅ 采纳防御策略", partial: "⚠️ 部分采纳", wait: "⏸ 建议观望",
  };

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Gavel size={14} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-400">裁判AI采纳</span>
        </div>
        <span className="text-sm font-semibold text-white">
          {adoptionLabel[judge.adoption] || judge.adoption}
        </span>
      </div>
      <p className="text-sm text-zinc-200">{judge.final_recommendation}</p>
      {judge.next_move && (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
          <span className="text-xs text-zinc-500">下一步操作</span>
          <p className="text-sm text-emerald-300 font-medium mt-0.5">{judge.next_move}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <span className="text-xs text-zinc-500">庄家可信度</span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(judge.dealer_credibility ?? 0) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-orange-400">{((judge.dealer_credibility ?? 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-zinc-500">防御可行性</span>
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
          <span className="text-xs text-zinc-500">风险提醒</span>
          <ul className="space-y-1">
            {judge.risk_alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />{a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {judge.reasoning && (
        <details className="group">
          <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors">
            裁判推理过程
          </summary>
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{judge.reasoning}</p>
        </details>
      )}
    </div>
  );
}
