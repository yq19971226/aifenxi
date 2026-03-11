"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Target, Zap, TrendingDown, TrendingUp, Skull } from "lucide-react";
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
  predicted_moves?: AdversarialMove[];
  danger_zones?: string[];
  safe_zones?: string[];
  defense_plan?: string[];
}

export function AdversarialRenderer({ data }: { data: AdversarialData }) {
  return (
    <div className="space-y-6 relative">
      {/* ── Combat Background Overlay ── */}
      <div className="absolute inset-x-0 -top-4 -bottom-4 bg-red-500/[0.01] pointer-events-none" />
      
      {/* 1. Dealer Intent (High Level) */}
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
          
          <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-red-500 mb-3 animate-glitch">
            <AlertTriangle size={14} className="animate-pulse" />
            庄家核心意图 / STRATEGIC INTENT
          </h4>
          
          <p className="relative z-10 text-lg font-black text-white leading-tight tracking-tight">
            <span className="text-red-500 mr-2 opacity-50">#</span>
            {localizeText(data.dealer_intent)}
          </p>
          
          {/* Corner Decals */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500/40" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-red-500/40" />
        </motion.div>
      )}

      {/* 2. Predicted Moves Timeline/List */}
      {data.predicted_moves && data.predicted_moves.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">
            下阶段推演 / Tactical Forecast
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {data.predicted_moves.map((move, idx) => (
              <div
                key={idx}
                className="group relative flex items-center gap-4 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-400">
                  <span className="text-[10px] font-black leading-none">{(move.probability * 100).toFixed(0)}%</span>
                  <span className="mt-0.5 text-[8px] opacity-60">PROB</span>
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
                      <Zap size={10} className="text-zinc-600" /> {move.timeframe}
                    </span>
                    {move.target_price && (
                      <span className="flex items-center gap-1 font-mono">
                        <Target size={10} className="text-zinc-600" /> {move.target_price}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Combat Zones */}
      <div className="grid grid-cols-2 gap-4">
        {data.danger_zones && data.danger_zones.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[10px] font-bold text-red-500/80 uppercase tracking-widest">
              <TrendingDown size={12} /> 风险区 / Danger
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
              <TrendingUp size={12} /> 安全区 / Safety
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
      </div>

      {/* 4. Defense Countermeasures */}
      {data.defense_plan && data.defense_plan.length > 0 && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
          <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3">
            <ShieldCheck size={14} />
            反制防御计划 / Counter-Defense Plan
          </h4>
          <ul className="space-y-2">
            {data.defense_plan.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <div className="mt-1 h-3 w-3 rounded flex items-center justify-center bg-indigo-500/20 text-indigo-400 shrink-0">
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
