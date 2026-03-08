"use client";

import { useState, useMemo } from "react";
import { BarChart3, TrendingUp, AlertTriangle } from "lucide-react";

/* ── Types ── */

interface HourlyData {
  hour: string;
  calls: number;
  errors: number;
}

export interface ApiCallChartProps {
  data?: HourlyData[];
  className?: string;
}

/* ── Mock data generator ── */

function generateMockData(): HourlyData[] {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const h = new Date(now.getTime() - (23 - i) * 3600000);
    const hour = `${h.getHours().toString().padStart(2, "0")}:00`;
    const calls = Math.floor(Math.random() * 500 + 100);
    const errors = Math.floor(Math.random() * calls * 0.05);
    return { hour, calls, errors };
  });
}

/* ── Component ── */

export function ApiCallChart({ data, className = "" }: ApiCallChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartData = data ?? generateMockData();

  const maxCalls = useMemo(
    () => Math.max(...chartData.map((d) => d.calls), 1),
    [chartData]
  );

  const totalCalls = useMemo(
    () => chartData.reduce((s, d) => s + d.calls, 0),
    [chartData]
  );

  const totalErrors = useMemo(
    () => chartData.reduce((s, d) => s + d.errors, 0),
    [chartData]
  );

  const errorRate = totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(2) : "0";

  return (
    <div className={`card ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-zinc-500" />
          <h3 className="text-sm font-medium text-zinc-200">API 调用量</h3>
          <span className="text-sm text-zinc-500">过去 24 小时</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={12} className="text-emerald-400" />
            <span className="text-sm text-zinc-400">
              总计 <span className="font-mono text-zinc-200">{totalCalls.toLocaleString()}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className={Number(errorRate) > 1 ? "text-red-400" : "text-zinc-500"} />
            <span className="text-sm text-zinc-400">
              错误率 <span className={`font-mono ${Number(errorRate) > 1 ? "text-red-400" : "text-zinc-200"}`}>{errorRate}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-5 py-4">
        <div className="flex items-end gap-[3px]" style={{ height: "10rem" }}>
          {chartData.map((d, i) => {
            const h = (d.calls / maxCalls) * 100;
            const isHovered = hoveredIdx === i;
            const hasErrors = d.errors > 0;
            return (
              <div
                key={d.hour}
                className="relative flex-1 group"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Bar */}
                <div
                  className={`w-full rounded-t transition-colors ${
                    hasErrors
                      ? "bg-red-500/40 hover:bg-red-500/60"
                      : "bg-indigo-500/30 hover:bg-indigo-500/50"
                  }`}
                  style={{ height: `${h}%`, minHeight: "2px" }}
                />

                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 rounded-lg border border-white/[0.08] bg-[#1a1a1f] px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                    <p className="text-zinc-400">{d.hour}</p>
                    <p className="text-zinc-200 font-mono">{d.calls} 次调用</p>
                    {d.errors > 0 && (
                      <p className="text-red-400 font-mono">{d.errors} 次错误</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="mt-2 flex justify-between">
          <span className="text-xs text-zinc-500">{chartData[0]?.hour}</span>
          <span className="text-xs text-zinc-500">{chartData[Math.floor(chartData.length / 2)]?.hour}</span>
          <span className="text-xs text-zinc-500">{chartData[chartData.length - 1]?.hour}</span>
        </div>
      </div>
    </div>
  );
}
