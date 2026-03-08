"use client";

import { motion } from "framer-motion";
import { Info, Zap } from "lucide-react";

import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { AgentConsensusBar } from "./AgentConsensusBar";
import { KeyFindingsSummary } from "./KeyFindings";
import { DeepAnalysis } from "./DeepAnalysis";

interface AnalysisReportProps {
  report: AnalysisReportType;
}

export function AnalysisReport({ report }: AnalysisReportProps) {
  const isBlocked = report.status === "blocked";

  return (
    <div className="space-y-5">
      {/* Layer 1: Executive Summary (always shown — includes StatusBanner for blocked) */}
      <ExecutiveSummary report={report} />

      {/* Layers 1.5–3: skip when blocked — strategy data is unreliable */}
      {!isBlocked && (
        <>
          {/* Layer 1.5: Agent Consensus Bar */}
          <AgentConsensusBar sections={report.sections} />

          {/* Layer 2: Key Findings */}
          <KeyFindingsSummary sections={report.sections} />

          {/* Layer 3: Deep Analysis (Tab system) */}
          <DeepAnalysis sections={report.sections} />
        </>
      )}

      {/* Footer: timestamp + engine metadata */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center justify-center gap-3 pt-2 flex-wrap"
      >
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-zinc-500" />
          <p className="text-xs text-zinc-500">
            {new Date(report.timestamp).toLocaleString("zh-CN")}
          </p>
        </div>
        {(report.engine_type || report.mode_contract_version) && (
          <div className="flex items-center gap-1.5">
            <Info className="h-3 w-3 text-zinc-500" />
            <p className="text-xs font-mono text-zinc-500">
              {report.engine_type && <span>{report.engine_type}</span>}
              {report.engine_type && report.mode_contract_version && (
                <span className="text-zinc-600"> · </span>
              )}
              {report.mode_contract_version && (
                <span>v{report.mode_contract_version}</span>
              )}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

