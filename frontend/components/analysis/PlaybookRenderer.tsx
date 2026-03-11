"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronRight,
  Zap,
  Target,
  AlertCircle,
  TrendingUp,
  Activity,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { localizeText } from "./helpers";
import { cn } from "@/lib/utils";

interface CounterStrategy {
  action?: string;
  strategy_type?: string;
  entry_price?: string; // Old field
  stop_loss?: string; // Old field
  take_profit_1?: string; // Old field
  take_profit_2?: string; // Old field
  wait_signal?: string; // Old field
  risk_warning?: string; // Old field
  risk_level?: string; // Old field

  // New fields from the edit
  entry_trigger?: string;
  invalid_at?: string;
  tp1?: string;
  tp2?: string;
  confirmation_signal?: string;
  risk_profile?: string;
}

interface PlaybookData {
  matched_playbook?: string; // Old field
  probability?: number;
  all_probabilities?: Record<string, number>;
  stage_description?: string; // Old field
  next_move?: string; // Old field
  counter_strategy?: CounterStrategy;
  current_phase?: string;
  phase_transition?: {
    from: string;
    to: string;
    reason: string;
  } | null;

  // New fields from the edit
  name?: string;
  stage?: string;
  predicted_next_move?: string;
}

// ── Phase colors ──────────────────────────────────────────────

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

export function PlaybookRenderer({ data }: { data: PlaybookData }) {
  const t = useTranslations("consensus");

  const PHASE_LABELS: Record<string, string> = {
    accumulation: t("renderers.playbook.phases.accumulation"),
    markup: t("renderers.playbook.phases.markup"),
    distribution: t("renderers.playbook.phases.distribution"),
    markdown: t("renderers.playbook.phases.markdown"),
    escape: t("renderers.playbook.phases.escape"),
  };

  const RISK_LABELS: Record<string, string> = {
    aggressive: t("renderers.playbook.risks.aggressive"),
    moderate: t("renderers.playbook.risks.moderate"),
    conservative: t("renderers.playbook.risks.conservative"),
  };

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
      {(data.matched_playbook || data.name) && (
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
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-violet-400" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400/80">
                {t("renderers.playbook.title")} / {t("renderers.playbook.titleSubtitle")}
              </h4>
            </div>

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
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black tracking-tight text-white uppercase italic">
                    {localizeText(data.name || data.matched_playbook)}
                  </span>
                  {(data.stage || data.current_phase) && (
                    <span className="text-[10px] font-bold text-violet-400 uppercase bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">
                      {PHASE_LABELS[data.stage || data.current_phase!] || (data.stage || data.current_phase!).toUpperCase()} {t("renderers.playbook.stage")}
                    </span>
                  )}
                </div>
                {data.stage_description && (
                  <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                    <span className="text-zinc-600 mr-1">{t("renderers.playbook.stage")}:</span>
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
      {data.phase_transition && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase",
            PHASE_COLORS[data.phase_transition.from] || "text-zinc-400 border-zinc-500/30 bg-zinc-500/10"
          )}>
            {PHASE_LABELS[data.phase_transition.from] || data.phase_transition.from}
          </span>
          <Target size={14} className="text-zinc-600 shrink-0" />
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
        </div>
      )}

      {/* 3. Next Move Highlight */}
      {(data.predicted_next_move || data.next_move) && (
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 flex items-center gap-4">
          <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <TrendingUp size={20} />
          </div>
          <div className="flex-1">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">
              {t("renderers.playbook.nextMove")} / {t("renderers.playbook.nextMoveSubtitle")}
            </span>
            <span className="text-sm font-bold text-emerald-400 uppercase tracking-tight">
              {localizeText(data.predicted_next_move || data.next_move)}
            </span>
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
            <Activity size={11} />
            {t("renderers.playbook.probabilityDistribution")}
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
                    const isMatch = name === (data.name || data.matched_playbook);
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
      {data.counter_strategy && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-4">
          <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
            <Zap size={14} />
            {t("renderers.playbook.counterStrategy")} / {t("renderers.playbook.counterStrategySubtitle")}
            {(data.counter_strategy.risk_profile || data.counter_strategy.risk_level) && (
              <span className={cn(
                "ml-auto rounded border px-1.5 py-0.5 text-[8px] font-black uppercase",
                RISK_COLORS[data.counter_strategy.risk_profile || data.counter_strategy.risk_level!] || "text-zinc-400 border-zinc-500/30"
              )}>
                {RISK_LABELS[data.counter_strategy.risk_profile || data.counter_strategy.risk_level!] || (data.counter_strategy.risk_profile || data.counter_strategy.risk_level!)}
              </span>
            )}
          </h4>

          {(data.counter_strategy.entry_trigger || data.counter_strategy.action) && (
            <p className="text-sm text-zinc-200 leading-relaxed font-medium">
              {localizeText(data.counter_strategy.entry_trigger || data.counter_strategy.action)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {(data.counter_strategy.entry_trigger || data.counter_strategy.entry_price) && (
              <div className="rounded-md bg-white/[0.03] border border-white/[0.04] px-3 py-2">
                <span className="text-[9px] text-zinc-600 uppercase block mb-0.5">{t("renderers.playbook.entry")}</span>
                <span className="text-sm font-bold font-mono text-zinc-200">
                  {data.counter_strategy.entry_trigger || data.counter_strategy.entry_price}
                </span>
              </div>
            )}
            {(data.counter_strategy.invalid_at || data.counter_strategy.stop_loss) && (
              <div className="rounded-md bg-red-500/[0.03] border border-red-500/10 px-3 py-2">
                <span className="text-[9px] text-red-500/60 uppercase block mb-0.5">{t("renderers.playbook.stopLoss")}</span>
                <span className="text-sm font-bold font-mono text-red-400">
                  {data.counter_strategy.invalid_at || data.counter_strategy.stop_loss}
                </span>
              </div>
            )}
            {(data.counter_strategy.tp1 || data.counter_strategy.take_profit_1) && (
              <div className="rounded-md bg-emerald-500/[0.03] border border-emerald-500/10 px-3 py-2">
                <span className="text-[9px] text-emerald-500/60 uppercase block mb-0.5">{t("renderers.playbook.tp1")}</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {data.counter_strategy.tp1 || data.counter_strategy.take_profit_1}
                </span>
              </div>
            )}
            {(data.counter_strategy.tp2 || data.counter_strategy.take_profit_2) && (
              <div className="rounded-md bg-emerald-500/[0.03] border border-emerald-500/10 px-3 py-2">
                <span className="text-[9px] text-emerald-500/60 uppercase block mb-0.5">{t("renderers.playbook.tp2")}</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {data.counter_strategy.tp2 || data.counter_strategy.take_profit_2}
                </span>
              </div>
            )}
          </div>

          {(data.counter_strategy.confirmation_signal || data.counter_strategy.wait_signal) && (
            <div className="flex items-start gap-2 text-xs">
              <Activity size={12} className="text-zinc-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-zinc-600 text-[9px] uppercase">{t("renderers.playbook.waitSignal")}: </span>
                <span className="text-zinc-400">{localizeText(data.counter_strategy.confirmation_signal || data.counter_strategy.wait_signal)}</span>
              </div>
            </div>
          )}

          {(data.counter_strategy.risk_warning) && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/[0.04] border border-amber-500/10 px-3 py-2">
              <AlertCircle size={12} className="text-amber-500 mt-0.5 shrink-0" />
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
