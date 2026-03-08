"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

/* ── Types ── */

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

/* ── Size map ── */

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-md",
  md: "", // uses CSS default sizing
  lg: "px-6 py-3 text-base gap-2.5 rounded-[10px]",
};

const ICON_SIZE: Record<ButtonSize, number> = {
  sm: 13,
  md: 15,
  lg: 17,
};

/* ── Variant → CSS class ── */

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

/* ── Component ── */

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon: IconLeft,
      iconRight: IconRight,
      loading = false,
      disabled,
      children,
      className = "",
      ...rest
    },
    ref
  ) => {
    const iconSz = ICON_SIZE[size];
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`${VARIANT_CLASS[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...rest}
      >
        {loading ? (
          <Loader2 size={iconSz} className="animate-spin" />
        ) : IconLeft ? (
          <IconLeft size={iconSz} />
        ) : null}
        {children}
        {IconRight && !loading && <IconRight size={iconSz} />}
      </button>
    );
  }
);

Button.displayName = "Button";

/* ── Usage examples (comments only) ──
 *
 * <Button>确认</Button>
 * <Button variant="secondary" icon={Settings}>设置</Button>
 * <Button variant="danger" size="sm">删除</Button>
 * <Button variant="ghost" loading>加载中</Button>
 * <Button size="lg" icon={ArrowRight} iconRight={ChevronRight}>下一步</Button>
 */
