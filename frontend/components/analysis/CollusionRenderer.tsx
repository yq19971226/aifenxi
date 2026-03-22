"use client";

import { motion } from "framer-motion";
import { 
  Users, 
  Link2, 
  Fingerprint, 
  Activity, 
  Share2,
  Database,
  Lock,
  Search
} from "lucide-react";
import { useTranslations } from "next-intl";
import { localizeText } from "./helpers";
import { cn } from "@/lib/utils";

interface CollusionPattern {
  pattern_type: string;
  severity: "low" | "medium" | "high" | "critical";
  evidence: string[];
  involved_entities: number;
  estimated_volume: string;
  timeframe: string;
}

interface CollusionData {
  collusion_detected: boolean;
  risk_level: "none" | "low" | "medium" | "high" | "critical";
  patterns: CollusionPattern[];
  wash_trading_indicators?: Record<string, boolean>;
  whale_coordination?: {
    synchronized_movements: boolean;
    direction: string;
    entity_count: number;
  };
}

export function CollusionRenderer({ data }: { data: CollusionData }) {
  const t = useTranslations("consensus");

  const riskColor = {
    none: "text-zinc-500 border-zinc-500/20 bg-zinc-500/5",
    low: "text-blue-400 border-blue-500/20 bg-blue-500/5",
    medium: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    high: "text-orange-500 border-orange-500/20 bg-orange-500/5",
    critical: "text-red-500 border-red-500/30 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
  }[data.risk_level] || "text-zinc-500";

  return (
    <div className="space-y-6">
      {/* 1. Network Risk Summary */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "relative overflow-hidden rounded-xl border-2 p-5 transition-all duration-500",
          riskColor
        )}
      >
        <div className="absolute right-4 top-4 opacity-10">
          <Users size={60} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
             <Fingerprint size={16} className="animate-pulse" />
             <h4 className="text-[10px] font-black uppercase tracking-[0.3em]">
               {t("renderers.collusion.title")} / {t("renderers.collusion.titleSubtitle")}
             </h4>
          </div>
          
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-black tracking-tight uppercase">
              {data.collusion_detected ? t("renderers.collusion.detected") : t("renderers.collusion.notDetected")}
            </span>
            <span className="text-xs opacity-60 font-mono">{t("renderers.collusion.riskLevel")}: {data.risk_level.toUpperCase()}</span>
          </div>

          {!data.collusion_detected && (
             <p className="mt-2 text-xs opacity-70 leading-relaxed">
               {t("renderers.collusion.desc")}
             </p>
          )}
        </div>
        
        {/* Connection Pulse Decoration */}
        {data.collusion_detected && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-20 animate-pulse" />
        )}
      </motion.div>

      {/* 2. Detected Patterns (The "Entities" involved) */}
      {data.patterns && data.patterns.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <Link2 size={12} /> {t("renderers.collusion.patterns")} / {t("renderers.collusion.patternsSubtitle")}
          </h4>
          <div className="grid grid-cols-1 gap-3">
            {data.patterns.map((pattern, idx) => (
              <div
                key={idx}
                className="group relative rounded-lg border border-white/[0.05] bg-zinc-900/50 p-4 hover:border-white/[0.1] transition-all"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded bg-white/[0.03] border border-white/[0.05]",
                      pattern.severity === 'critical' || pattern.severity === 'high' ? 'text-orange-400' : 'text-zinc-400'
                    )}>
                       <Activity size={16} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-zinc-200 block leading-none mb-1">
                        {localizeText(pattern.pattern_type)}
                      </span>
                      <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-tighter">
                        {t("renderers.collusion.entities").toUpperCase()}: {pattern.involved_entities} • {t("renderers.collusion.vol").toUpperCase()}: {pattern.estimated_volume}
                      </span>
                    </div>
                  </div>
                  <span className={cn(
                    "text-[8px] font-black px-1.5 py-0.5 rounded border uppercase",
                    pattern.severity === 'critical' ? 'border-red-500/40 text-red-400' : 
                    pattern.severity === 'high' ? 'border-orange-500/40 text-orange-400' :
                    'border-zinc-500/40 text-zinc-400'
                  )}>
                    {pattern.severity}
                  </span>
                </div>

                {/* Evidence Progress-like items */}
                <div className="space-y-1.5">
                  {pattern.evidence.map((ev, eIdx) => (
                    <div key={eIdx} className="flex items-start gap-2 text-[11px] text-zinc-400">
                       <Search size={10} className="mt-0.5 text-zinc-400 shrink-0" />
                       <span className="leading-tight">{localizeText(ev)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Sub-indicators Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Wash Trading Indicators */}
        {data.wash_trading_indicators && (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
            <h5 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Share2 size={10} /> {t("renderers.collusion.washTrading")} / {t("renderers.collusion.washTradingSubtitle")}
            </h5>
            <div className="space-y-2">
              {Object.entries(data.wash_trading_indicators).map(([key, val]) => (
                <div key={key} className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">{localizeText(key)}</span>
                  <div className={cn(
                    "h-2 w-8 rounded-full",
                    val ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-zinc-800"
                  )} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Whale Coordination */}
        {data.whale_coordination && (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
            <h5 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
               <Database size={10} /> {t("renderers.collusion.whaleSync")} / {t("renderers.collusion.whaleSyncSubtitle")}
            </h5>
            <div className="space-y-3">
               <div className="flex justify-between text-xs">
                 <span className="text-zinc-500">{t("renderers.collusion.syncMovement")}</span>
                 <span className={cn("font-bold font-mono", data.whale_coordination.synchronized_movements ? "text-emerald-400" : "text-zinc-400")}>
                    {data.whale_coordination.synchronized_movements ? t("renderers.collusion.statusActive").toUpperCase() : t("renderers.collusion.statusStable").toUpperCase()}
                 </span>
               </div>
               <div className="flex justify-between text-xs">
                 <span className="text-zinc-500">{t("renderers.collusion.netDirection")}</span>
                 <span className="text-zinc-300 font-bold uppercase">{localizeText(data.whale_coordination.direction)}</span>
               </div>
               <div className="pt-2 border-t border-white/[0.03] flex justify-between items-end">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono">{t("renderers.collusion.entities")}</span>
                  <span className="text-xl font-black font-mono leading-none">{data.whale_coordination.entity_count}</span>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Security Stamp */}
      <div className="flex items-center justify-center gap-2 pt-2 border-t border-white/[0.02]">
         <Lock size={10} className="text-zinc-500" />
         <span className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-medium">
           {t("renderers.collusion.footer")}
         </span>
      </div>
    </div>
  );
}
