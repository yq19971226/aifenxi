"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  RefreshCw,
  Target,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ChevronDown,
  Clock,
  Brain,
  Eye,
  BarChart3,
  Activity,
  Loader2,
  Swords,
  BookOpen,
  Gavel,
  Check,
} from "lucide-react";
import {
  fetchPlazaFeed,
  fetchPlazaStats,
  runPlaybookSimStream,
  type SimResult,
  type PlaybookMatch,
  type PlazaFeed,
  type PlazaStats,
  type DealerPrediction,
  type DefenseStrategy,
  type JudgeAdoption,
} from "@/lib/api/playbook-sim";
import {
  fetchPlaybookLatest,
  fetchPhaseHistory,
  type PlaybookLatest,
  type PhaseHistory,
} from "@/lib/api/playbook";
import { SymbolSelector } from "@/components/layout/SymbolSelector";
import PlaybookStoryline from "./PlaybookStoryline";
import { PositionCalculator } from "@/components/trade/PositionCalculator";
import { fromDefenseStrategy } from "@/lib/utils/position-sizing";

/* ── Signal helpers ── */

const SIGNAL_MAP: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  bullish: { icon: TrendingUp, color: "text-emerald-400", label: "\u770B\u6DA8" },
  bearish: { icon: TrendingDown, color: "text-red-400", label: "\u770B\u8DCC" },
  neutral: { icon: Minus, color: "text-zinc-400", label: "\u4E2D\u6027" },
};

/* ── Step status type ── */

type StepStatus = "idle" | "running" | "done" | "failed";

interface StepStatuses {
  data: StepStatus;
  L1: StepStatus;
  L2: StepStatus;
  L3: StepStatus;
  L4: StepStatus;
}

const INITIAL_STEP_STATUS: StepStatuses = {
  data: "idle", L1: "idle", L2: "idle", L3: "idle", L4: "idle",
};

/* ── AI Adversarial L4 Flow ── */

