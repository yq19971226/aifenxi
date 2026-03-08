"use client";

import { type ReactNode } from "react";

/* ── Types ── */

export type BadgeVariant = "bull" | "bear" | "warn" | "accent" | "neutral";

export interface BadgeProps {
  variant?: BadgeVariant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/* ── Variant → CSS class ── */

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  bull: "badge badge-bull",
  bear: "badge badge-bear",
  warn: "badge badge-warn",
  accent: "badge badge-accent",
  neutral: "badge badge-neutral",
};

/* ── Component ── */

export function Badge({
  variant = "neutral",
  icon,
  children,
  className = "",
}: BadgeProps) {
  return (
    <span className={`${VARIANT_CLASS[variant]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/* ── Status dot badge (inline status indicator) ── */

export type StatusDotColor = "green" | "yellow" | "red" | "gray";

const DOT_COLOR: Record<StatusDotColor, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  gray: "bg-zinc-500",
};

const DOT_TEXT: Record<StatusDotColor, string> = {
  green: "text-emerald-400",
  yellow: "text-amber-400",
  red: "text-red-400",
  gray: "text-zinc-500",
};

export interface StatusDotProps {
  color: StatusDotColor;
  label: string;
  className?: string;
}

export function StatusDot({ color, label, className = "" }: StatusDotProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${DOT_TEXT[color]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLOR[color]}`} />
      {label}
    </span>
  );
}

/* ── Usage examples (comments only) ──
 *
 * <Badge variant="bull">看涨</Badge>
 * <Badge variant="bear" icon={<TrendingDown size={11} />}>看跌</Badge>
 * <Badge variant="warn">警告</Badge>
 * <Badge variant="accent">进行中</Badge>
 * <Badge variant="neutral">默认</Badge>
 * <StatusDot color="green" label="正常" />
 * <StatusDot color="red" label="异常" />
 */
