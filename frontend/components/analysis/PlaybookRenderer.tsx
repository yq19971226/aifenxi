"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronRight,
  Crosshair,
  Shield,
  AlertTriangle,
  Zap,
  ArrowRight,
  Target,
  BarChart3,
} from "lucide-react";
import { localizeText } from "./helpers";
import { cn } from "@/lib/utils";

interface CounterStrategy {
  action?: string;
  strategy_type?: string;
  entry_price?: string;
  stop_loss?: string;
  take_profit_1?: string;
  take_profit_2?: string;
  wait_signal?: string;
  risk_warning?: string;
  risk_level?: string;
}

interface PlaybookData {
  matched_playbook?: string;
  probability?: number;
  all_probabilities?: Record<string, number>;
  stage_description?: string;
  next_move?: string;
  counter_strategy?: CounterStrategy;
  current_phase?: string;
  phase_transition?: {
    from: string;
    to: string;
    reason: string;
  } | null;
}

// ── Phase labels ──────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  accumulation: "吸筹期",
  markup: "拉升期",
  distribution: "派发期",
  markdown: "下跌期",
  escape: "出逃期",
};

const PHASE_COLORS: Record<string, string> = {
  accumulation: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  markup: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  distribution: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  markdown: "text-red-400 border-red-500/30 bg-red-500/10",
  escape: "text-rose-400 border-rose-500/30 bg-rose-500/10",
};

const RISK_COLORS: Record<string, string> = {
  aggressive: "text-red-400 bg-red-500/10 border-red-500/30",
  moderate: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  conservative: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};

const RISK_LABELS: Record<string, string> = {
  aggressive: "激进",
  moderate: "稳健",
  conservative: "保守",
};

