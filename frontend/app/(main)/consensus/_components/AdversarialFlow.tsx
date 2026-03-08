"use client";

import { Brain, Target, Swords, Shield, ChevronRight, Activity } from "lucide-react";
import type { AnalysisReport as AnalysisReportType } from "@/lib/api/analysis";

export function AdversarialFlow({ report }: { report: AnalysisReportType }) {
  const adversarialSection = report.sections.find(
    (s) => s.title === "对抗推演" || s.title === "AdversarialAgent"
  );

  const steps = [
    { icon: <Brain size={16} />, label: "核心AI分析", color: "text-indigo-400", bgColor: "bg-indigo-500/10", border: "border-indigo-500/20", done: true },
    { icon: <Target size={16} />, label: "多模型共识", color: "text-emerald-400", bgColor: "bg-emerald-500/10", border: "border-emerald-500/20", done: true },
    { icon: <Swords size={16} />, label: "庄家AI反推", color: "text-amber-400", bgColor: "bg-amber-500/10", border: "border-amber-500/20", done: !!adversarialSection },
    { icon: <Shield size={16} />, label: "修正精准点位", color: "text-violet-400", bgColor: "bg-violet-500/10", border: "border-violet-500/20", done: !!report.strategy },
  ];

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-indigo-400" />
        <span className="text-sm font-semibold text-zinc-200">{"AI 对抗流程"}</span>
      </div>
      
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center justify-center gap-2 rounded-lg p-2.5 ${
                step.done ? `${step.bgColor} border ${step.border}` : "bg-white/[0.02] border border-white/[0.05]"
              } flex-1 min-w-0 transition-colors`}
            >
              <span className={step.done ? step.color : "text-zinc-500"}>{step.icon}</span>
              <span
                className={`text-sm font-medium truncate ${
                  step.done ? step.color : "text-zinc-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                size={14}
                className={step.done ? "text-zinc-500 shrink-0" : "text-zinc-700 shrink-0"}
              />
            )}
          </div>
        ))}
      </div>

      {adversarialSection?.data && (
        <div className="mt-4 rounded-lg border-l-2 border-amber-500/50 bg-amber-500/[0.05] px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Swords size={13} className="text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              {"庄家 AI 视角"}
            </span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {String(adversarialSection.data.dealer_intent || adversarialSection.data.summary || "庄家AI已完成反向推演")}
          </p>
        </div>
      )}
    </div>
  );
}
