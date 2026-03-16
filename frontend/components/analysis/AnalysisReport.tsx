"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Info, Share2, Zap, ChevronDown, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";
import { UnifiedResultCard } from "./UnifiedResultCard";
import { DeepAnalysis } from "./DeepAnalysis";
import { ShareModal } from "./ShareModal";
import { AICitationSnippet } from "./AICitationSnippet";
import { SignalStabilityBar } from "./SignalStabilityBar";
import { useShareCardConfig } from "@/lib/hooks/useShareCardConfig";

interface AnalysisReportProps {
  report: AnalysisReportType;
}

const ENGINE_LABELS: Record<string, string> = {
  rule_engine: "规则引擎",
  llm_orchestrator: "LLM 编排",
  hybrid: "混合引擎",
};

export function AnalysisReport({ report }: AnalysisReportProps) {
  const t = useTranslations("consensus");
  const isBlocked = report.status === "blocked";
  const [showShare, setShowShare] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);
  const { data: shareConfig } = useShareCardConfig();

  return (
    <div className="space-y-5">
      {/* Share button (top-right float) */}
      {!isBlocked && (
        <div className="flex justify-end -mb-3">
          <button
            type="button"
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Share2 size={14} />
            {t("card.share")}
          </button>
        </div>
      )}

      {/* Signal Stability Bar — shows history consistency */}
      {!isBlocked && (
        <SignalStabilityBar symbol={report.symbol} mode={report.mode} />
      )}

      {/* Unified result card: signal → prices → consensus → findings → risk */}
      <UnifiedResultCard report={report} />

      {/* AI Citation Snippet — collapsible toggle, advanced/GEO feature */}
      {!isBlocked && (
        <div>
          <button
            type="button"
            onClick={() => setShowSnippet(v => !v)}
            className="flex items-center gap-2 text-[10px] font-mono text-indigo-400/50 hover:text-indigo-400 transition-colors px-1 py-0.5"
          >
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${showSnippet ? "rotate-180" : ""}`}
            />
            {t("snippet.title")}
          </button>
          {showSnippet && (
            <div className="mt-2">
              <AICitationSnippet report={report} />
            </div>
          )}
        </div>
      )}

      {/* Deep Analysis (Tab system) — separate below */}
      {!isBlocked && (
        <>
          <div className="flex items-center gap-4 pt-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] shrink-0">
              {t("card.deepAnalysis")}
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          </div>
          <DeepAnalysis sections={report.sections} reportKey={report.timestamp} />
        </>
      )}

      {/* Footer: timestamp + engine metadata */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center justify-center gap-4 pt-4 pb-1 flex-wrap"
      >
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-zinc-600" />
          <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
            {new Date(report.timestamp).toLocaleString("zh-CN")}
          </p>
        </div>
        {(report.engine_type || report.mode_contract_version) && (
          <>
            <span className="text-zinc-800">·</span>
            <div className="flex items-center gap-1.5">
              <Info className="h-3 w-3 text-zinc-600" />
              <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                {report.engine_type && <span>{ENGINE_LABELS[report.engine_type] || report.engine_type}</span>}
                {report.engine_type && report.mode_contract_version && (
                  <span> · </span>
                )}
                {report.mode_contract_version && (
                  <span>v{report.mode_contract_version}</span>
                )}
              </p>
            </div>
          </>
        )}
      </motion.div>

      {/* ⚠️ Legal Disclaimer — 合规必须项 */}
      <div className="flex items-start gap-2.5 border border-amber-500/15 bg-amber-500/[0.04] rounded-lg px-4 py-3">
        <AlertTriangle size={13} className="text-amber-500/60 shrink-0 mt-0.5" />
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          {t("disclaimer")}
        </p>
      </div>

      {/* Share modal */}
      {showShare && (
        <ShareModal report={report} config={shareConfig} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
