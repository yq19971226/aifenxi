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
import { localizeText } from "./helpers";

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
    case "completed": return "text-emerald-400";
    case "running": return "text-blue-400";
    case "failed":
    case "timeout": return "text-red-400";
    default: return "text-zinc-500";
  }
}

function messageTextClass(status: ProgressStatus | "pending"): string {
  switch (status) {
    case "completed": return "text-zinc-400";
    case "running": return "text-zinc-300";
    case "failed":
    case "timeout": return "text-red-400/70";
    default: return "text-zinc-500";
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

// ── Phase text mapping ──────────────────────────────────────

function getPhaseText(steps: ProgressEvent[]): { title: string; subtitle: string } {
  const len = steps.length;
  const completedCount = steps.filter(s => s.status === "completed").length;
  const hasRunning = steps.some(s => s.status === "running");

  if (len === 0) return { title: "准备启动", subtitle: "正在连接分析引擎..." };

  // Early initialization phase
  if (len <= 3 && completedCount <= 2) {
    return { title: "准备启动", subtitle: "进入分析工作区..." };
  }

  // Data collection phase
  if (completedCount <= 5) {
    return { title: "数据采集中", subtitle: "正在收集多维市场数据..." };
  }

  // Agents running phase
  if (hasRunning) {
    const runningStep = steps.find(s => s.status === "running");
    const agentName = runningStep?.step || "智能体";
    return { title: "专家分析中", subtitle: `${agentName}` };
  }

  // Final synthesis
  if (completedCount > 8) {
    return { title: "生成共识", subtitle: "综合各专家结论..." };
  }

  return { title: "分析中", subtitle: "请稍候..." };
}

// ── Circular Spinner SVG ────────────────────────────────────

function OrbitalSpinner({ progress }: { progress: number }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative h-24 w-24">
      {/* Background ring */}
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 96 96">
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="3"
        />
        {/* Progress arc */}
        <motion.circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>

      {/* Orbiting dot */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
      >
        <div
          className="absolute left-1/2 -ml-[5px] w-[10px] h-[10px] rounded-full bg-zinc-200 shadow-[0_0_12px_rgba(255,255,255,0.4)]"
          style={{ top: `${48 - radius - 1}px` }}
        />
      </motion.div>

      {/* Center percent */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-black font-mono text-zinc-300 tabular-nums">
          {Math.round(progress)}
          <span className="text-[10px] text-zinc-500">%</span>
        </span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export function AnalysisProgress({ steps, startTime }: AnalysisProgressProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsedTime(startTime);

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalCount = Math.max(steps.length, 1);
  const progressPct = Math.min((completedCount / totalCount) * 100, 100);
  const phase = getPhaseText(steps);

  const lastStepStatus = steps[steps.length - 1]?.status;

  // Auto-scroll to latest step
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length, lastStepStatus]);

  // ── Pre-connection state (no steps yet) ──
  if (steps.length === 0) {
    if (!startTime) return null;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative flex flex-col items-center justify-center py-16 overflow-hidden rounded-xl"
      >
        {/* Radial glow background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] rounded-full bg-indigo-500/[0.06] blur-[80px]" />
        </div>

        <OrbitalSpinner progress={0} />

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-4 text-lg font-bold text-zinc-300"
        >
          准备启动
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-1 text-sm text-zinc-500"
        >
          正在连接分析引擎...
        </motion.p>
        <span className="mt-3 font-mono text-xs text-zinc-600">{elapsed}s</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-white/[0.06] overflow-hidden"
    >
      {/* ── Hero Section: Orbital Spinner + Phase Text ── */}
      <div className="relative flex flex-col items-center py-8 overflow-hidden bg-white/[0.01]">
        {/* Radial ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-indigo-500/[0.04] blur-[80px]" />
          <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full bg-emerald-500/[0.03] blur-[60px]" />
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <OrbitalSpinner progress={progressPct} />

          <motion.p
            key={phase.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-lg font-bold text-zinc-200 tracking-tight"
          >
            {phase.title}
          </motion.p>
          <motion.p
            key={phase.subtitle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-1 text-sm text-zinc-500"
          >
            {phase.subtitle}
          </motion.p>
        </div>
      </div>

      {/* ── Gradient progress bar ── */}
      <div className="h-[3px] bg-white/[0.03]">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-violet-500"
          initial={{ width: "0%" }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* ── Expert Team Status Bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-white/[0.01] overflow-x-auto">
        <Bot size={12} className="text-zinc-600 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 shrink-0 mr-1">TEAM</span>
        {Object.entries(AGENT_ICONS).slice(0, 8).map(([name, { icon: Icon, color }]) => {
          const isActive = steps.some(s => s.step.includes(name) && s.status === 'running');
          const isDone = steps.some(s => s.step.includes(name) && s.status === 'completed');
          return (
            <div
              key={name}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all duration-300 shrink-0 ${
                isActive ? "bg-blue-500/10" : isDone ? "bg-emerald-500/5" : "opacity-20"
              }`}
            >
              <Icon size={10} className={isActive ? color : isDone ? "text-emerald-400" : "text-zinc-700"} />
              <span className={`text-[9px] font-medium ${isActive ? 'text-zinc-200' : isDone ? 'text-zinc-500' : 'text-zinc-700'}`}>
                {name}
              </span>
              {isActive && <span className="h-1 w-1 rounded-full bg-blue-400 animate-pulse" />}
            </div>
          );
        })}
        <span className="ml-auto font-mono text-[10px] font-bold text-zinc-600 shrink-0 tabular-nums">
          {elapsed}s
        </span>
      </div>

      {/* ── Steps Timeline ── */}
      <div className="max-h-[220px] overflow-y-auto scrollbar-thin px-4 py-2">
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
                    <p className={`break-words text-sm leading-4 mt-0.5 ${messageTextClass(step.status)}`}>
                      {localizeText(step.message)}
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
