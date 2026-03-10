"use client";

import { type HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width — accepts any CSS value. Defaults to "100%" */
  w?: string;
  /** Height — accepts any CSS value. Defaults to "1rem" */
  h?: string;
  /** Border radius — "full" for pill, default "lg" */
  rounded?: "full" | "xl" | "lg" | "md" | "sm";
}

export function Skeleton({
  w = "100%",
  h = "1rem",
  rounded = "lg",
  className = "",
  style,
  ...rest
}: SkeletonProps) {
  const radiusMap = {
    full: "9999px",
    xl: "0.75rem",
    lg: "0.5rem",
    md: "0.375rem",
    sm: "0.25rem",
  };

  return (
    <div
      className={`animate-pulse bg-white/[0.06] ${className}`}
      style={{
        width: w,
        height: h,
        borderRadius: radiusMap[rounded],
        ...style,
      }}
      {...rest}
    />
  );
}

/* ── Preset skeleton groups ─────────────────────────────── */

/** 统计卡片骨架 — 用于 admin dashboard 等 */
export function SkeletonStatCard() {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-elevated/80 p-5">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton w="4rem" h="0.75rem" />
        <Skeleton w="2rem" h="2rem" rounded="lg" />
      </div>
      <Skeleton w="5rem" h="1.75rem" />
      <Skeleton w="6rem" h="0.625rem" className="mt-2" />
    </div>
  );
}

/** 通用卡片骨架 — 用于 card 风格区域 */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-md">
      <Skeleton w="40%" h="0.75rem" className="mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          w={i === lines - 1 ? "60%" : "100%"}
          h="0.625rem"
          className="mt-2"
        />
      ))}
    </div>
  );
}

/** 表格骨架 — 用于数据表格 */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-md">
      {/* Header */}
      <div className="mb-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} w={`${100 / cols}%`} h="0.625rem" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-t border-white/[0.04] py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} w={`${100 / cols}%`} h="0.625rem" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 图表区域骨架 */
export function SkeletonChart({ height = "16rem" }: { height?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-md">
      <Skeleton w="30%" h="0.75rem" className="mb-4" />
      <Skeleton w="100%" h={height} rounded="lg" />
    </div>
  );
}