export function PlaybookRenderer({ data }: { data: PlaybookData }) {
  const [showAllProbs, setShowAllProbs] = useState(false);
  const probability = data.probability ?? 0;
  const probPct = (probability * 100).toFixed(0);

  // Sort all_probabilities descending
  const sortedProbs = data.all_probabilities
    ? Object.entries(data.all_probabilities)
        .sort(([, a], [, b]) => b - a)
        .filter(([, v]) => v > 0.01)
    : [];

  return (
    <div className="space-y-5">
      {/* 1. Matched Playbook Hero */}
      {data.matched_playbook && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.06] to-transparent p-5"
        >
          {/* Background Book Icon */}
          <div className="absolute -right-4 -top-4 opacity-[0.06]">
            <BookOpen size={90} className="text-violet-400" />
          </div>

          <div className="relative z-10">
            <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-violet-400 mb-3">
              <BookOpen size={13} />
              剧本匹配成功 / PLAYBOOK MATCH
            </h4>

            <div className="flex items-center gap-4">
              {/* Probability Ring */}
              <div className="relative flex h-16 w-16 items-center justify-center shrink-0">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                  <circle
                    cx="32" cy="32" r="28" fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${probability * 175.93} 175.93`}
                    className="text-violet-500 transition-all duration-1000"
                  />
                </svg>
                <span className="text-lg font-black font-mono text-violet-300">{probPct}%</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xl font-black text-white tracking-tight leading-tight">
                  {localizeText(data.matched_playbook)}
                </p>
                {data.stage_description && (
                  <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                    <span className="text-zinc-600 mr-1">STAGE:</span>
                    {localizeText(data.stage_description)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Corner Decals */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-violet-500/30" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-violet-500/30" />
        </motion.div>
      )}

      {/* 2. Phase Transition */}
      {(data.current_phase || data.phase_transition) && (
        <div className="flex items-center gap-3 flex-wrap">
          {data.phase_transition ? (
            <>
              <span className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase",
                PHASE_COLORS[data.phase_transition.from] || "text-zinc-400 border-zinc-500/30 bg-zinc-500/10"
              )}>
                {PHASE_LABELS[data.phase_transition.from] || data.phase_transition.from}
              </span>
              <ArrowRight size={14} className="text-zinc-600 shrink-0" />
              <span className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase animate-pulse",
                PHASE_COLORS[data.phase_transition.to] || "text-zinc-400 border-zinc-500/30 bg-zinc-500/10"
              )}>
                {PHASE_LABELS[data.phase_transition.to] || data.phase_transition.to}
              </span>
              {data.phase_transition.reason && (
                <span className="text-[10px] text-zinc-500 italic">
                  — {localizeText(data.phase_transition.reason)}
                </span>
              )}
            </>
          ) : data.current_phase ? (
            <span className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase",
              PHASE_COLORS[data.current_phase] || "text-zinc-400 border-zinc-500/30 bg-zinc-500/10"
            )}>
              {PHASE_LABELS[data.current_phase] || data.current_phase}
            </span>
          ) : null}
        </div>
      )}

      {/* 3. Next Move Prediction */}
      {data.next_move && (
        <div className="flex items-start gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
          <Zap size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest block mb-1">
              下一步推演 / NEXT MOVE
            </span>
            <p className="text-sm text-zinc-200 leading-relaxed">
              {localizeText(data.next_move)}
            </p>
          </div>
        </div>
      )}

      {/* 4. All Probabilities Distribution */}
      {sortedProbs.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowAllProbs((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors"
          >
            <BarChart3 size={11} />
            剧本概率分布 / PROBABILITY DISTRIBUTION
            <motion.div animate={{ rotate: showAllProbs ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight size={10} />
            </motion.div>
          </button>
          <AnimatePresence>
            {showAllProbs && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 pt-1">
                  {sortedProbs.map(([name, prob]) => {
                    const pct = (prob * 100).toFixed(1);
                    const isMatch = name === data.matched_playbook;
                    return (
                      <div key={name} className="flex items-center gap-2 text-xs">
                        <span className={cn(
                          "w-[120px] truncate shrink-0",
                          isMatch ? "text-violet-400 font-bold" : "text-zinc-500"
                        )}>
                          {localizeText(name)}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(prob * 100, 100)}%` }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className={cn(
                              "h-full rounded-full",
                              isMatch ? "bg-violet-500" : "bg-zinc-600"
                            )}
                          />
                        </div>
                        <span className={cn(
                          "text-[10px] font-mono w-[40px] text-right shrink-0",
                          isMatch ? "text-violet-400" : "text-zinc-600"
                        )}>
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 5. Counter Strategy Panel */}
      {data.counter_strategy && data.counter_strategy.action && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4 space-y-3">
          <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
            <Shield size={14} />
            反制策略 / COUNTER STRATEGY
            {data.counter_strategy.risk_level && (
              <span className={cn(
                "ml-auto rounded border px-1.5 py-0.5 text-[8px] font-black uppercase",
                RISK_COLORS[data.counter_strategy.risk_level] || "text-zinc-400 border-zinc-500/30"
              )}>
                {RISK_LABELS[data.counter_strategy.risk_level] || data.counter_strategy.risk_level}
              </span>
            )}
          </h4>

          <p className="text-sm text-zinc-200 leading-relaxed font-medium">
            {localizeText(data.counter_strategy.action)}
          </p>

          {/* Price Levels Grid */}
          <div className="grid grid-cols-2 gap-2">
            {data.counter_strategy.entry_price && (
              <div className="rounded-md bg-white/[0.03] border border-white/[0.04] px-3 py-2">
                <span className="text-[9px] text-zinc-600 uppercase block mb-0.5">Entry / 入场</span>
                <span className="text-sm font-bold font-mono text-zinc-200">
                  {data.counter_strategy.entry_price}
                </span>
              </div>
            )}
            {data.counter_strategy.stop_loss && (
              <div className="rounded-md bg-red-500/[0.03] border border-red-500/10 px-3 py-2">
                <span className="text-[9px] text-red-500/60 uppercase block mb-0.5">Stop Loss / 止损</span>
                <span className="text-sm font-bold font-mono text-red-400">
                  {data.counter_strategy.stop_loss}
                </span>
              </div>
            )}
            {data.counter_strategy.take_profit_1 && (
              <div className="rounded-md bg-emerald-500/[0.03] border border-emerald-500/10 px-3 py-2">
                <span className="text-[9px] text-emerald-500/60 uppercase block mb-0.5">TP1 / 止盈①</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {data.counter_strategy.take_profit_1}
                </span>
              </div>
            )}
            {data.counter_strategy.take_profit_2 && (
              <div className="rounded-md bg-emerald-500/[0.03] border border-emerald-500/10 px-3 py-2">
                <span className="text-[9px] text-emerald-500/60 uppercase block mb-0.5">TP2 / 止盈②</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {data.counter_strategy.take_profit_2}
                </span>
              </div>
            )}
          </div>

          {/* Wait Signal */}
          {data.counter_strategy.wait_signal && (
            <div className="flex items-start gap-2 text-xs">
              <Crosshair size={12} className="text-zinc-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-zinc-600 text-[9px] uppercase">确认信号: </span>
                <span className="text-zinc-400">{localizeText(data.counter_strategy.wait_signal)}</span>
              </div>
            </div>
          )}

          {/* Risk Warning */}
          {data.counter_strategy.risk_warning && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/[0.04] border border-amber-500/10 px-3 py-2">
              <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-400/80 leading-relaxed">
                {localizeText(data.counter_strategy.risk_warning)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
