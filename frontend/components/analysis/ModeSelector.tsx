"use client";

import { Activity, Bot, Lock, Zap } from "lucide-react";

import type { AnalysisMode } from "@/lib/api/analysis";
import { MODE_CONTRACTS, deriveAgentCount, deriveTierLabel } from "@/lib/mode-contract";
import { useTranslations } from "next-intl";

// ── Types ────────────────────────────────────────────────────

export interface ModeOption {
  value: AnalysisMode;
  label: string;
  desc: string;
  agents: number;
  icon: typeof Zap;
  minLevel: number;
  tierLabel: string;
}

const _sc = MODE_CONTRACTS["scalping"];
const _ic = MODE_CONTRACTS["intraday"];
const _tc = MODE_CONTRACTS["trend"];

export const MODE_OPTIONS: ModeOption[] = [
  { value: "scalping", label: "scalping", desc: "scalping", agents: deriveAgentCount(_sc), icon: Zap, minLevel: _sc.min_level, tierLabel: deriveTierLabel(_sc) },
  { value: "intraday", label: "intraday", desc: "intraday", agents: deriveAgentCount(_ic), icon: Activity, minLevel: _ic.min_level, tierLabel: deriveTierLabel(_ic) },
  { value: "trend", label: "trend", desc: "trend", agents: deriveAgentCount(_tc), icon: Bot, minLevel: _tc.min_level, tierLabel: deriveTierLabel(_tc) },
];

// ── Component ────────────────────────────────────────────────

interface ModeSelectorProps {
  mode: AnalysisMode;
  userLevel: number;
  running: boolean;
  lockedModes?: Record<string, boolean>;
  onSelect: (mode: AnalysisMode) => void;
}

export function ModeSelector({ mode, userLevel, running, lockedModes, onSelect }: ModeSelectorProps) {
  const t = useTranslations("consensus.modes");
  return (
    <div className="grid grid-cols-3 gap-3">
      {MODE_OPTIONS.map((opt) => {
        // 优先使用后端返回的 locked 状态（考虑了免费体验 bonus）
        const locked = lockedModes?.[opt.value] ?? opt.minLevel > userLevel;
        const selected = mode === opt.value && !locked;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            disabled={running}
            className={`relative flex flex-col items-start rounded-lg px-4 py-3.5 text-left transition-all duration-200 border ${
              selected
                ? "bg-indigo-500/[0.08] border-indigo-500/30"
                : locked
                  ? "bg-white/[0.01] border-white/[0.04] cursor-not-allowed opacity-50"
                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1]"
            } disabled:opacity-50`}
            title={locked ? t("locked", { tier: opt.tierLabel }) : undefined}
          >
            <div className="flex items-center gap-2 w-full">
              <Icon size={14} className={selected ? "text-indigo-400" : locked ? "text-zinc-400" : "text-zinc-500"} />
              <span className={`text-sm font-semibold ${
                selected ? "text-indigo-400" : locked ? "text-zinc-400" : "text-zinc-200"
              }`}>
                {t(`${opt.value}.label`)}
              </span>
              {locked && <Lock size={11} className="ml-auto text-zinc-400" />}
              {selected && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />}
            </div>
            <p className={`text-sm mt-1.5 ${
              selected ? "text-zinc-400" : locked ? "text-zinc-400" : "text-zinc-500"
            }`}>
              {t(`${opt.value}.desc`, { count: opt.agents })}
            </p>
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono ${
              selected ? "bg-indigo-500/15 text-indigo-400" : "bg-white/[0.04] text-zinc-500"
            }`}>
              <Bot size={10} /> {opt.agents} AI
            </span>
          </button>
        );
      })}
    </div>
  );
}
