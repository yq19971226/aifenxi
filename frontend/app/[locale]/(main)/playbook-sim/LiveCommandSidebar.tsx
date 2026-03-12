"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Terminal, Database, Shield, Swords, Gavel, Cpu, Loader2, Play } from "lucide-react";
import type { SimResult } from "@/lib/api/playbook-sim";
import type { StepStatuses, StepStatus } from "./playbook-constants";
import { localizeText } from "@/components/analysis/helpers";

const TypewriterText = ({ text, speed = 15, onComplete }: { text: string; speed?: number; onComplete?: () => void }) => {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed((prev) => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(timer);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  return <span>{displayed}</span>;
};

interface BlockProps {
  title: string;
  icon: React.ReactNode;
  status: StepStatus;
  children: React.ReactNode;
}

function TerminalBlock({ title, icon, status, children }: BlockProps) {
  const t = useTranslations("playbook-sim.liveCommand");
  const isRunning = status === "running";
  const isDone = status === "done";
  const isFailed = status === "failed";

  if (status === "idle") return null;

  return (
    <div className="flex flex-col gap-2 relative pl-6 pb-6 border-l border-white/[0.08] last:border-transparent last:pb-0 font-mono">
      <div className="absolute -left-[13px] top-0 flex items-center justify-center w-6 h-6 rounded-full bg-[#09090b] border border-white/[0.08]">
        {isRunning ? (
          <Loader2 size={12} className="animate-spin text-emerald-400" />
        ) : isDone ? (
           <span className="text-emerald-500">{icon}</span>
        ) : isFailed ? (
           <span className="text-red-500">{icon}</span>
        ) : null}
      </div>
      
      <div className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase flex items-center gap-2">
        {title}
        {isRunning && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">{t("intercepting")}</span>}
        {isDone && <span className="text-[9px] bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">✓</span>}
      </div>

      <div className="text-[12px] leading-relaxed text-zinc-300 bg-black/20 rounded-md p-3 border border-white/[0.04]">
        {children}
      </div>
    </div>
  );
}

export default function LiveCommandSidebar({
  sim,
  stepStatus,
  streaming,
}: {
  sim: SimResult | null;
  stepStatus: StepStatuses;
  streaming: boolean;
}) {
  const t = useTranslations("playbook-sim.liveCommand");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [stepStatus, sim]);

  return (
    <div className="card overflow-hidden h-[calc(100vh-140px)] flex flex-col bg-[#09090b]/80 backdrop-blur-md shadow-2xl border-white/[0.08]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-emerald-400" />
          <span className="text-sm font-semibold text-white tracking-wide">{t("header")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            {streaming && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${streaming ? 'bg-emerald-500' : 'bg-zinc-600'}`}></span>
          </span>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            {streaming ? t("intercepting") : t("standby")}
          </span>
        </div>
      </div>

      {/* Body / Logs */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-white/10" ref={scrollRef}>
        <div className="space-y-2 pb-10">
          
          {(stepStatus.data !== "idle") && (
            <TerminalBlock title={t("dataPipeline")} icon={<Database size={12}/>} status={stepStatus.data}>
              {stepStatus.data === "running" ? (
                <TypewriterText text={t("dataRunning")} />
              ) : (
                <div className="space-y-1">
                  <div className="text-emerald-400">{t("dataDone")}</div>
                  <div className="text-zinc-500 text-[10px]">{t("dataLatency")}</div>
                </div>
              )}
            </TerminalBlock>
          )}

          {(stepStatus.L1 !== "idle") && (
            <TerminalBlock title={t("topoMatcher")} icon={<Cpu size={12}/>} status={stepStatus.L1}>
              {stepStatus.L1 === "running" ? (
                 <TypewriterText text={t("topoRunning")} />
              ) : (
                <div className="space-y-1.5">
                  <div className="text-emerald-400">{t("topoDone")}</div>
                  {sim?.top_matches?.[0] ? (
                    <div className="pl-2 border-l-2 border-emerald-500/30 text-emerald-200">
                      {t("topoPrimary")}: {localizeText(sim.top_matches[0].name)}
                      <br/>
                      <span className="text-emerald-400/60">{t("topoConfidence")}: {sim.top_matches[0].match_pct.toFixed(1)}%</span>
                    </div>
                  ) : (
                     <div className="text-amber-400">{t("topoNoMatch")}</div>
                  )}
                </div>
              )}
            </TerminalBlock>
          )}

          {(stepStatus.L2 !== "idle") && (
            <TerminalBlock title={t("dealerAgent")} icon={<Swords size={12}/>} status={stepStatus.L2}>
              {stepStatus.L2 === "running" ? (
                 <TypewriterText text={t("dealerRunning")} />
              ) : (
                <div className="space-y-1.5">
                  <div className="text-orange-400">{t("dealerDone")}</div>
                  {sim?.dealer_prediction?.dealer_plan && (
                     <div className="text-zinc-300">
                       <TypewriterText text={`${t("dealerIntent")}: ${localizeText(sim.dealer_prediction.dealer_plan)}`} />
                     </div>
                  )}
                </div>
              )}
            </TerminalBlock>
          )}

          {(stepStatus.L3 !== "idle") && (
            <TerminalBlock title={t("riskAgent")} icon={<Shield size={12}/>} status={stepStatus.L3}>
              {stepStatus.L3 === "running" ? (
                 <TypewriterText text={t("riskRunning")} />
              ) : (
                <div className="space-y-1.5">
                  <div className="text-blue-400">{t("riskDone")}</div>
                  {sim?.defense_strategy?.defense_summary && (
                     <div className="text-zinc-300">
                       <TypewriterText text={`${t("riskStrategy")}: ${localizeText(sim.defense_strategy.defense_summary)}`} />
                     </div>
                  )}
                </div>
              )}
            </TerminalBlock>
          )}

          {(stepStatus.L4 !== "idle") && (
            <TerminalBlock title={t("judgeAgent")} icon={<Gavel size={12}/>} status={stepStatus.L4}>
              {stepStatus.L4 === "running" ? (
                 <TypewriterText text={t("judgeRunning")} />
              ) : (
                <div className="space-y-1.5">
                  <div className="text-indigo-400">{t("judgeDone")}</div>
                  {sim?.judge_adoption && (
                     <div className="text-white bg-indigo-500/20 px-2 py-1.5 rounded border border-indigo-500/30">
                       <TypewriterText text={`${t("judgeVerdict")}: ${sim.judge_adoption.adoption.toUpperCase()} - ${sim.judge_adoption.next_move ? localizeText(sim.judge_adoption.next_move) : ''}`} />
                     </div>
                  )}
                </div>
              )}
            </TerminalBlock>
          )}

        </div>
      </div>

      {/* Radar Section Footer */}
      <div className="h-[76px] shrink-0 border-t border-white/[0.08] bg-black/40 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-11 h-11 border border-emerald-500/20 rounded-full flex items-center justify-center overflow-hidden bg-emerald-500/5">
            {/* Radar Grid */}
            <div className="absolute inset-0 rounded-full border border-emerald-500/10 scale-50" />
            <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,#10b98110_100%)]" />
            {/* Radar Sweep Pointer */}
            {streaming && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="absolute top-0 left-1/2 w-[1px] h-1/2 origin-bottom shadow-[0_0_15px_#34d399]"
                style={{ background: 'linear-gradient(to bottom, transparent, #34d399)' }}
              />
            )}
            {/* Center Dot */}
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_#34d399] relative z-10" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">{t("radarLabel")}</span>
            <span className={`text-[13px] font-semibold mt-0.5 ${streaming ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.4)]' : 'text-zinc-400'}`}>
              {streaming ? t("radarScanning") : t("radarIdle")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
