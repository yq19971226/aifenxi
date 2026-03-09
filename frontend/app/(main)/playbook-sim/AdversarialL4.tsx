"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Target, Shield, Swords, Gavel, Check,
  ChevronDown, Loader2,
} from "lucide-react";
import type { SimResult } from "@/lib/api/playbook-sim";
import type { PlaybookLatest } from "@/lib/api/playbook";
import type { StepStatuses } from "./playbook-constants";
import { DealerDetailPanel, DefenseDetailPanel, JudgeDetailPanel } from "./L4DetailPanels";

interface Props {
  sim: SimResult;
  latest: PlaybookLatest | null;
  stepStatus: StepStatuses;
}

export default function AdversarialL4({ sim, latest: _latest, stepStatus }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const dealer = sim.dealer_prediction;
  const defense = sim.defense_strategy;
  const judge = sim.judge_adoption;

  const steps = [
    {
      icon: <Target size={16} />,
      label: "L1 剧本匹配",
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
      glow: "",
      done: stepStatus.L1 === "done",
      running: stepStatus.L1 === "running",
      failed: stepStatus.L1 === "failed",
      detail: sim.top_matches?.length > 0 ? sim.top_matches[0]?.name : (stepStatus.L1 === "running" ? "匹配中..." : "无匹配"),
    },
    {
      icon: <Swords size={16} />,
      label: "L2 庄家推演",
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
      glow: "",
      done: stepStatus.L2 === "done",
      running: stepStatus.L2 === "running",
      failed: stepStatus.L2 === "failed",
      detail: dealer?.dealer_plan
        ? dealer.dealer_plan.slice(0, 20) + (dealer.dealer_plan.length > 20 ? "..." : "")
        : (stepStatus.L2 === "running" ? "推演中..." : "待推演"),
    },
    {
      icon: <Shield size={16} />,
      label: "L3 防御反制",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      glow: "",
      done: stepStatus.L3 === "done",
      running: stepStatus.L3 === "running",
      failed: stepStatus.L3 === "failed",
      detail: defense?.defense_summary
        ? defense.defense_summary.slice(0, 20) + (defense.defense_summary.length > 20 ? "..." : "")
        : (stepStatus.L3 === "running" ? "反制中..." : "待反制"),
    },
    {
      icon: <Gavel size={16} />,
      label: "L4 裁判采纳",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      glow: "",
      done: stepStatus.L4 === "done",
      running: stepStatus.L4 === "running",
      failed: stepStatus.L4 === "failed",
      detail: judge
        ? ({ adopt: "✅ 采纳防御", partial: "⚠️ 部分采纳", wait: "⏸ 建议观望" }[judge.adoption] || judge.adoption)
        : (stepStatus.L4 === "running" ? "裁决中..." : "待裁决"),
    },
    {
      icon: <Check size={16} />,
      label: "L5 最终策略",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      glow: "",
      done: !!judge?.next_move,
      running: false,
      failed: false,
      detail: judge?.next_move
        ? judge.next_move.slice(0, 20) + (judge.next_move.length > 20 ? "..." : "")
        : "待生成",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

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
          <span className="text-sm font-semibold text-white">AI 推理过程</span>
        </div>
        <div className="flex items-center gap-2">
          {allDone && collapsed && summaryParts.length > 0 && (
            <span className="text-xs text-zinc-400">{summaryParts.join(" · ")}</span>
          )}
          <span className="text-xs font-mono text-zinc-500">
            {completedCount}/{steps.length} 完成
          </span>
          {allDone && (
            <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
          )}
        </div>
      </button>

      {collapsed && (
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-orange-500 via-blue-500 via-amber-500 to-emerald-500 w-full" />
        </div>
      )}

      {!collapsed && (
        <>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-orange-500 via-blue-500 via-amber-500 to-emerald-500 transition-all duration-700"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {steps.map((step, i) => (
          <div key={i} className="relative">
            {i < steps.length - 1 && (
              <div className={`hidden md:block absolute top-5 -right-1 w-2 h-0.5 ${step.done ? "bg-zinc-500" : "bg-zinc-800"}`} />
            )}
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className={`w-full flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 border transition-all cursor-pointer ${
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
