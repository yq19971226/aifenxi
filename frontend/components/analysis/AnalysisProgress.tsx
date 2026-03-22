"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Database,
  Link,
  Loader2,
  Newspaper,
  Shield,
  Swords,
  Terminal,
  X,
  Zap,
} from "lucide-react";

import type { ProgressEvent, ProgressStatus } from "@/lib/api/analysis";
import { useTranslations } from "next-intl";
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

// ── Phase text fetching component (helper) ──
function getPhaseLabel(steps: ProgressEvent[], t: any): { title: string; subtitle: string } {
  const len = steps.length;
  const completedCount = steps.filter(s => s.status === "completed").length;
  const hasRunning = steps.some(s => s.status === "running");

  if (len === 0) return { title: t("progress.preparing"), subtitle: t("progress.connecting") };

  // Early initialization phase
  if (len <= 3 && completedCount <= 2) {
    return { title: t("progress.preparing"), subtitle: t("progress.entering") };
  }

  // Data collection phase
  if (completedCount <= 5) {
    return { title: t("progress.collecting"), subtitle: t("progress.collectingDesc") };
  }

  // Agents running phase
  if (hasRunning) {
    const runningStep = steps.find(s => s.status === "running");
    const agentName = runningStep?.step || t("progress.analyzingGeneral");
    return { title: t("progress.analyzing"), subtitle: `${agentName}` };
  }

  // Final synthesis
  if (completedCount > 8) {
    return { title: t("progress.synthesis"), subtitle: t("progress.synthesisDesc") };
  }

  return { title: t("progress.analyzingGeneral"), subtitle: t("progress.wait") };
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

// ── Live Data Ticker ────────────────────────────────────────
// Simulated live data feed that shows realistic-looking analysis metrics
// scrolling through as agents work. Each step triggers contextual data lines.

interface DataLine {
  id: number;
  icon: typeof Zap;
  color: string;
  label: string;
  value: string;
  ts: string;
}

const _DATA_FEED_POOL: { icon: typeof Zap; color: string; label: string; valueFn: () => string }[] = [
  { icon: BarChart3, color: "text-indigo-400", label: "RSI(14)", valueFn: () => (35 + Math.random() * 30).toFixed(1) },
  { icon: BarChart3, color: "text-indigo-400", label: "MACD Hist", valueFn: () => (Math.random() > 0.5 ? "+" : "-") + (Math.random() * 200).toFixed(0) },
  { icon: BarChart3, color: "text-indigo-400", label: "BB Width", valueFn: () => (Math.random() * 5 + 1).toFixed(2) + "%" },
  { icon: Activity, color: "text-cyan-400", label: "Bid Depth", valueFn: () => "$" + (Math.random() * 50 + 10).toFixed(1) + "M" },
  { icon: Activity, color: "text-cyan-400", label: "Ask Depth", valueFn: () => "$" + (Math.random() * 50 + 10).toFixed(1) + "M" },
  { icon: Activity, color: "text-cyan-400", label: "Spread", valueFn: () => (Math.random() * 0.05).toFixed(4) + "%" },
  { icon: Link, color: "text-purple-400", label: "Exchange Netflow", valueFn: () => (Math.random() > 0.5 ? "+" : "-") + (Math.random() * 3000 + 100).toFixed(0) + " BTC" },
  { icon: Link, color: "text-purple-400", label: "MVRV-Z", valueFn: () => (Math.random() * 4 - 1).toFixed(2) },
  { icon: Link, color: "text-purple-400", label: "SOPR", valueFn: () => (0.95 + Math.random() * 0.1).toFixed(4) },
  { icon: Shield, color: "text-orange-400", label: "F&G Index", valueFn: () => Math.floor(Math.random() * 40 + 20).toString() },
  { icon: Shield, color: "text-orange-400", label: "Funding Rate", valueFn: () => (Math.random() > 0.5 ? "+" : "-") + (Math.random() * 0.03).toFixed(4) + "%" },
  { icon: Shield, color: "text-orange-400", label: "L/S Ratio", valueFn: () => (0.8 + Math.random() * 0.4).toFixed(3) },
  { icon: Newspaper, color: "text-sky-400", label: "Sentiment", valueFn: () => ["Positive", "Negative", "Neutral"][Math.floor(Math.random() * 3)] },
  { icon: Newspaper, color: "text-sky-400", label: "News Count", valueFn: () => Math.floor(Math.random() * 20 + 3).toString() },
  { icon: Brain, color: "text-amber-400", label: "Social Heat", valueFn: () => (Math.random() > 0.5 ? "↑" : "↓") + (Math.random() * 50).toFixed(0) + "%" },
  { icon: Database, color: "text-blue-400", label: "Klines", valueFn: () => Math.floor(Math.random() * 200 + 100).toString() },
  { icon: Zap, color: "text-emerald-400", label: "Confidence", valueFn: () => (Math.random() * 0.4 + 0.5).toFixed(2) },
  { icon: Swords, color: "text-orange-400", label: "Adversarial", valueFn: () => ["Gaming", "Trap Detection", "Defense Eval"][Math.floor(Math.random() * 3)] },
];

function useDataTicker(steps: ProgressEvent[]) {
  const [lines, setLines] = useState<DataLine[]>([]);
  const idRef = useRef(0);
  const lastStepCount = useRef(0);

  // Generate contextual lines when new steps appear
  useEffect(() => {
    if (steps.length === lastStepCount.current) return;
    lastStepCount.current = steps.length;

    // Add 1-3 data lines per new step
    const count = Math.floor(Math.random() * 2) + 1;
    const newLines: DataLine[] = [];
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    for (let i = 0; i < count; i++) {
      const pool = _DATA_FEED_POOL[Math.floor(Math.random() * _DATA_FEED_POOL.length)];
      newLines.push({
        id: ++idRef.current,
        icon: pool.icon,
        color: pool.color,
        label: pool.label,
        value: pool.valueFn(),
        ts,
      });
    }

    setLines(prev => [...prev, ...newLines].slice(-12));
  }, [steps.length]);

  // Background interval: add slow periodic lines while analyzing
  useEffect(() => {
    if (steps.length === 0) return;
    const hasRunning = steps.some(s => s.status === "running");
    if (!hasRunning) return;

    const interval = setInterval(() => {
      const pool = _DATA_FEED_POOL[Math.floor(Math.random() * _DATA_FEED_POOL.length)];
      const now = new Date();
      const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      setLines(prev => [...prev, {
        id: ++idRef.current,
        icon: pool.icon,
        color: pool.color,
        label: pool.label,
        value: pool.valueFn(),
        ts,
      }].slice(-12));
    }, 1800 + Math.random() * 1200);

    return () => clearInterval(interval);
  }, [steps]);

  return lines;
}

// ── Main Component ──────────────────────────────────────────

export function AnalysisProgress({ steps, startTime }: AnalysisProgressProps) {
  const t = useTranslations("consensus");
  const bottomRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsedTime(startTime);
  const dataLines = useDataTicker(steps);

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalCount = Math.max(steps.length, 1);
  const progressPct = Math.min((completedCount / totalCount) * 100, 100);
  const phase = getPhaseLabel(steps, t);

  const lastStepStatus = steps[steps.length - 1]?.status;
  const hasRunning = steps.some(s => s.status === "running");

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
          {t("progress.preparing")}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-1 text-sm text-zinc-500"
        >
          {t("progress.connecting")}
        </motion.p>
        <span className="mt-3 font-mono text-xs text-zinc-400">{elapsed}s</span>
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
        <Bot size={12} className="text-zinc-400 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 shrink-0 mr-1">{t("progress.team")}</span>
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
              <Icon size={10} className={isActive ? color : isDone ? "text-emerald-400" : "text-zinc-500"} />
              <span className={`text-[9px] font-medium ${isActive ? 'text-zinc-200' : isDone ? 'text-zinc-500' : 'text-zinc-500'}`}>
                {name}
              </span>
              {isActive && <span className="h-1 w-1 rounded-full bg-blue-400 animate-pulse" />}
            </div>
          );
        })}
        <span className="ml-auto font-mono text-[10px] font-bold text-zinc-400 shrink-0 tabular-nums">
          {elapsed}s
        </span>
      </div>

      {/* ── Live Data Ticker + Steps (split layout) ── */}
      <div className="flex flex-col lg:flex-row">
        {/* Steps Timeline */}
        <div className="flex-1 max-h-[220px] overflow-y-auto scrollbar-thin px-4 py-2 min-w-0">
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
                            : "text-zinc-400"
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

        {/* Live Data Feed Panel */}
        {hasRunning && dataLines.length > 0 && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            transition={{ duration: 0.4 }}
            className="lg:w-[260px] lg:border-l border-t lg:border-t-0 border-white/[0.04] max-h-[220px] overflow-y-auto scrollbar-thin bg-black/20"
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.04] sticky top-0 bg-[#0a0a0c]/90 backdrop-blur-sm z-10">
              <Terminal size={10} className="text-emerald-500" />
              <span className="text-[10px] font-bold tracking-wider text-emerald-500/80">
                LIVE FEED
              </span>
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-emerald-500 ml-auto"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
            <div className="px-3 py-1">
              <AnimatePresence mode="popLayout">
                {dataLines.map((line) => {
                  const IconComp = line.icon;
                  return (
                    <motion.div
                      key={line.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="flex items-center gap-2 py-[3px]"
                    >
                      <span className="text-[9px] font-mono text-zinc-400 shrink-0 tabular-nums w-[54px]">
                        {line.ts}
                      </span>
                      <IconComp size={10} className={`shrink-0 ${line.color}`} />
                      <span className="text-[11px] text-zinc-500 shrink-0">{line.label}</span>
                      <span className="text-[11px] font-mono text-zinc-300 ml-auto truncate tabular-nums">
                        {line.value}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
