"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Check,
  Circle,
  Clock,
  Link,
  Loader2,
  Newspaper,
  Shield,
  Swords,
  X,
  Zap,
} from "lucide-react";

import type { ProgressEvent, ProgressStatus } from "@/lib/api/analysis";

// ── Types ────────────────────────────────────────────────────

interface AnalysisProgressProps {
  /** Progress steps received from the SSE stream */
  steps: ProgressEvent[];
  /** Timestamp (ms) when analysis started */
  startTime?: number;
}

// ── Agent icon mapping ──────────────────────────────────────

const AGENT_ICONS: Record<string, { icon: typeof Zap; color: string }> = {
  "技术面": { icon: BarChart3, color: "text-indigo-400" },
  "链上": { icon: Link, color: "text-purple-400" },
  "订单簿": { icon: Activity, color: "text-cyan-400" },
  "情绪": { icon: Brain, color: "text-amber-400" },
  "新闻": { icon: Newspaper, color: "text-sky-400" },
  "日历": { icon: Clock, color: "text-teal-400" },
  "风险": { icon: Shield, color: "text-orange-400" },
  "剧本": { icon: BookOpen, color: "text-violet-400" },
  "AI操盘": { icon: Bot, color: "text-rose-400" },
  "对抗": { icon: Swords, color: "text-orange-400" },
  "合谋": { icon: Brain, color: "text-pink-400" },
  "共识": { icon: Zap, color: "text-emerald-400" },
  "策略": { icon: Zap, color: "text-emerald-400" },
  "反思": { icon: Brain, color: "text-violet-400" },
};

function getAgentIcon(stepName: string): { icon: typeof Zap; color: string } | null {
  for (const [key, val] of Object.entries(AGENT_ICONS)) {
    if (stepName.includes(key)) return val;
  }
  return null;
}

// ── Status icon mapping ─────────────────────────────────────

function StatusIcon({ status }: { status: ProgressStatus | "pending" }) {
  switch (status) {
    case "completed":
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20"
        >
          <Check className="h-3 w-3 text-emerald-400" />
        </motion.div>
      );
    case "running":
      return (
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-5 w-5 items-center justify-center"
        >
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        </motion.div>
      );
    case "failed":
    case "timeout":
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20"
        >
          <X className="h-3 w-3 text-red-400" />
        </motion.div>
      );
    case "pending":
    default:
      return (
        <div className="flex h-5 w-5 items-center justify-center">
          <Circle className="h-2.5 w-2.5 text-zinc-500" />
        </div>
      );
  }
}

// ── Status text color ───────────────────────────────────────

function statusTextClass(status: ProgressStatus | "pending"): string {
  switch (status) {
    case "completed":
      return "text-emerald-400";
    case "running":
      return "text-blue-400";
    case "failed":
    case "timeout":
      return "text-red-400";
    case "pending":
    default:
      return "text-zinc-500";
  }
}

function messageTextClass(status: ProgressStatus | "pending"): string {
  switch (status) {
    case "completed":
      return "text-zinc-400";
    case "running":
      return "text-zinc-300";
    case "failed":
    case "timeout":
      return "text-red-400/70";
    case "pending":
    default:
      return "text-zinc-500";
  }
}

// ── Elapsed timer hook ──────────────────────────────────────

function useElapsedTime(startTime: number | undefined) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return elapsed;
}

// ── Component ────────────────────────────────────────────────

export function AnalysisProgress({ steps, startTime }: AnalysisProgressProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsedTime(startTime);

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalCount = Math.max(steps.length, 1);
  const progressPct = Math.min((completedCount / totalCount) * 100, 100);

  // Auto-scroll to latest step
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length, steps[steps.length - 1]?.status]);

  if (steps.length === 0) {
    if (!startTime) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
      >
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">正在连接分析引擎...</span>
        <span className="ml-auto font-mono text-sm text-zinc-500">{elapsed}s</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
    >
      {/* Timer + Progress bar header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-sm text-zinc-400">
            分析进行中 · {completedCount}/{totalCount} 步骤
          </span>
        </div>
        <span className="font-mono text-xs font-bold text-blue-400">{elapsed}s</span>
      </div>

      {/* Animated progress bar */}
      <div className="h-[2px] bg-white/[0.04]">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
          initial={{ width: "0%" }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Steps list with timeline */}
      <div className="max-h-[280px] overflow-y-auto scrollbar-thin px-4 py-2">
        <AnimatePresence mode="popLayout">
          {steps.map((step, idx) => {
            const agentIcon = getAgentIcon(step.step);
            const AgentIconComp = agentIcon?.icon;
            const isLast = idx === steps.length - 1;
            return (
              <motion.div
                key={`${step.step}-${idx}`}
                layout
                initial={{ opacity: 0, x: -16, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex gap-3 relative"
              >
                {/* Timeline column */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="mt-1">
                    <StatusIcon status={step.status} />
                  </div>
                  {!isLast && (
                    <div className={`w-px flex-1 min-h-[12px] ${
                      step.status === "completed" ? "bg-emerald-500/20" : "bg-white/[0.06]"
                    }`} />
                  )}
                </div>
                {/* Content */}
                <div className="min-w-0 flex-1 pb-2">
                  <div className="flex items-center gap-1.5">
                    {AgentIconComp && (
                      <AgentIconComp className={`h-3 w-3 shrink-0 ${
                        step.status === "completed" ? agentIcon!.color
                          : step.status === "running" ? agentIcon!.color
                          : "text-zinc-600"
                      }`} />
                    )}
                    <p className={`text-sm font-medium leading-5 ${statusTextClass(step.status)}`}>
                      {step.step}
                    </p>
                    {step.status === "running" && (
                      <motion.div
                        className="h-1 w-10 rounded-full bg-white/[0.04] overflow-hidden shrink-0 ml-auto"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <motion.div
                          className="h-full bg-blue-500/60 rounded-full"
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </motion.div>
                    )}
                  </div>
                  {step.message && (
                    <p className={`truncate text-sm leading-4 mt-0.5 ${messageTextClass(step.status)}`}>
                      {step.message}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </motion.div>
  );
}
