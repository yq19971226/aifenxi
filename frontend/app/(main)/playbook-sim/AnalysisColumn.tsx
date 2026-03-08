"use client";

import { Shield, Clock, Brain, Eye, Activity } from "lucide-react";
import type { SimResult, PlaybookMatch } from "@/lib/api/playbook-sim";
import type { PlaybookLatest, PhaseHistory } from "@/lib/api/playbook";
import CounterStrategyPanel from "./CounterStrategyPanel";

interface Props {
  sim: SimResult;
  activeMatch: PlaybookMatch | null;
  latest?: PlaybookLatest | null;
  phaseHistory?: PhaseHistory | null;
}

export default function AnalysisColumn({ sim, activeMatch, latest, phaseHistory }: Props) {
  return (
    <div className="xl:col-span-7 space-y-5">
      {sim.llm_prediction && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={14} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">AI 推演预测</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">当前阶段</span>
              <p className="text-sm font-semibold text-white mt-1">第 {sim.llm_prediction.current_stage + 1} 阶段</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">下阶段概率</span>
              <p className="text-sm font-semibold text-emerald-400 mt-1">{(sim.llm_prediction.next_stage_probability * 100).toFixed(0)}%</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">预计转换</span>
              <p className="text-sm font-semibold text-indigo-400 mt-1">{sim.llm_prediction.estimated_transition}</p>
            </div>
          </div>
          {(sim.llm_prediction.key_observations ?? []).length > 0 && (
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">关键观察</span>
              <ul className="space-y-2">
                {(sim.llm_prediction.key_observations ?? []).map((obs, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Eye size={12} className="text-purple-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-zinc-300 leading-relaxed">{obs}</span>
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
            <span className="text-sm font-semibold text-white">反制策略</span>
          </div>
          <CounterStrategyPanel cs={activeMatch.counter_strategy} />
        </div>
      )}

      {latest?.reasoning && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-indigo-400" />
            <span className="text-sm font-semibold text-white">分析推理</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{latest.reasoning}</p>
          {latest.next_move && (
            <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <span className="text-xs uppercase tracking-widest text-zinc-500">预判下一步</span>
              <p className="text-sm font-medium text-emerald-400 mt-1">{latest.next_move}</p>
            </div>
          )}
        </div>
      )}

      {phaseHistory && phaseHistory.transitions.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-zinc-400" />
            <span className="text-sm font-semibold text-white">阶段转换历史</span>
          </div>
          <div className="space-y-2">
            {phaseHistory.transitions.slice(-6).reverse().map((t, i) => (
              <div key={i} className="flex items-center gap-3 text-xs p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-indigo-400 w-24 shrink-0 font-mono text-sm">
                  {new Date(t.ts).toLocaleString("zh-CN", {
                    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                <span className="text-zinc-400">{t.from}</span>
                <span className="text-zinc-600">&rarr;</span>
                <span className="text-white font-medium">{t.to}</span>
                <span className="text-zinc-500 text-sm truncate ml-auto">{t.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
