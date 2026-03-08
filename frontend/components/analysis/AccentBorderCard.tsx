"use client";

import type { LucideIcon } from "lucide-react";

export type AccentType = "action-long" | "action-short" | "risk-medium" | "risk-high";

interface AccentBorderCardProps {
  type: AccentType;
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}

const STYLE_MAP: Record<AccentType, { border: string; bg: string; titleColor: string; pulseIcon?: boolean }> = {
  "action-long": {
    border: "border-l-0 md:border-l-[3px] border-l-emerald-500 border-t-[3px] border-t-emerald-500 md:border-t-0",
    bg: "bg-emerald-500/[0.04]",
    titleColor: "text-emerald-400",
  },
  "action-short": {
    border: "border-l-0 md:border-l-[3px] border-l-red-500 border-t-[3px] border-t-red-500 md:border-t-0",
    bg: "bg-red-500/[0.04]",
    titleColor: "text-red-400",
  },
  "risk-medium": {
    border: "border-l-0 md:border-l-[3px] border-l-amber-500 border-t-[3px] border-t-amber-500 md:border-t-0",
    bg: "bg-amber-500/[0.04]",
    titleColor: "text-amber-400",
  },
  "risk-high": {
    border: "border-l-0 md:border-l-[3px] border-l-red-500 border-t-[3px] border-t-red-500 md:border-t-0",
    bg: "bg-red-500/[0.06]",
    titleColor: "text-red-400",
    pulseIcon: true,
  },
};

export function AccentBorderCard({ type, title, icon: Icon, children }: AccentBorderCardProps) {
  const s = STYLE_MAP[type];
  return (
    <div className={`rounded-lg ${s.border} ${s.bg} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className={`h-4 w-4 ${s.titleColor} ${s.pulseIcon ? "animate-pulse" : ""}`} />}
        <span className={`text-sm font-semibold ${s.titleColor}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}
