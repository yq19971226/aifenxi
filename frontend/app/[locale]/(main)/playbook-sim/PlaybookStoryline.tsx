"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, AlertTriangle, XCircle, Clock } from "lucide-react";
import type { PlaybookMatch, PlaybookStage } from "@/lib/api/playbook-sim";
import { localizeText } from "@/components/analysis/helpers";
import {
  getDomainLabel,
  getMarketStructureLabel,
  getRegimeLabel,
} from "./playbook-constants";

interface Props {
  match: PlaybookMatch;
  status?: string;
  riskFlag?: boolean;
  riskNote?: string | null;
  failureReason?: string | null;
  verifiedStages?: number;
  finalAccuracy?: number | null;
}

function resolveStatus(status?: string, riskFlag?: boolean): string {
  if (!status) return "untracked";
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
  t,
}: {
  stage: PlaybookStage;
  index: number;
  state: "verified" | "current" | "failed" | "pending";
  isLast: boolean;
  onToggle: () => void;
  expanded: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
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
          {localizeText(stage.name || stage.phase || "")}
        </span>
        {expanded && (
          <div className="w-full mt-1 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs space-y-1.5">
            {stage.typical_duration && (
              <div className="flex justify-between">
                <span className="text-zinc-500">{t("storyline.estDuration")}</span>
                <span className="text-zinc-300">{stage.typical_duration}</span>
              </div>
            )}
            {stage.features && stage.features.length > 0 && (
              <div>
                <span className="text-zinc-500">{t("storyline.stageFeatures")}</span>
                <ul className="mt-0.5 space-y-0.5">
                  {stage.features.map((f, fi) => (
                    <li key={fi} className="text-zinc-400 pl-2">· {localizeText(f)}</li>
                  ))}
                </ul>
              </div>
            )}
            {stage.key_indicators && stage.key_indicators.length > 0 && (
              <div>
                <span className="text-zinc-500">{t("storyline.keyIndicators")}</span>
                <ul className="mt-0.5 space-y-0.5">
                  {stage.key_indicators.map((k, ki) => (
                    <li key={ki} className="text-zinc-400 pl-2">· {localizeText(k)}</li>
                  ))}
                </ul>
              </div>
            )}
            {stage.next_stage_probability != null && (
              <div className="flex justify-between">
                <span className="text-zinc-500">{t("storyline.nextStageProb")}</span>
                <span className="text-zinc-300">{(stage.next_stage_probability * 100).toFixed(0)}%</span>
              </div>
            )}
            {stage.failure_signal && (
              <div className="flex items-start gap-1 text-amber-400/80">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                <span>{t("storyline.failurePrefix")}: {localizeText(stage.failure_signal)}</span>
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
  const t = useTranslations("playbook-sim");
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  if (!match.stages || match.stages.length === 0) return null;

  const resolved = resolveStatus(status, riskFlag);
  const statusLabel = t(`storyline.${resolved}` as Parameters<typeof t>[0]);
  const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
    active:     { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    risk:       { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
    completed:  { color: "text-zinc-300",     bg: "bg-white/[0.06]",   border: "border-white/[0.06]" },
    failed:     { color: "text-red-400",      bg: "bg-red-500/10",     border: "border-red-500/20" },
    expired:    { color: "text-zinc-500",     bg: "bg-white/[0.04]",   border: "border-white/[0.04]" },
    untracked:  { color: "text-zinc-500",     bg: "bg-white/[0.04]",   border: "border-white/[0.04]" },
  };
  const cfg = STATUS_STYLE[resolved] || STATUS_STYLE.active;
  const currentIdx = match.current_stage_idx ?? -1;
  const verified = verifiedStages ?? 0;
  const marketStructureLabel = getMarketStructureLabel(match.market_structure_type);
  const requiredDomains = match.required_domains ?? [];
  const applicableRegimes = match.applicable_regimes ?? [];

  function stageState(i: number): "verified" | "current" | "failed" | "pending" {
    if (resolved === "failed" && i === currentIdx + 1) return "failed";
    if (i < verified || (i <= currentIdx && verified > 0)) return "verified";
    if (i === currentIdx || (currentIdx < 0 && i === 0)) return "current";
    return "pending";
  }

  return (
    <div className={`card p-5 space-y-4 border ${cfg.border}`}>
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
          {statusLabel}
        </span>
      </div>

      {(marketStructureLabel || requiredDomains.length > 0 || applicableRegimes.length > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500">{t("storyline.marketStructure")}</span>
            <p className="mt-1 text-sm text-indigo-300">{marketStructureLabel || "—"}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500">{t("storyline.keyDomains")}</span>
            <p className="mt-1 text-xs leading-relaxed text-zinc-300">
              {requiredDomains.length > 0
                ? requiredDomains.map((value) => getDomainLabel(value)).join(" / ")
                : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500">{t("storyline.applicableRegimes")}</span>
            <p className="mt-1 text-xs leading-relaxed text-zinc-300">
              {applicableRegimes.length > 0
                ? applicableRegimes.map((value) => getRegimeLabel(value)).join(" / ")
                : "—"}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start overflow-x-auto pb-1">
        {match.stages.map((stage, i) => (
          <StageNode
            key={i}
            stage={stage}
            index={i}
            state={stageState(i)}
            isLast={i === match.stages!.length - 1}
            onToggle={() => setExpandedStage(expandedStage === i ? null : i)}
            expanded={expandedStage === i}
            t={t}
          />
        ))}
      </div>

      {resolved === "active" && verified > 0 && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Clock size={12} />
          <span>{t("storyline.stageVerification", { verified, total: match.stages.length })}</span>
        </div>
      )}

      {resolved === "completed" && (
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <CheckCircle2 size={12} className="text-emerald-400" />
          <span>{t("storyline.stageVerificationPassed", { verified, total: match.stages.length })}</span>
          {finalAccuracy != null && (
            <span className="text-zinc-500 ml-1">({(finalAccuracy * 100).toFixed(0)}%)</span>
          )}
        </div>
      )}

      {resolved === "risk" && riskNote && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-xs font-medium text-amber-400">{t("storyline.riskDeviation")}</span>
            <p className="text-xs text-zinc-400 mt-0.5">{localizeText(riskNote!)}</p>
          </div>
        </div>
      )}

      {resolved === "failed" && failureReason && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
          <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-xs font-medium text-red-400">{t("storyline.predictionFailed")}</span>
            <p className="text-xs text-zinc-400 mt-0.5">{localizeText(failureReason!)}</p>
          </div>
        </div>
      )}

      {resolved === "expired" && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock size={12} />
          <span>{t("storyline.expiredMessage")}</span>
          {verified > 0 && <span>· {t("storyline.verificationProgress", { verified, total: match.stages.length })}</span>}
        </div>
      )}
    </div>
  );
}
