"use client";

import { useTranslations } from "next-intl";
import { Brain, Target, Swords, Shield, ChevronRight, Activity, Bot } from "lucide-react";
import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";
import { isConsensusAgentSection, localizeText } from "@/components/analysis/helpers";
import { MODE_CONTRACTS } from "@/lib/mode-contract";

export function AdversarialFlow({ report }: { report: AnalysisReportType }) {
  const t = useTranslations("consensus");

  if (report.status === "blocked") {
    return null;
  }

  const contract = MODE_CONTRACTS[report.mode];
  const consensusSection = report.sections.find(
    (s) => s.title === "共识报告"
  );
  const adversarialSection = report.sections.find(
    (s) => s.title === "对抗推演" || s.title === "AdversarialAgent"
  );
  const collusionSection = report.sections.find(
    (s) => s.title === "合谋检测"
  );
  const aiManipulationSection = report.sections.find(
    (s) => s.title === "AI操盘检测"
  );
  const completedCoreSections = report.sections.filter(
    (s) => s.status === "completed" && isConsensusAgentSection(s.title)
  ).length;
  const coreAnalysisDone = completedCoreSections > 0;
  const crossValidationDone = completedCoreSections >= 2;
  const finalStepDone = contract.defense_layer.length > 0
    ? Boolean(report.strategy) && (report.mode !== "trend" || aiManipulationSection?.status === "completed")
    : Boolean(report.strategy);

  const steps = [
    { icon: <Brain size={16} />, label: t("flow.coreAnalysis"), color: "text-indigo-400", bgColor: "bg-indigo-500/10", border: "border-indigo-500/20", done: coreAnalysisDone },
    ...(report.mode === "intraday"
      ? [{ icon: <Activity size={16} />, label: t("flow.crossValidation"), color: "text-emerald-400", bgColor: "bg-emerald-500/10", border: "border-emerald-500/20", done: crossValidationDone }]
      : []),
    ...(contract.consensus_layer
      ? [{ icon: <Target size={16} />, label: t("flow.multiModelConsensus"), color: "text-emerald-400", bgColor: "bg-emerald-500/10", border: "border-emerald-500/20", done: consensusSection?.status === "completed" }]
      : []),
    ...(contract.defense_layer.length > 0
      ? [{ icon: <Swords size={16} />, label: t("flow.makerAI"), color: "text-amber-400", bgColor: "bg-amber-500/10", border: "border-amber-500/20", done: adversarialSection?.status === "completed" }]
      : []),
    ...(contract.defense_layer.includes("collusion_detector")
      ? [{ icon: <Brain size={16} />, label: t("flow.collusionDetection"), color: "text-pink-400", bgColor: "bg-pink-500/10", border: "border-pink-500/20", done: collusionSection?.status === "completed" }]
      : []),
    ...(report.mode === "trend"
      ? [{ icon: <Bot size={16} />, label: t("flow.aiManipulation"), color: "text-rose-400", bgColor: "bg-rose-500/10", border: "border-rose-500/20", done: aiManipulationSection?.status === "completed" }]
      : []),
    {
      icon: contract.defense_layer.length > 0 ? <Shield size={16} /> : <Target size={16} />,
      label: contract.defense_layer.length > 0 ? t("flow.refinedPositions") : t("flow.strategyAdvice"),
      color: contract.defense_layer.length > 0 ? "text-violet-400" : "text-sky-400",
      bgColor: contract.defense_layer.length > 0 ? "bg-violet-500/10" : "bg-sky-500/10",
      border: contract.defense_layer.length > 0 ? "border-violet-500/20" : "border-sky-500/20",
      done: finalStepDone,
    },
  ];
  const flowTitle = contract.defense_layer.length > 0 ? t("flow.adversarialFlow") : t("flow.analysisFlow");

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-indigo-400" />
        <span className="text-sm font-semibold text-zinc-200">{flowTitle}</span>
      </div>
      
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 sm:flex-1">
            <div
              className={`flex items-center justify-center gap-2 rounded-lg p-2.5 ${
                step.done ? `${step.bgColor} border ${step.border}` : "bg-white/[0.02] border border-white/[0.05]"
              } flex-1 min-w-0 transition-colors`}
            >
              <span className={step.done ? step.color : "text-zinc-500"}>{step.icon}</span>
              <span
                className={`text-xs sm:text-sm font-medium truncate ${
                  step.done ? step.color : "text-zinc-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                size={14}
                className={`hidden sm:block ${step.done ? "text-zinc-500 shrink-0" : "text-zinc-500 shrink-0"}`}
              />
            )}
          </div>
        ))}
      </div>

      {contract.defense_layer.length > 0 && adversarialSection?.data && (
        <div className="mt-4 rounded-lg border-l-2 border-amber-500/50 bg-amber-500/[0.05] px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Swords size={13} className="text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              {t("flow.makerPerspective")}
            </span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {localizeText(String(adversarialSection.data.dealer_intent || adversarialSection.data.summary || t("flow.makerCompleted")))}
          </p>
        </div>
      )}
    </div>
  );
}
