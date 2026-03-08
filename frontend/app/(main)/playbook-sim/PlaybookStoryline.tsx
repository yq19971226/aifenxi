"use client";

import { useState } from "react";
import { CheckCircle2, Circle, AlertTriangle, XCircle, Clock } from "lucide-react";
import type { PlaybookMatch, PlaybookStage } from "@/lib/api/playbook-sim";

/**
 * 剧本故事线进度组件 — 展示 top1 匹配剧本的阶段验证进度。
 *
 * 5 种状态:
 *   active           → 🟢 跟踪中
 *   active+risk_flag → 🟡 需关注
 *   completed        → ✅ 验证完成
 *   failed           → 🔴 已失效
 *   expired          → ⏳ 已过期
 */

interface Props {
  match: PlaybookMatch;
  status?: string;
  riskFlag?: boolean;
  riskNote?: string | null;
  failureReason?: string | null;
  verifiedStages?: number;
  finalAccuracy?: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:     { label: "跟踪中",   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  risk:       { label: "需关注",   color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
  completed:  { label: "验证完成", color: "text-zinc-300",     bg: "bg-white/[0.06]",   border: "border-white/[0.06]" },
  failed:     { label: "已失效",   color: "text-red-400",      bg: "bg-red-500/10",     border: "border-red-500/20" },
  expired:    { label: "已过期",   color: "text-zinc-500",     bg: "bg-white/[0.04]",   border: "border-white/[0.04]" },
};

function resolveStatus(status?: string, riskFlag?: boolean): string {
  if (status === "failed") return "failed";
  if (status === "completed") return "completed";
  if (status === "expired") return "expired";
  if (riskFlag) return "risk";
  return "active";
}

function StageNode({
  stage,
  index,
  state,
  isLast,
  onToggle,
  expanded,
}: {
  stage: PlaybookStage;
  index: number;
  state: "verified" | "current" | "failed" | "pending";
  isLast: boolean;
  onToggle: () => void;
  expanded: boolean;
}) {
  const nodeStyle = {
    verified: "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/20",
    current:  "bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)] ring-2 ring-indigo-500/30",
    failed:   "bg-red-500/20 text-red-400 ring-2 ring-red-500/20",
    pending:  "bg-white/[0.06] text-zinc-600",
  };
  const labelStyle = {
    verified: "text-emerald-400/80",
    current:  "text-indigo-400 font-semibold",
    failed:   "text-red-400",
    pending:  "text-zinc-600",
  };
  const connectorStyle = {
    verified: "bg-emerald-500/30",
    current:  "bg-indigo-500/30",
    failed:   "bg-red-500/20",
    pending:  "bg-white/[0.06]",
  };

  const iconMap = {
    verified: <CheckCircle2 size={14} />,
    current:  <Circle size={14} className="animate-pulse" />,
    failed:   <XCircle size={14} />,
    pending:  <Circle size={14} />,
  };

  return (
    <div className="flex items-start flex-1 min-w-0">
      <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
        <button
          onClick={onToggle}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-all cursor-pointer ${nodeStyle[state]}`}
          title={stage.name}
        >
          {iconMap[state]}
        </button>
        <span className={`text-xs text-center leading-tight w-full px-0.5 line-clamp-2 ${labelStyle[state]}`}>
          {stage.name || stage.phase}
        </span>
        {expanded && (
          <div className="w-full mt-1 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs space-y-1.5">
            {stage.typical_duration && (
              <div className="flex justify-between">
                <span className="text-zinc-500">预计时长</span>
                <span className="text-zinc-300">{stage.typical_duration}</span>
              </div>
            )}
            {stage.features && stage.features.length > 0 && (
              <div>
                <span className="text-zinc-500">阶段特征</span>
                <ul className="mt-0.5 space-y-0.5">
                  {stage.features.map((f, fi) => (
                    <li key={fi} className="text-zinc-400 pl-2">· {f}</li>
                  ))}
                </ul>
              </div>
            )}
            {stage.key_indicators && stage.key_indicators.length > 0 && (
              <div>
                <span className="text-zinc-500">关键指标</span>
                <ul className="mt-0.5 space-y-0.5">
                  {stage.key_indicators.map((k, ki) => (
                    <li key={ki} className="text-zinc-400 pl-2">· {k}</li>
                  ))}
                </ul>
              </div>
            )}
            {stage.next_stage_probability != null && (
              <div className="flex justify-between">
                <span className="text-zinc-500">下阶段概率</span>
                <span className="text-zinc-300">{(stage.next_stage_probability * 100).toFixed(0)}%</span>
              </div>
            )}
            {stage.failure_signal && (
              <div className="flex items-start gap-1 text-amber-400/80">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                <span>失效: {stage.failure_signal}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {!isLast && (
        <div className={`h-0.5 w-full mx-1 mt-4 shrink-0 ${connectorStyle[state]}`} />
      )}
    </div>
  );
}

export default function PlaybookStoryline({
  match,
  status,
  riskFlag,
  riskNote,
  failureReason,
  verifiedStages,
  finalAccuracy,
}: Props) {
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  if (!match.stages || match.stages.length === 0) return null;

  const resolved = resolveStatus(status, riskFlag);
  const cfg = STATUS_CONFIG[resolved] || STATUS_CONFIG.active;
  const currentIdx = match.current_stage_idx ?? -1;
  const verified = verifiedStages ?? 0;

  function stageState(i: number): "verified" | "current" | "failed" | "pending" {
    if (resolved === "failed" && i === currentIdx + 1) return "failed";
    if (i < verified || (i <= currentIdx && verified > 0)) return "verified";
    if (i === currentIdx || (currentIdx < 0 && i === 0)) return "current";
    return "pending";
  }

  return (
    <div className={`card p-5 space-y-4 border ${cfg.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-white truncate">{match.name}</span>
          <span className={`text-sm font-mono font-semibold ${
            match.match_pct >= 70 ? "text-red-400" : match.match_pct >= 40 ? "text-amber-400" : "text-zinc-400"
          }`}>
            {match.match_pct.toFixed(1)}%
          </span>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      {/* Stage roadmap */}
      <div className="flex items-start">
        {match.stages.map((stage, i) => (
          <StageNode
            key={i}
            stage={stage}
            index={i}
            state={stageState(i)}
            isLast={i === match.stages!.length - 1}
            onToggle={() => setExpandedStage(expandedStage === i ? null : i)}
            expanded={expandedStage === i}
          />
        ))}
      </div>

      {/* Verification progress */}
      {resolved === "active" && verified > 0 && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Clock size={12} />
          <span>阶段验证 {verified}/{match.stages.length}</span>
        </div>
      )}

      {/* Completed */}
      {resolved === "completed" && (
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <CheckCircle2 size={12} className="text-emerald-400" />
          <span>阶段验证 {verified}/{match.stages.length} 全部通过</span>
          {finalAccuracy != null && (
            <span className="text-zinc-500 ml-1">({(finalAccuracy * 100).toFixed(0)}%)</span>
          )}
        </div>
      )}

      {/* Risk warning */}
      {resolved === "risk" && riskNote && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-xs font-medium text-amber-400">走势偏离预期</span>
            <p className="text-xs text-zinc-400 mt-0.5">{riskNote}</p>
          </div>
        </div>
      )}

      {/* Failed */}
      {resolved === "failed" && failureReason && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
          <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-xs font-medium text-red-400">预测失效</span>
            <p className="text-xs text-zinc-400 mt-0.5">{failureReason}</p>
          </div>
        </div>
      )}

      {/* Expired */}
      {resolved === "expired" && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock size={12} />
          <span>72小时内未观察到进一步阶段推进</span>
          {verified > 0 && <span>· 验证进度 {verified}/{match.stages.length}</span>}
        </div>
      )}
    </div>
  );
}
