export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function directionLabel(d: string): string {
  if (d === "long") return "多头";
  if (d === "short") return "空头";
  return "中性";
}

export function statusLabel(s: string): string {
  if (s === "hit_stop_loss") return "止损";
  if (s === "hit_target") return "止盈";
  if (s === "timeout") return "超时";
  return "进行中";
}

export function statusColor(s: string): string {
  if (s === "hit_target") return "text-emerald-400";
  if (s === "hit_stop_loss") return "text-red-400";
  if (s === "timeout") return "text-amber-400";
  return "text-zinc-400";
}

export function pnlColor(pnl: number | null): string {
  if (pnl === null) return "text-zinc-400";
  return pnl >= 0 ? "text-emerald-400" : "text-red-400";
}
