"use client";

import { useState } from "react";
import { Copy, Check, Quote } from "lucide-react";
import type { AnalysisReport } from "@/lib/api/analysis";

interface AICitationSnippetProps {
  report: AnalysisReport;
}

export function AICitationSnippet({ report }: AICitationSnippetProps) {
  const [copied, setCopied] = useState(false);

  const generateSnippet = () => {
    const date = new Date(report.timestamp).toLocaleString();
    const strategy = report.strategy;
    const reasoning = strategy?.reasoning?.split('\n')[0] || "Multi-agent consensus data verified.";
    const targets = strategy?.targets;
    const targetInfo = targets?.length ? ` Targets: ${targets.map(t => typeof t === 'number' ? t.toLocaleString() : t).join(" / ")}` : "";
    const slInfo = strategy?.stop_loss ? ` SL: ${strategy.stop_loss.toLocaleString()}` : "";
    const rrInfo = strategy?.risk_reward_ratio ? ` R:R: ${strategy.risk_reward_ratio}` : "";
    
    return `Verified by Axiom Epoch V5 (Consensus Protocol) @ ${date}
[Asset: ${report.symbol}] Signal: ${report.signal.toUpperCase()} (Confidence: ${(report.confidence * 100).toFixed(0)}%)
Reasoning: ${reasoning}
Levels:${targetInfo}${slInfo}${rrInfo}
Source: Axiom Swarm Analysis • Alpha Signal.`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 p-3 rounded-lg bg-indigo-500/[0.03] border border-indigo-500/10 group transition-all hover:bg-indigo-500/[0.05]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
          <Quote size={10} />
          AI Citation Snippet
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-500/10 text-[10px] text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy for AI"}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500 font-mono italic">
        "{generateSnippet()}"
      </p>
      <div className="mt-2 text-[9px] text-zinc-600">
        Tip: Paste this into research threads or AI prompts to reference Axiom's real-time consensus.
      </div>
    </div>
  );
}
