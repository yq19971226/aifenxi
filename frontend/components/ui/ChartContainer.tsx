"use client";

import { type ReactNode } from "react";
import { SkeletonChart } from "./Skeleton";

/* ── Types ── */

export interface ChartContainerProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  loading?: boolean;
  error?: string | null;
  height?: string;
  children: ReactNode;
  className?: string;
}

/* ── Component ── */

export function ChartContainer({
  title,
  subtitle,
  action,
  loading = false,
  error = null,
  height = "16rem",
  children,
  className = "",
}: ChartContainerProps) {
  if (loading) {
    return <SkeletonChart height={height} />;
  }

  return (
    <div className={`card ${className}`}>
      {/* Header */}
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            {title && (
              <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}

      {/* Body */}
      <div className="px-5 py-4" style={{ minHeight: height }}>
        {error ? (
          <div className="flex items-center justify-center h-full" style={{ minHeight: height }}>
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* ── Usage examples (comments only) ──
 *
 * <ChartContainer title="API 调用" subtitle="过去 24 小时" loading={isLoading}>
 *   <MyBarChart data={data} />
 * </ChartContainer>
 *
 * <ChartContainer title="K线图" error={error} height="24rem">
 *   <CandlestickChart />
 * </ChartContainer>
 *
 * <ChartContainer
 *   title="收益曲线"
 *   action={<SelectField options={periods} onChange={setPeriod} />}
 * >
 *   <PnlCurve data={pnlData} />
 * </ChartContainer>
 */
