import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export const SIGNAL_MAP: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  bullish: { icon: TrendingUp, color: "text-emerald-400", label: "看涨" },
  bearish: { icon: TrendingDown, color: "text-red-400", label: "看跌" },
  neutral: { icon: Minus, color: "text-zinc-400", label: "中性" },
};

export type StepStatus = "idle" | "running" | "done" | "failed";

export interface StepStatuses {
  data: StepStatus;
  L1: StepStatus;
  L2: StepStatus;
  L3: StepStatus;
  L4: StepStatus;
}

export const INITIAL_STEP_STATUS: StepStatuses = {
  data: "idle", L1: "idle", L2: "idle", L3: "idle", L4: "idle",
};

export function getStatusBadge(status?: string, riskFlag?: boolean) {
  if (status === "active" && riskFlag) return { label: "需关注", color: "text-amber-400", bg: "bg-amber-500/10" };
  if (status === "active") return { label: "进行中", color: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (status === "completed") return { label: "已完成", color: "text-zinc-300", bg: "bg-white/[0.06]" };
  if (status === "failed") return { label: "已失效", color: "text-red-400", bg: "bg-red-500/10" };
  if (status === "expired") return { label: "已过期", color: "text-zinc-500", bg: "bg-white/[0.04]" };
  return { label: status || "未知", color: "text-zinc-500", bg: "bg-white/[0.04]" };
}
