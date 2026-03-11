"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Info, Share2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";
import { UnifiedResultCard } from "./UnifiedResultCard";
import { DeepAnalysis } from "./DeepAnalysis";
import { ShareModal } from "./ShareModal";
import { AICitationSnippet } from "./AICitationSnippet";
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

      {/* Unified result card: signal → prices → consensus → findings → risk */}
      <UnifiedResultCard report={report} />

      {/* AI Citation Snippet for GEO */}
      {!isBlocked && <AICitationSnippet report={report} />}

      {/* Deep Analysis (Tab system) — separate below */}
      {!isBlocked && (
        <>
          <div className="flex items-center gap-4 pt-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] shrink-0">
              {t("card.deepAnalysis")} / DEEP ANALYSIS
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

      {/* Share modal */}
      {showShare && (
        <ShareModal report={report} config={shareConfig} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

