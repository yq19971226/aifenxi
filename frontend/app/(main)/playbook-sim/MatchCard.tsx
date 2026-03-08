"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { PlaybookMatch } from "@/lib/api/playbook-sim";
import { SIGNAL_MAP } from "./playbook-constants";

interface Props {
  match: PlaybookMatch;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}

export default function MatchCard({ match, rank, expanded, onToggle }: Props) {
  const signalInfo = SIGNAL_MAP[match.signal || "neutral"] || SIGNAL_MAP.neutral;
  const isHigh = match.match_pct >= 70;
  const isMed = match.match_pct >= 40 && match.match_pct < 70;

  return (
    <div className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
      <button onClick={onToggle} className="w-full flex items-center justify-between text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold ${
            isHigh ? "bg-red-500/15 text-red-400" : isMed ? "bg-amber-500/15 text-amber-400" : "bg-white/[0.06] text-zinc-300"
          }`}>
            {rank}
          </span>
          <div className="min-w-0">
            <span className="text-sm font-medium text-white">{match.name}</span>
            {match.strategy_type && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-white/[0.04] text-xs font-mono text-zinc-500">{match.strategy_type}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-mono font-semibold ${isHigh ? "text-red-400" : isMed ? "text-amber-400" : "text-zinc-400"}`}>
            {match.match_pct.toFixed(1)}%
          </span>
          <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 pt-3 border-t border-white/[0.04]">
              <div className="flex items-center gap-4 p-2.5 rounded-lg bg-white/[0.02]">
                <div className="flex items-center gap-1.5">
                  <signalInfo.icon size={14} className={signalInfo.color} />
                  <span className={`text-xs font-medium ${signalInfo.color}`}>{signalInfo.label}</span>
                </div>
                {match.matched_features != null && match.total_features != null && (
                  <span className="text-xs text-zinc-400">
                    特征匹配 <span className="text-white font-mono">{match.matched_features}/{match.total_features}</span>
                  </span>
                )}
              </div>

              {match.stages && match.stages.length > 0 && (
                <div>
                  <span className="text-xs uppercase tracking-widest text-zinc-500 mb-3 block">阶段路线图</span>
                  <div className="flex items-center">
                    {match.stages.map((stage, i) => {
                      const isCurrent = match.current_stage_idx === i;
                      const isPast = match.current_stage_idx != null && i < match.current_stage_idx;
                      return (
                        <div key={i} className="flex items-center flex-1 min-w-0">
                          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                              isCurrent
                                ? "bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)] ring-2 ring-indigo-500/30"
                                : isPast
                                  ? "bg-indigo-500/20 text-indigo-400"
                                  : "bg-white/[0.06] text-zinc-600"
                            }`}>
                              {i + 1}
                            </div>
                            <span className={`text-xs text-center truncate w-full px-0.5 ${
                              isCurrent ? "text-indigo-400 font-semibold" : isPast ? "text-indigo-400/60" : "text-zinc-600"
                            }`}>
                              {stage.name || stage.phase}
                            </span>
                          </div>
                          {i < match.stages!.length - 1 && (
                            <div className={`h-0.5 w-full mx-0.5 mt-[-14px] ${
                              isPast ? "bg-indigo-500/30" : "bg-white/[0.06]"
                            }`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {match.aftermath && (
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <span className="text-xs uppercase tracking-widest text-zinc-500">后续走势</span>
                  <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{match.aftermath}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
