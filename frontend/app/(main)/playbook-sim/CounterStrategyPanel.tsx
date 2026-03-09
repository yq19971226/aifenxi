"use client";

import { TrendingUp, Shield, AlertTriangle, Clock } from "lucide-react";
import { localizeText } from "@/components/analysis/helpers";

interface CounterStrategy {
  action: string;
  entry_logic: string;
  stop_loss_logic: string;
  target_logic: string;
  risk_level: string;
  wait_signal: string;
  risk_warning: string;
}

export default function CounterStrategyPanel({ cs }: { cs: CounterStrategy }) {
  const isHighRisk = cs.risk_level === "high" || cs.risk_level === "极高";
  const isMedRisk = cs.risk_level === "medium" || cs.risk_level === "中等";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
        <span className="text-sm font-medium text-white">{localizeText(cs.action)}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium border ${
          isHighRisk ? "text-red-400 bg-red-500/10 border-red-500/20"
            : isMedRisk ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
              : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        }`}>
          风险: {localizeText(cs.risk_level)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/[0.06] border-b border-emerald-500/10">
            <TrendingUp size={12} className="text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">进攻端</span>
          </div>
          <div className="p-3">
            <p className="text-xs text-zinc-500 mb-1">进场逻辑</p>
            <p className="text-xs text-zinc-300 leading-relaxed">{localizeText(cs.entry_logic)}</p>
            {cs.wait_signal && (
              <div className="mt-2.5 pt-2.5 border-t border-white/[0.04]">
                <div className="flex items-start gap-1.5">
                  <Clock size={10} className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500">等待信号</p>
                    <p className="text-xs text-zinc-300 mt-0.5">{localizeText(cs.wait_signal)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-indigo-500/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/[0.06] border-b border-indigo-500/10">
            <Shield size={12} className="text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">防御端</span>
          </div>
          <div className="p-3 space-y-2.5">
            <div>
              <p className="text-xs text-red-400/70 mb-0.5">止损逻辑</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{localizeText(cs.stop_loss_logic)}</p>
            </div>
            <div className="pt-2.5 border-t border-white/[0.04]">
              <p className="text-xs text-emerald-400/70 mb-0.5">目标逻辑</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{localizeText(cs.target_logic)}</p>
            </div>
          </div>
        </div>
      </div>

      {cs.risk_warning && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/[0.03] border border-red-500/15">
          <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-xs uppercase tracking-widest text-red-400 block">风险警告</span>
            <span className="text-xs text-red-300/80">{localizeText(cs.risk_warning)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
