"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

/* ── Types ── */

export type CardVariant = "default" | "surface" | "interactive";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
  glow?: boolean; // Add glow effect option
}

/* ── Variant & Padding Classes ── */

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: "card",
  surface: "card-surface",
  interactive: "card-interactive",
};

const PADDING_CLASS: Record<string, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

/* ── Component ── */

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "default", padding = "md", glow = false, children, className = "", ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          ${VARIANT_CLASS[variant]}
          ${PADDING_CLASS[padding]}
          ${glow ? 'relative before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-[#00FFA3]/[0.05] before:blur-2xl' : ''}
          ${className}
        `}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

/* ── Card Header ── */

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action, className = "", ...rest }: CardHeaderProps) {
  return (
    <div
      className={`flex items-start justify-between px-6 py-5 border-b border-white/[0.04] ${className}`}
      {...rest}
    >
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-medium tracking-tight text-zinc-100 flex items-center gap-2">
          {title}
        </h3>
        {subtitle && (
          <div className="text-sm text-zinc-500 font-medium">
            {subtitle}
          </div>
        )}
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </div>
  );
}

/* ── Usage examples (comments only) ──
 *
 * <Card>基础卡片内容</Card>
 * <Card variant="surface" padding="lg">半透明毛玻璃卡?/Card>
 * <Card variant="interactive" padding="sm">可点击卡?/Card>
 * <Card padding="none">
 *   <CardHeader title="系统健康" subtitle="实时监控" action={<Button size="sm">刷新</Button>} />
 *   <div className="p-5">卡片内容</div>
 * </Card>
 */
