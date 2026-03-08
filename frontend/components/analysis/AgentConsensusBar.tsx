"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, ChevronDown } from "lucide-react";

import type { ReportSection } from "@/lib/api/analysis";
import { getSectionIcon } from "./helpers";

interface AgentConsensusBarProps {
  sections: ReportSection[];
}

function signalArrow(signal: string): { char: string; color: string } {
  if (signal === "bullish") return { char: "▲", color: "text-emerald-400" };
  if (signal === "bearish") return { char: "▼", color: "text-red-400" };
  return { char: "●", color: "text-zinc-500" };
}

export function AgentConsensusBar({ sections }: AgentConsensusBarProps) {
  const [expanded, setExpanded] = useState(false);

  const agentSections = sections.filter(
    (s) => s.status === "completed" && s.data?.signal && s.title !== "策略建议",
  );

  if (agentSections.length === 0) return null;

  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  let confSum = 0;
  let confCount = 0;

  for (const s of agentSections) {
    const sig = String(s.data.signal);
    if (sig === "bullish") counts.bullish++;
    else if (sig === "bearish") counts.bearish++;
    else counts.neutral++;
    const c = s.data.confidence;
    if (typeof c === "number" && c > 0) {
      confSum += c;
      confCount++;
    }
  }

  const avgConf = confCount > 0 ? confSum / confCount : 0;

  const handleClick = (title: string) => {
    document.getElementById(`section-${title}`)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2 text-sm">
          <Bot className="h-3.5 w-3.5 text-indigo-400" />
          <span className="font-medium text-zinc-300">
            {agentSections.length} AI 共识
          </span>
          <span className="text-zinc-500">·</span>
          <span className="font-mono text-zinc-400">
            {(avgConf * 100).toFixed(0)}% 置信度
          </span>
          <span className="text-zinc-500">·</span>
          <span className="text-xs text-zinc-500">
            {counts.bullish > 0 && <span className="text-emerald-400">{counts.bullish}涨</span>}
            {counts.bullish > 0 && (counts.bearish > 0 || counts.neutral > 0) && " "}
            {counts.bearish > 0 && <span className="text-red-400">{counts.bearish}跌</span>}
            {counts.bearish > 0 && counts.neutral > 0 && " "}
            {counts.neutral > 0 && <span className="text-zinc-500">{counts.neutral}中性</span>}
          </span>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </motion.div>
      </button>

      {/* Expanded — agent tags */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {agentSections.map((s) => {
                  const sig = String(s.data.signal);
                  const arrow = signalArrow(sig);
                  const iconInfo = getSectionIcon(s.title);
                  const IconComp = iconInfo.icon;
                  return (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => handleClick(s.title)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-sm transition-colors hover:bg-white/[0.08] cursor-pointer"
                      title={`跳转到 ${s.title}`}
                    >
                      <IconComp className={`h-3 w-3 ${iconInfo.color}`} />
                      <span className="text-zinc-300">{s.title}</span>
                      <span className={`font-bold ${arrow.color}`}>{arrow.char}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
