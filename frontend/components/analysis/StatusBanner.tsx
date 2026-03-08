"use client";

import { AlertTriangle, Check, X } from "lucide-react";

import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";
import { blockedReasonLabel } from "./helpers";

export function AnalysisStatusBanner({ report }: { report: AnalysisReportType }) {
  const status = report.status || "actionable";
  const dqs = report.data_quality_snapshot;
  if (status === "actionable" && !dqs) return null;

  const statusConfig: Record<string, { border: string; bg: string; text: string; label: string; icon: typeof Check }> = {
    actionable: { border: "border-emerald-500/20", bg: "bg-emerald-500/[0.04]", text: "text-emerald-400", label: "可执行", icon: Check },
    degraded: { border: "border-amber-500/20", bg: "bg-amber-500/[0.04]", text: "text-amber-400", label: "降级", icon: AlertTriangle },
    blocked: { border: "border-red-500/20", bg: "bg-red-500/[0.04]", text: "text-red-400", label: "阻断", icon: X },
  };

  const cfg = statusConfig[status] || statusConfig.actionable;
  const StatusIcon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} px-4 py-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <StatusIcon className={`h-4 w-4 ${cfg.text}`} />
        <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
        {report.blocked_reason && (
          <span className="text-sm text-zinc-400">— {blockedReasonLabel(report.blocked_reason)}</span>
        )}
      </div>
      {dqs && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          <span>
            周期完整度{" "}
            <span className={`font-mono font-medium ${dqs.interval_completeness >= 0.8 ? "text-emerald-400" : dqs.interval_completeness >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
              {(dqs.interval_completeness * 100).toFixed(0)}%
            </span>
          </span>
          <span>
            新鲜度{" "}
            <span className={`font-mono font-medium ${dqs.freshness >= 0.8 ? "text-emerald-400" : dqs.freshness >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
              {(dqs.freshness * 100).toFixed(0)}%
            </span>
          </span>
          {dqs.missing_inputs.length > 0 && (
            <span>缺失 <span className="font-medium text-amber-400">{dqs.missing_inputs.join(", ")}</span></span>
          )}
          {Object.keys(dqs.capability_state).length > 0 && (
            <span>
              能力{" "}
              <span className="font-medium text-zinc-300">
                {Object.entries(dqs.capability_state).filter(([, v]) => v !== "AVAILABLE").map(([k, v]) => `${k}:${v}`).join(", ") || "全部可用"}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
