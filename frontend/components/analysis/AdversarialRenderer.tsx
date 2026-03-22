"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Target, Zap, TrendingDown, TrendingUp, Skull, ArrowUpCircle, Eye, Crosshair } from "lucide-react";
import { useTranslations } from "next-intl";
import { localizeText } from "./helpers";

interface AdversarialMove {
  action: string;
  probability: number;
  timeframe: string;
  target_price: string;
  trap_type: string;
}

interface AdversarialData {
  dealer_intent?: string;
  dealer_phase?: string;
  strategy_type?: string;  // follow/defend/contra/wait
  strategy_reason?: string;
  predicted_moves?: AdversarialMove[];
  danger_zones?: string[];
  safe_zones?: string[];
  opportunity_zones?: string[];
  action_plan?: string[];
  defense_plan?: string[];  // backward compat
}

const STRATEGY_CONFIG: Record<string, { icon: typeof ShieldCheck; color: string; bg: string; border: string; labelKey: string; planKey: string; planSubKey: string }> = {
  follow: { icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", labelKey: "strategyFollow", planKey: "followPlan", planSubKey: "followPlanSubtitle" },
  defend: { icon: ShieldCheck, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", labelKey: "strategyDefend", planKey: "counterPlan", planSubKey: "counterPlanSubtitle" },
  contra: { icon: Crosshair, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/30", labelKey: "strategyContra", planKey: "contraPlan", planSubKey: "contraPlanSubtitle" },
  wait:   { icon: Eye, color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/30", labelKey: "strategyWait", planKey: "waitPlan", planSubKey: "waitPlanSubtitle" },
};

export function AdversarialRenderer({ data }: { data: AdversarialData }) {
  const t = useTranslations("consensus");
  const strategyType = data.strategy_type || "defend";
  const config = STRATEGY_CONFIG[strategyType] || STRATEGY_CONFIG.wait;
  const StrategyIcon = config.icon;

  // Backward compat: prefer action_plan if non-empty, else fall back to defense_plan
  const actionPlan = (data.action_plan && data.action_plan.length > 0)
    ? data.action_plan
    : (data.defense_plan || []);

  // Phase label via i18n
  const phaseKey = data.dealer_phase || "";
  let phaseLabel = "";
  try {
    phaseLabel = phaseKey ? t(`renderers.adversarial.phases.${phaseKey}`) : "";
  } catch {
    phaseLabel = phaseKey;
  }

  return (
    <div className="space-y-6 relative">
      {/* ── Combat Background Overlay ── */}
      <div className="absolute inset-x-0 -top-4 -bottom-4 bg-red-500/[0.01] pointer-events-none" />
      
      {/* 1. Dealer Intent + Strategy Badge */}
      {data.dealer_intent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border-2 border-red-500/30 bg-black/40 p-5 shadow-[0_0_30px_rgba(239,68,68,0.1)]"
        >
          {/* Scanline Effect */}
          <div className="absolute inset-0 bg-scanline pointer-events-none opacity-[0.03]" />
          
          <div className="absolute -right-6 -top-6 opacity-[0.08] rotate-12">
            <Skull size={100} className="text-red-500" />
          </div>
          
          <div className="flex items-center justify-between mb-3">
            <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-500 animate-glitch">
              <AlertTriangle size={14} className="animate-pulse" />
              {t("renderers.adversarial.intent")} / {t("renderers.adversarial.intentSubtitle")}
            </h4>
            
            {/* Strategy Type Badge */}
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 border ${config.bg} ${config.border}`}>
              <StrategyIcon size={14} className={config.color} />
              <span className={`text-xs font-bold ${config.color}`}>
                {t(`renderers.adversarial.${config.labelKey}`)}
              </span>
              {phaseLabel && (
                <span className="text-[10px] text-zinc-500 ml-1">| {phaseLabel}</span>
              )}
            </div>
          </div>
          
          <p className="relative z-10 text-lg font-black text-white leading-tight tracking-tight">
            <span className="text-red-500 mr-2 opacity-50">#</span>
            {localizeText(data.dealer_intent)}
          </p>
          
          {/* Strategy Reason (if available) */}
          {data.strategy_reason && (
            <p className={`mt-2 text-xs ${config.color} opacity-80`}>
              → {localizeText(data.strategy_reason)}
            </p>
          )}
          
          {/* Corner Decals */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500/40" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-red-500/40" />
        </motion.div>
      )}

      {/* 2. Predicted Moves Timeline/List */}
      {data.predicted_moves && data.predicted_moves.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">
            {t("renderers.adversarial.forecast")} / {t("renderers.adversarial.forecastSubtitle")}
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {data.predicted_moves.map((move, idx) => (
              <div
                key={idx}
                className="group relative flex items-center gap-4 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-400">
                  <span className="text-[10px] font-black leading-none">{(move.probability * 100).toFixed(0)}%</span>
                  <span className="mt-0.5 text-[8px] opacity-60 uppercase">{t("renderers.adversarial.prob")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-200 truncate">
                      {localizeText(move.action)}
                    </span>
                    {move.trap_type && move.trap_type !== 'none' && (
                      <span className="rounded bg-zinc-800 px-1 py-0.5 text-[8px] font-bold uppercase text-amber-500 border border-amber-500/20">
                        {move.trap_type}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Zap size={10} className="text-zinc-400" /> {move.timeframe}
                    </span>
                    {move.target_price && (
                      <span className="flex items-center gap-1 font-mono">
                        <Target size={10} className="text-zinc-400" /> {move.target_price}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Zones: Danger / Safe / Opportunity */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {data.danger_zones && data.danger_zones.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-red-500/80 uppercase tracking-widest">
              <TrendingDown size={12} /> {t("renderers.adversarial.dangerZone")} / {t("renderers.adversarial.dangerSubtitle")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {data.danger_zones.map((zone, i) => (
                <span key={i} className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1 text-[10px] font-mono font-bold text-red-400">
                  {zone}
                </span>
              ))}
            </div>
          </div>
        )}
        {data.safe_zones && data.safe_zones.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest">
              <TrendingUp size={12} /> {t("renderers.adversarial.safeZone")} / {t("renderers.adversarial.safeSubtitle")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {data.safe_zones.map((zone, i) => (
                <span key={i} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] font-mono font-bold text-emerald-400">
                  {zone}
                </span>
              ))}
            </div>
          </div>
        )}
        {data.opportunity_zones && data.opportunity_zones.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-sky-500/80 uppercase tracking-widest">
              <ArrowUpCircle size={12} /> {t("renderers.adversarial.opportunityZone")} / {t("renderers.adversarial.opportunitySubtitle")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {data.opportunity_zones.map((zone, i) => (
                <span key={i} className="rounded-md border border-sky-500/20 bg-sky-500/5 px-2 py-1 text-[10px] font-mono font-bold text-sky-400">
                  {zone}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Action Plan (dynamic title based on strategy_type) */}
      {actionPlan.length > 0 && (
        <div className={`rounded-xl border p-4 ${config.border} ${config.bg}`}>
          <h4 className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${config.color}`}>
            <StrategyIcon size={14} />
            {t(`renderers.adversarial.${config.planKey}`)} / {t(`renderers.adversarial.${config.planSubKey}`)}
          </h4>
          <ul className="space-y-2">
            {actionPlan.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <div className={`mt-1 h-3 w-3 rounded flex items-center justify-center shrink-0 ${config.bg} ${config.color}`}>
                  <span className="text-[8px] font-bold">{i+1}</span>
                </div>
                <span className="text-xs text-zinc-300 leading-relaxed">
                  {localizeText(item)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