function AdversarialL4({
  sim,
  latest: _latest,
  stepStatus,
}: {
  sim: SimResult;
  latest: PlaybookLatest | null;
  stepStatus: StepStatuses;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const dealer = sim.dealer_prediction;
  const defense = sim.defense_strategy;
  const judge = sim.judge_adoption;

  const steps = [
    {
      icon: <Target size={16} />,
      label: "L1 \u5267\u672C\u5339\u914D",
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
      glow: "shadow-[0_0_12px_rgba(99,102,241,0.15)]",
      done: stepStatus.L1 === "done",
      running: stepStatus.L1 === "running",
      failed: stepStatus.L1 === "failed",
      detail: sim.top_matches?.length > 0 ? sim.top_matches[0]?.name : (stepStatus.L1 === "running" ? "\u5339\u914D\u4E2D..." : "\u65E0\u5339\u914D"),
    },
    {
      icon: <Swords size={16} />,
      label: "L2 \u5E84\u5BB6\u63A8\u6F14",
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
      glow: "shadow-[0_0_12px_rgba(251,146,60,0.15)]",
      done: stepStatus.L2 === "done",
      running: stepStatus.L2 === "running",
      failed: stepStatus.L2 === "failed",
      detail: dealer?.dealer_plan
        ? dealer.dealer_plan.slice(0, 20) + (dealer.dealer_plan.length > 20 ? "..." : "")
        : (stepStatus.L2 === "running" ? "\u63A8\u6F14\u4E2D..." : "\u5F85\u63A8\u6F14"),
    },
    {
      icon: <Shield size={16} />,
      label: "L3 \u9632\u5FA1\u53CD\u5236",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      glow: "shadow-[0_0_12px_rgba(96,165,250,0.15)]",
      done: stepStatus.L3 === "done",
      running: stepStatus.L3 === "running",
      failed: stepStatus.L3 === "failed",
      detail: defense?.defense_summary
        ? defense.defense_summary.slice(0, 20) + (defense.defense_summary.length > 20 ? "..." : "")
        : (stepStatus.L3 === "running" ? "\u53CD\u5236\u4E2D..." : "\u5F85\u53CD\u5236"),
    },
    {
      icon: <Gavel size={16} />,
      label: "L4 \u88C1\u5224\u91C7\u7EB3",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      glow: "shadow-[0_0_12px_rgba(245,158,11,0.15)]",
      done: stepStatus.L4 === "done",
      running: stepStatus.L4 === "running",
      failed: stepStatus.L4 === "failed",
      detail: judge
        ? ({ adopt: "\u2705 \u91C7\u7EB3\u9632\u5FA1", partial: "\u26A0\uFE0F \u90E8\u5206\u91C7\u7EB3", wait: "\u23F8 \u5EFA\u8BAE\u89C2\u671B" }[judge.adoption] || judge.adoption)
        : (stepStatus.L4 === "running" ? "\u88C1\u51B3\u4E2D..." : "\u5F85\u88C1\u51B3"),
    },
    {
      icon: <Check size={16} />,
      label: "L5 \u6700\u7EC8\u7B56\u7565",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      glow: "shadow-[0_0_12px_rgba(52,211,153,0.15)]",
      done: !!judge?.next_move,
      running: false,
      failed: false,
      detail: judge?.next_move
        ? judge.next_move.slice(0, 20) + (judge.next_move.length > 20 ? "..." : "")
        : "\u5F85\u751F\u6210",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  // Auto-collapse when all steps complete
  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      setCollapsed(true);
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  const summaryParts: string[] = [];
  if (dealer?.dealer_plan) summaryParts.push(`庄家可信度${judge?.dealer_credibility != null ? (judge.dealer_credibility * 100).toFixed(0) + "%" : "-"}`);
  if (defense?.confidence != null) summaryParts.push(`防御可行度${(defense.confidence * 100).toFixed(0)}%`);
  if (judge?.adoption) summaryParts.push(`裁判${judge.adoption === "adopt" ? "采纳防御" : judge.adoption === "partial" ? "部分采纳" : "建议观望"}`);

  return (
    <div className="card p-5 space-y-5">
      <button
        onClick={() => allDone && setCollapsed(!collapsed)}
        className={`w-full flex items-center justify-between ${allDone ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center gap-2">
          <Swords size={16} className="text-orange-400" />
          <span className="text-sm font-semibold text-white">{"AI \u63A8\u7406\u8FC7\u7A0B"}</span>
        </div>
        <div className="flex items-center gap-2">
          {allDone && collapsed && summaryParts.length > 0 && (
            <span className="text-xs text-zinc-400">{summaryParts.join(" \u00B7 ")}</span>
          )}
          <span className="text-xs font-mono text-zinc-500">
            {completedCount}/{steps.length} {"\u5B8C\u6210"}
          </span>
          {allDone && (
            <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
          )}
        </div>
      </button>

      {/* Collapsed: only show progress bar */}
      {collapsed && (
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-orange-500 via-blue-500 via-amber-500 to-emerald-500 w-full" />
        </div>
      )}

      {/* Expanded: full detail */}
      {!collapsed && (
        <>
      {/* Progress bar */}
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-orange-500 via-blue-500 via-amber-500 to-emerald-500 transition-all duration-700"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>
      {/* Steps */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {steps.map((step, i) => (
          <div key={i} className="relative">
            {i < steps.length - 1 && (
              <div className={`hidden md:block absolute top-5 -right-1 w-2 h-0.5 ${step.done ? "bg-zinc-500" : "bg-zinc-800"}`} />
            )}
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className={`w-full flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 border transition-all cursor-pointer ${
                step.done
                  ? `${step.bg} ${step.border} ${step.glow}`
                  : step.running
                    ? `${step.bg} ${step.border} animate-pulse`
                    : step.failed
                      ? "bg-red-500/5 border-red-500/20"
                      : "bg-white/[0.02] border-white/[0.04]"
              } ${expanded === i ? "ring-1 ring-white/20" : ""}`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
                step.done ? step.bg : step.running ? step.bg : "bg-white/[0.04]"
              }`}>
                {step.running ? (
                  <Loader2 size={16} className={`${step.color} animate-spin`} />
                ) : (
                  <span className={step.done ? step.color : step.failed ? "text-red-400" : "text-zinc-600"}>{step.icon}</span>
                )}
              </div>
              <span className={`text-xs font-semibold ${step.done ? step.color : step.running ? step.color : step.failed ? "text-red-400" : "text-zinc-600"}`}>
                {step.label}
              </span>
              <span className="text-xs text-zinc-500 text-center leading-tight min-h-[20px] line-clamp-2">
                {step.detail}
              </span>
            </button>
          </div>
        ))}
      </div>

      {/* Expanded detail panels */}
      <AnimatePresence mode="wait">
        {expanded === 1 && dealer && (
          <motion.div key="dealer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <DealerDetailPanel dealer={dealer} />
          </motion.div>
        )}
        {expanded === 2 && defense && (
          <motion.div key="defense" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <DefenseDetailPanel defense={defense} />
          </motion.div>
        )}
        {expanded === 3 && judge && (
          <motion.div key="judge" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <JudgeDetailPanel judge={judge} />
          </motion.div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );
}

/* ── L2 Dealer Detail Panel ── */

function DealerDetailPanel({ dealer }: { dealer: DealerPrediction }) {
  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Swords size={14} className="text-orange-400" />
        <span className="text-xs font-semibold text-orange-400">{"\u5E84\u5BB6AI\u63A8\u6F14"}</span>
      </div>
      <p className="text-sm text-zinc-200">{dealer.dealer_plan}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{"\u76EE\u6807\u4EF7\u4F4D"}</span>
          <p className="text-sm font-mono text-zinc-200">
            {dealer.target_price_range?.low ?? "?"} ~ {dealer.target_price_range?.high ?? "?"}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{"\u9636\u6BB5\u8F6C\u6362\u6982\u7387"}</span>
          <p className="text-sm font-mono text-zinc-200">
            {((dealer.next_stage_probability ?? 0) * 100).toFixed(0)}%
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{"\u9884\u8BA1\u65F6\u95F4"}</span>
          <p className="text-sm text-zinc-200">{dealer.estimated_transition || "-"}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{"\u5F53\u524D\u9636\u6BB5"}</span>
          <p className="text-sm font-mono text-zinc-200">{"\u7B2C"}{(dealer.current_stage ?? 0) + 1}{"\u9636\u6BB5"}</p>
        </div>
      </div>
      {dealer.tactics?.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{"\u5E84\u5BB6\u624B\u6BB5"}</span>
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

/* ── L3 Defense Detail Panel ── */

function DefenseDetailPanel({ defense }: { defense: DefenseStrategy }) {
  const riskColor = defense.risk_level === "high" || defense.risk_level === "\u6781\u9AD8"
    ? "text-red-400" : defense.risk_level === "moderate" || defense.risk_level === "\u4E2D\u7B49"
    ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-blue-400">{"\u9632\u5FA1AI\u53CD\u5236"}</span>
        <span className={`ml-auto text-xs font-mono ${riskColor}`}>
          {"\u98CE\u9669"}: {defense.risk_level}
        </span>
      </div>
      <p className="text-sm text-zinc-200">{defense.defense_summary}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{"\u8FDB\u573A\u6761\u4EF6"}</span>
          <p className="text-sm text-zinc-200">{defense.entry?.condition || "-"}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{"\u6B62\u635F\u903B\u8F91"}</span>
          <p className="text-sm text-zinc-200">{defense.stop_loss?.logic || "-"}</p>
        </div>
      </div>
      {defense.confirmation_signals?.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-500">{"\u786E\u8BA4\u4FE1\u53F7"}</span>
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
        <span className="text-xs text-zinc-500">{"\u9632\u5FA1\u7F6E\u4FE1\u5EA6"}</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(defense.confidence ?? 0) * 100}%` }} />
        </div>
        <span className="text-xs font-mono text-blue-400">{((defense.confidence ?? 0) * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

/* ── L4 Judge Detail Panel ── */

function JudgeDetailPanel({ judge }: { judge: JudgeAdoption }) {
  const adoptionLabel = { adopt: "\u2705 \u91C7\u7EB3\u9632\u5FA1\u7B56\u7565", partial: "\u26A0\uFE0F \u90E8\u5206\u91C7\u7EB3", wait: "\u23F8 \u5EFA\u8BAE\u89C2\u671B" };

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Gavel size={14} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-400">{"\u88C1\u5224AI\u91C7\u7EB3"}</span>
        </div>
        <span className="text-sm font-semibold text-white">
          {adoptionLabel[judge.adoption] || judge.adoption}
        </span>
      </div>
      <p className="text-sm text-zinc-200">{judge.final_recommendation}</p>
      {judge.next_move && (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
          <span className="text-xs text-zinc-500">{"\u4E0B\u4E00\u6B65\u64CD\u4F5C"}</span>
          <p className="text-sm text-emerald-300 font-medium mt-0.5">{judge.next_move}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <span className="text-xs text-zinc-500">{"\u5E84\u5BB6\u53EF\u4FE1\u5EA6"}</span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(judge.dealer_credibility ?? 0) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-orange-400">{((judge.dealer_credibility ?? 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-zinc-500">{"\u9632\u5FA1\u53EF\u884C\u6027"}</span>
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
          <span className="text-xs text-zinc-500">{"\u98CE\u9669\u63D0\u9192"}</span>
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
            {"\u88C1\u5224\u63A8\u7406\u8FC7\u7A0B"}
          </summary>
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{judge.reasoning}</p>
        </details>
      )}
    </div>
  );
}

/* ── Main page ── */

export default function PlaybookSimPage() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || "BTCUSDT";
  const [symbol, setSymbol] = useState(initialSymbol);
  const [expandedMatch, setExpandedMatch] = useState<number>(0);

  // ── SSE streaming state ──
  const [sim, setSim] = useState<SimResult | null>(null);
  const [stepStatus, setStepStatus] = useState<StepStatuses>(INITIAL_STEP_STATUS);
  const [streaming, setStreaming] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runStream = useCallback(async (sym: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStreaming(true);
    setSimError(null);
    setSim(null);
    setStepStatus({ ...INITIAL_STEP_STATUS, data: "running" });

    try {
      for await (const event of runPlaybookSimStream(sym)) {
        if (ctrl.signal.aborted) break;

        switch (event.type) {
          case "progress":
            setStepStatus((prev) => ({
              ...prev,
              ...(event.step === "data" ? { data: "running" } : {}),
              ...(event.step === "L1" ? { data: "done", L1: "running" } : {}),
              ...(event.step === "L2" ? { L1: "done", L2: "running" } : {}),
              ...(event.step === "L3" ? { L2: "done", L3: "running" } : {}),
              ...(event.step === "L4" ? { L3: "done", L4: "running" } : {}),
            }));
            break;

          case "step_done":
            setStepStatus((prev) => ({ ...prev, [event.step]: "done" as StepStatus }));
            if (event.step === "L1" && event.data) {
              setSim((prev) => ({
                ...(prev || {} as SimResult),
                top_matches: (event.data as Record<string, unknown>).top_matches as PlaybookMatch[],
                total_playbooks: (event.data as Record<string, unknown>).total_playbooks as number,
              }));
            }
            if (event.step === "L2" && event.data) {
              setSim((prev) => prev ? { ...prev, dealer_prediction: event.data as unknown as DealerPrediction } : prev);
            }
            if (event.step === "L3" && event.data) {
              setSim((prev) => prev ? { ...prev, defense_strategy: event.data as unknown as DefenseStrategy } : prev);
            }
            if (event.step === "L4" && event.data) {
              setSim((prev) => prev ? { ...prev, judge_adoption: event.data as unknown as JudgeAdoption } : prev);
            }
            break;

          case "step_fail":
            setStepStatus((prev) => ({ ...prev, [event.step]: "failed" as StepStatus }));
            break;

          case "complete": {
            setSim(event.result);
            const keep = (s: StepStatus) => s === "failed" || s === "idle" ? s : "done" as StepStatus;
            setStepStatus((prev) => ({
              data: "done", L1: keep(prev.L1), L2: keep(prev.L2), L3: keep(prev.L3), L4: keep(prev.L4),
            }));
            break;
          }

          case "cached":
            setSim(event.result);
            setStepStatus({ data: "done", L1: "done", L2: "done", L3: "done", L4: "done" });
            break;

          case "error":
            setSimError(event.message);
            break;
        }
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setSimError(err instanceof Error ? err.message : "SSE 连接失败");
      }
    } finally {
      setStreaming(false);
    }
  }, []);

  // Auto-run on symbol change
  useEffect(() => {
    if (symbol) runStream(symbol);
    return () => { abortRef.current?.abort(); };
  }, [symbol, runStream]);

  const { data: latest } = useQuery<PlaybookLatest | null>({
    queryKey: ["playbookLatest", symbol],
    queryFn: () => fetchPlaybookLatest(symbol),
    enabled: !!symbol,
    retry: false,
    staleTime: 30_000,
  });

  const { data: phaseHistory } = useQuery<PhaseHistory | null>({
    queryKey: ["phaseHistory", symbol],
    queryFn: () => fetchPhaseHistory(symbol),
    enabled: !!symbol,
    retry: false,
    staleTime: 30_000,
  });

  const { data: plaza } = useQuery<PlazaFeed>({
    queryKey: ["plazaFeed", symbol, 1],
    queryFn: () => fetchPlazaFeed({ symbol, page: 1, page_size: 10 }),
    retry: false,
    staleTime: 30_000,
  });

  const { data: plazaStats } = useQuery<PlazaStats>({
    queryKey: ["plazaStats"],
    queryFn: fetchPlazaStats,
    retry: false,
    staleTime: 60_000,
  });

  const activeMatch = (expandedMatch >= 0 && sim?.top_matches?.[expandedMatch]) || sim?.top_matches?.[0] || null;
  const signalInfo = SIGNAL_MAP[activeMatch?.signal || latest?.signal || "neutral"] || SIGNAL_MAP.neutral;
  const SignalIcon = signalInfo.icon;
  const isInitialLoading = streaming && !sim;

  const bestMatch = sim?.top_matches?.[0] || null;
  const secondMatch = sim?.top_matches?.[1] || null;
  const isLowConfidence = !!bestMatch && bestMatch.match_pct < 30;
  const isCrowdedMatch = !!bestMatch && !!secondMatch && Math.abs(bestMatch.match_pct - secondMatch.match_pct) <= 5;

  const storylinePred = bestMatch
    ? plaza?.items?.find(
        (p) => p.symbol === symbol.toUpperCase() && p.playbook_name === bestMatch.name
      )
    : undefined;

  return (
    <div className="mx-auto max-w-[1500px] px-4 md:px-8 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">{"\u5267\u672C\u63A8\u6F14"}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {"\u57FA\u4E8E\u771F\u5B9E\u5E02\u573A\u6570\u636E\u5339\u914D\u5DF2\u77E5\u64CD\u76D8\u5267\u672C + AI\u5BF9\u6297\u63A8\u6F14"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SymbolSelector value={symbol} onChange={(v) => { setSymbol(v); setExpandedMatch(0); }} allowedSymbols={["BTCUSDT", "ETHUSDT"]} />
          <button
            onClick={() => runStream(symbol)}
            disabled={streaming}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={streaming ? "animate-spin" : ""} />
            {"\u5237\u65B0"}
          </button>
        </div>
      </div>

      {/* ── Guide card ── */}
      <div className="card p-4 flex items-start gap-3">
        <BookOpen size={16} className="text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          <span className="text-zinc-300 font-medium">{"\u5267\u672C\u7CFB\u7EDF\u5DE5\u4F5C\u6D41\u7A0B\uFF1A"}</span>
          {"\u626B\u63CF\u5386\u53F2\u64CD\u76D8\u5267\u672C\u5E93 \u2192 \u5339\u914D\u5F53\u524D\u5E02\u573A\u7279\u5F81 \u2192 AI\u63A8\u6F14\u4E0B\u4E00\u9636\u6BB5 \u2192 \u5E84\u5BB6AI\u53CD\u5411\u63A8\u6F14 \u2192 \u751F\u6210\u53CD\u5236\u7B56\u7565\u3002\u5168\u5468\u671F K\u7EBF\u4EA4\u53C9\u9A8C\u8BC1\uFF0C\u786E\u4FDD\u5267\u672C\u5339\u914D\u7684\u53EF\u9760\u6027\u3002"}
        </div>
      </div>

      {/* ── Initial Loading (no sim data yet) ── */}
      {isInitialLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-zinc-500" />
          <span className="ml-3 text-sm text-zinc-500">{"\u6B63\u5728\u91C7\u96C6"} {symbol} {"\u7684\u5E02\u573A\u6570\u636E..."}</span>
        </div>
      )}

      {/* ── Error ── */}
      {simError && (
        <div className="card p-5 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm text-zinc-300">{"\u5206\u6790\u5931\u8D25"}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{simError}</p>
          </div>
        </div>
      )}

      {/* ── Low confidence / crowded match warning ── */}
      {sim && !simError && (isLowConfidence || isCrowdedMatch) && (
        <div className="card p-4 flex items-start gap-3 border-amber-500/20">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <span className="text-xs font-semibold text-amber-400">{"\u4F4E\u7F6E\u4FE1\u5EA6\u63D0\u793A"}</span>
            {isLowConfidence && (
              <p className="text-xs text-zinc-400 leading-relaxed">
                {"\u5F53\u524D\u6700\u9AD8\u5267\u672C\u5339\u914D\u5EA6\u8F83\u4F4E\uFF08"}{bestMatch!.match_pct.toFixed(1)}%{"\uFF09\uFF0C\u7ED3\u679C\u66F4\u9002\u5408\u4F5C\u4E3A\u89C2\u5BDF\u5047\u8BBE\uFF0C\u4E0D\u5B9C\u76F4\u63A5\u89C6\u4E3A\u5F3A\u6267\u884C\u7ED3\u8BBA\u3002"}
              </p>
            )}
            {isCrowdedMatch && (
              <p className="text-xs text-zinc-400 leading-relaxed">
                {"\u5F53\u524D\u591A\u4E2A\u5019\u9009\u5267\u672C\u5206\u6570\u63A5\u8FD1\uFF08\u524D\u4E24\u540D\u5DEE\u503C \u2264 5%\uFF09\uFF0C\u5B58\u5728\u591A\u5267\u672C\u5E76\u5217\u7ADE\u4E89\uFF0C\u9700\u7ED3\u5408\u66F4\u591A\u786E\u8BA4\u4FE1\u53F7\u5224\u65AD\u3002"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Main content (show as soon as we have any sim data) ── */}
      {sim && !simError && (
        <div className="space-y-6">
          {/* AI Adversarial L4 Flow */}
          <AdversarialL4 sim={sim} latest={latest ?? null} stepStatus={stepStatus} />

          {/* Playbook Storyline — 主视觉区 */}
          {bestMatch && bestMatch.stages && bestMatch.stages.length > 0 && (
            <PlaybookStoryline
              match={bestMatch}
              status={storylinePred?.status}
              riskFlag={storylinePred?.risk_flag}
              riskNote={storylinePred?.risk_note}
              failureReason={storylinePred?.failure_reason}
              verifiedStages={storylinePred?.verified_stages}
              finalAccuracy={storylinePred?.final_accuracy}
            />
          )}

          {/* Position calculator — 反制策略可用时显示 */}
          {sim.defense_strategy && (
            <PositionCalculator
              input={fromDefenseStrategy(sim.defense_strategy)}
              confidence={sim.defense_strategy.confidence}
            />
          )}

          {/* Overview cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u5F53\u524D\u9636\u6BB5"}</span>
              <p className="text-lg font-semibold text-white mt-1">{sim.current_phase}</p>
              {phaseHistory && (
                <p className="text-xs text-indigo-400 mt-1">{phaseHistory.current_phase_label}</p>
              )}
            </div>
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u5F53\u524D\u67E5\u770B\u5267\u672C"}</span>
              <p className="text-lg font-semibold text-white mt-1">{activeMatch?.name || "---"}</p>
              <p className={`text-xs mt-1 ${activeMatch?.match_pct && activeMatch.match_pct >= 70 ? "text-red-400" : activeMatch?.match_pct && activeMatch.match_pct >= 40 ? "text-amber-400" : "text-zinc-500"}`}>
                {"\u5339\u914D\u5EA6"} {activeMatch?.match_pct?.toFixed(1) || 0}%
              </p>
            </div>
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u4FE1\u53F7\u65B9\u5411"}</span>
              <div className="flex items-center gap-2 mt-1">
                <SignalIcon size={18} className={signalInfo.color} />
                <span className={`text-lg font-semibold ${signalInfo.color}`}>{signalInfo.label}</span>
              </div>
              {latest && (
                <p className="text-xs text-zinc-500 mt-1">{"\u7F6E\u4FE1\u5EA6"} {(latest.confidence * 100).toFixed(0)}%</p>
              )}
            </div>
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u626B\u63CF\u5267\u672C"}</span>
              <p className="text-lg font-semibold text-white mt-1">{sim.total_playbooks}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {"\u5339\u914D"} <span className="text-white">{sim.top_matches.length}</span> {"\u4E2A"}
              </p>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Left: Matched playbooks */}
            <div className="xl:col-span-5 space-y-5">
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
                  <Target size={14} className="text-indigo-400" />
                  <span className="text-sm font-semibold text-white">{"\u5339\u914D\u5267\u672C"}</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {sim.top_matches.map((match, idx) => (
                    <MatchCard
                      key={match.name}
                      match={match}
                      rank={idx + 1}
                      expanded={expandedMatch === idx}
                      onToggle={() => setExpandedMatch(expandedMatch === idx ? -1 : idx)}
                    />
                  ))}
                  {sim.top_matches.length === 0 && (
                    <div className="flex items-center justify-center py-12">
                      <span className="text-sm text-zinc-500">{"\u6682\u65E0\u5339\u914D\u7684\u5267\u672C"}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Probability distribution */}
              {latest?.all_probabilities && Object.keys(latest.all_probabilities).length > 0 && (
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={14} className="text-emerald-400" />
                    <span className="text-sm font-semibold text-white">{"\u6982\u7387\u5206\u5E03"}</span>
                  </div>
                  <div className="space-y-2.5">
                    {Object.entries(latest.all_probabilities)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, prob]) => (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs text-zinc-400 w-24 shrink-0 truncate">{name}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${prob >= 0.5 ? "bg-red-500" : prob >= 0.3 ? "bg-amber-500" : "bg-indigo-500"}`}
                              style={{ width: `${Math.min(prob * 100, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-mono w-10 text-right ${prob >= 0.5 ? "text-red-400" : prob >= 0.3 ? "text-amber-400" : "text-zinc-300"}`}>
                            {(prob * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Analysis + Counter + History */}
            <div className="xl:col-span-7 space-y-5">
              {/* LLM Prediction */}
              {sim.llm_prediction && (
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Brain size={14} className="text-purple-400" />
                    <span className="text-sm font-semibold text-white">{"AI \u63A8\u6F14\u9884\u6D4B"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <div>
                      <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u5F53\u524D\u9636\u6BB5"}</span>
                      <p className="text-sm font-semibold text-white mt-1">
                        {"\u7B2C"} {sim.llm_prediction.current_stage + 1} {"\u9636\u6BB5"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u4E0B\u9636\u6BB5\u6982\u7387"}</span>
                      <p className="text-sm font-semibold text-emerald-400 mt-1">
                        {(sim.llm_prediction.next_stage_probability * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u9884\u8BA1\u8F6C\u6362"}</span>
                      <p className="text-sm font-semibold text-indigo-400 mt-1">
                        {sim.llm_prediction.estimated_transition}
                      </p>
                    </div>
                  </div>
                  {(sim.llm_prediction.key_observations ?? []).length > 0 && (
                    <div>
                      <span className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">{"\u5173\u952E\u89C2\u5BDF"}</span>
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

              {/* Counter strategy */}
              {activeMatch?.counter_strategy && (
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield size={14} className="text-emerald-400" />
                    <span className="text-sm font-semibold text-white">{"\u53CD\u5236\u7B56\u7565"}</span>
                  </div>
                  <CounterStrategyPanel cs={activeMatch.counter_strategy} />
                </div>
              )}

              {/* PlaybookAgent reasoning */}
              {latest?.reasoning && (
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={14} className="text-indigo-400" />
                    <span className="text-sm font-semibold text-white">{"\u5206\u6790\u63A8\u7406"}</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                    {latest.reasoning}
                  </p>
                  {latest.next_move && (
                    <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                      <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u9884\u5224\u4E0B\u4E00\u6B65"}</span>
                      <p className="text-sm font-medium text-emerald-400 mt-1">{latest.next_move}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Phase history */}
              {phaseHistory && phaseHistory.transitions.length > 0 && (
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={14} className="text-zinc-400" />
                    <span className="text-sm font-semibold text-white">{"\u9636\u6BB5\u8F6C\u6362\u5386\u53F2"}</span>
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
          </div>

          {/* ── Plaza section ── */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            {/* Plaza stats */}
            {plazaStats && (
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 size={14} className="text-amber-400" />
                  <span className="text-sm font-semibold text-white">{"\u5267\u672C\u5E7F\u573A\u7EDF\u8BA1"}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                  <div>
                    <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u603B\u9884\u6D4B"}</span>
                    <p className="text-sm font-semibold text-white mt-1">{plazaStats.total_predictions}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u8FDB\u884C\u4E2D"}</span>
                    <p className="text-sm font-semibold text-emerald-400 mt-1">{plazaStats.active_count}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u5DF2\u5B8C\u6210"}</span>
                    <p className="text-sm font-semibold text-white mt-1">{plazaStats.completed_count}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u5E73\u5747\u51C6\u786E\u7387"}</span>
                    <p className="text-sm font-semibold text-amber-400 mt-1">
                      {(plazaStats.avg_accuracy * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                {plazaStats.top_playbooks.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/[0.06]">
                    <span className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">{"\u70ED\u95E8\u5267\u672C"}</span>
                    <div className="space-y-1.5">
                      {plazaStats.top_playbooks.slice(0, 3).map((p) => (
                        <div key={p.name} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.02]">
                          <span className="text-xs text-zinc-300">{p.name}</span>
                          <span className="text-sm font-mono text-indigo-400">{p.count} {"\u6B21"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Plaza feed */}
            <div className="xl:col-span-2 card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-white">{"\u5267\u672C\u5E7F\u573A"}</span>
                <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                  {plaza?.total || 0} {"\u6761\u9884\u6D4B"}
                </span>
              </div>
              {!plaza || plaza.items.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <span className="text-sm text-zinc-500">{"\u6682\u65E0\u5267\u672C\u9884\u6D4B\u8BB0\u5F55"}</span>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {plaza.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-medium text-white font-mono">{item.symbol}</span>
                        <span className="text-xs text-zinc-400 truncate">{item.playbook_name}</span>
                        {item.created_at && (
                          <span className="text-xs text-zinc-600">
                            {new Date(item.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-sm font-mono font-semibold ${item.match_pct >= 70 ? "text-red-400" : item.match_pct >= 40 ? "text-amber-400" : "text-zinc-400"}`}>
                          {item.match_pct.toFixed(0)}%
                        </span>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          item.status === "active" && item.risk_flag
                            ? "bg-amber-500/10 text-amber-400"
                            : item.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : item.status === "completed"
                                ? "bg-white/[0.06] text-zinc-300"
                                : item.status === "failed"
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-white/[0.04] text-zinc-500"
                        }`}>
                          {item.status === "active" && item.risk_flag
                            ? "\u9700\u5173\u6CE8"
                            : item.status === "active"
                              ? "\u8FDB\u884C\u4E2D"
                              : item.status === "completed"
                                ? "\u5DF2\u5B8C\u6210"
                                : item.status === "failed"
                                  ? "\u5DF2\u5931\u6548"
                                  : item.status === "expired"
                                    ? "\u5DF2\u8FC7\u671F"
                                    : item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!sim && !streaming && !simError && (
        <div className="flex flex-col items-center justify-center py-20">
          <Target size={32} className="text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">{"\u9009\u62E9\u4EA4\u6613\u5BF9\u540E\u81EA\u52A8\u5F00\u59CB\u5267\u672C\u63A8\u6F14\u5206\u6790"}</p>
          <p className="text-xs text-zinc-600 mt-1">{"\u57FA\u4E8E\u771F\u5B9E\u5E02\u573A\u6570\u636E\u5339\u914D\u5DF2\u77E5\u64CD\u76D8\u5267\u672C"}</p>
        </div>
      )}
    </div>
  );
}

/* ── Match card ── */

function MatchCard({
  match, rank, expanded, onToggle,
}: {
  match: PlaybookMatch; rank: number; expanded: boolean; onToggle: () => void;
}) {
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
                    {"\u7279\u5F81\u5339\u914D"} <span className="text-white font-mono">{match.matched_features}/{match.total_features}</span>
                  </span>
                )}
              </div>

              {match.stages && match.stages.length > 0 && (
                <div>
                  <span className="text-xs uppercase tracking-widest text-zinc-500 mb-3 block">{"\u9636\u6BB5\u8DEF\u7EBF\u56FE"}</span>
                  <div className="flex items-center">
                    {match.stages.map((stage, i) => {
                      const isCurrent = match.current_stage_idx === i;
                      const isPast = match.current_stage_idx != null && i < match.current_stage_idx;
                      return (
                        <div key={i} className="flex items-center flex-1 min-w-0">
                          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                            {/* Node */}
                            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                              isCurrent
                                ? "bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)] ring-2 ring-indigo-500/30"
                                : isPast
                                  ? "bg-indigo-500/20 text-indigo-400"
                                  : "bg-white/[0.06] text-zinc-600"
                            }`}>
                              {i + 1}
                            </div>
                            {/* Label */}
                            <span className={`text-xs text-center truncate w-full px-0.5 ${
                              isCurrent ? "text-indigo-400 font-semibold" : isPast ? "text-indigo-400/60" : "text-zinc-600"
                            }`}>
                              {stage.name || stage.phase}
                            </span>
                          </div>
                          {/* Connector */}
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
                  <span className="text-xs uppercase tracking-widest text-zinc-500">{"\u540E\u7EED\u8D70\u52BF"}</span>
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

/* ── Counter strategy panel ── */

function CounterStrategyPanel({ cs }: { cs: { action: string; entry_logic: string; stop_loss_logic: string; target_logic: string; risk_level: string; wait_signal: string; risk_warning: string } }) {
  const isHighRisk = cs.risk_level === "high" || cs.risk_level === "\u6781\u9AD8";
  const isMedRisk = cs.risk_level === "medium" || cs.risk_level === "\u4E2D\u7B49";

  return (
    <div className="space-y-3">
      {/* Action header */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
        <span className="text-sm font-medium text-white">{cs.action}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium border ${
          isHighRisk ? "text-red-400 bg-red-500/10 border-red-500/20"
            : isMedRisk ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
              : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        }`}>
          {"\u98CE\u9669"}: {cs.risk_level}
        </span>
      </div>

      {/* Attack vs Defense dual column */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Left: Attack side (entry) */}
        <div className="rounded-xl border border-emerald-500/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/[0.06] border-b border-emerald-500/10">
            <TrendingUp size={12} className="text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">{"\u8FDB\u653B\u7AEF"}</span>
          </div>
          <div className="p-3">
            <p className="text-xs text-zinc-500 mb-1">{"\u8FDB\u573A\u903B\u8F91"}</p>
            <p className="text-xs text-zinc-300 leading-relaxed">{cs.entry_logic}</p>
            {cs.wait_signal && (
              <div className="mt-2.5 pt-2.5 border-t border-white/[0.04]">
                <div className="flex items-start gap-1.5">
                  <Clock size={10} className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500">{"\u7B49\u5F85\u4FE1\u53F7"}</p>
                    <p className="text-xs text-zinc-300 mt-0.5">{cs.wait_signal}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Defense side (stop loss + target) */}
        <div className="rounded-xl border border-indigo-500/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/[0.06] border-b border-indigo-500/10">
            <Shield size={12} className="text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">{"\u9632\u5FA1\u7AEF"}</span>
          </div>
          <div className="p-3 space-y-2.5">
            <div>
              <p className="text-xs text-red-400/70 mb-0.5">{"\u6B62\u635F\u903B\u8F91"}</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{cs.stop_loss_logic}</p>
            </div>
            <div className="pt-2.5 border-t border-white/[0.04]">
              <p className="text-xs text-emerald-400/70 mb-0.5">{"\u76EE\u6807\u903B\u8F91"}</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{cs.target_logic}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Risk warning */}
      {cs.risk_warning && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/[0.03] border border-red-500/15">
          <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-xs uppercase tracking-widest text-red-400 block">{"\u98CE\u9669\u8B66\u544A"}</span>
            <span className="text-xs text-red-300/80">{cs.risk_warning}</span>
          </div>
        </div>
      )}
    </div>
  );
}
