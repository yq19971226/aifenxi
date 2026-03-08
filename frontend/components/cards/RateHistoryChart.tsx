"use client";

import { useMemo } from "react";
import type { RateHistoryPoint } from "@/lib/api/datasources";

interface RateHistoryChartProps {
  data: RateHistoryPoint[];
  height?: number;
}

export function RateHistoryChart({ data, height = 120 }: RateHistoryChartProps) {
  const width = 480;
  const padX = 40;
  const padY = 20;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const { points, maxRate, xLabels } = useMemo(() => {
    if (!data || data.length === 0) {
      return { points: "", maxRate: 0, xLabels: [] };
    }

    const sorted = [...data].sort((a, b) => a.minute_ts - b.minute_ts);
    const rates = sorted.map((d) => d.rate);
    const max = Math.max(...rates, 0.1);

    const pts = sorted
      .map((d, i) => {
        const x = padX + (i / Math.max(sorted.length - 1, 1)) * chartW;
        const y = padY + chartH - (d.rate / max) * chartH;
        return `${x},${y}`;
      })
      .join(" ");

    const labels: { x: number; text: string }[] = [];
    const step = Math.max(1, Math.floor(sorted.length / 6));
    for (let i = 0; i < sorted.length; i += step) {
      const x = padX + (i / Math.max(sorted.length - 1, 1)) * chartW;
      const d = new Date(sorted[i].minute_ts * 1000);
      const text = `${d.getHours().toString().padStart(2, "0")}:${d
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
      labels.push({ x, text });
    }

    return { points: pts, maxRate: max, xLabels: labels };
  }, [data, chartW, chartH]);

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-zinc-800/30 text-xs text-zinc-500"
        style={{ height }}
      >
        暂无速率数据
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: height }}
    >
      {/* 网格线 */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padY + chartH - frac * chartH;
        return (
          <g key={frac}>
            <line
              x1={padX}
              y1={y}
              x2={padX + chartW}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="4,4"
            />
            <text
              x={padX - 4}
              y={y + 3}
              textAnchor="end"
              className="fill-gray-500"
              fontSize={9}
            >
              {(maxRate * frac).toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* X 轴标签 */}
      {xLabels.map((lbl, i) => (
        <text
          key={i}
          x={lbl.x}
          y={height - 2}
          textAnchor="middle"
          className="fill-gray-500"
          fontSize={9}
        >
          {lbl.text}
        </text>
      ))}

      {/* 面积填充 */}
      <polygon
        points={`${padX},${padY + chartH} ${points} ${padX + chartW},${padY + chartH}`}
        fill="url(#rateGrad)"
        opacity={0.3}
      />

      {/* 折线 */}
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* 渐变定义 */}
      <defs>
        <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  );
}
