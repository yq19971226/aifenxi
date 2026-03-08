"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type BaselineData,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { TrendDataPoint } from "@/lib/api/performance";
import { EmptyChart } from "@/components/ui/EmptyState";

// ── Props ────────────────────────────────────────────────────

export interface PnlCurveProps {
  data: TrendDataPoint[];
}

// ── Constants ────────────────────────────────────────────────

const POSITIVE_COLOR = "var(--color-bull)";
const NEGATIVE_COLOR = "var(--color-bear)";
const CHART_HEIGHT = 200;

// ── Helpers ──────────────────────────────────────────────────

function toChartTime(date: string): Time {
  return (new Date(date).getTime() / 1000) as Time;
}

function toBaselineData(points: TrendDataPoint[]): BaselineData[] {
  return points.map((p) => ({
    time: toChartTime(p.date),
    value: p.cumulative_pnl,
  }));
}

// ── Component ────────────────────────────────────────────────

export function PnlCurve({ data }: PnlCurveProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);

  // ── Create chart once ──
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "var(--bg-primary)" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.1)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { borderColor: "rgba(255,255,255,0.1)" },
      width: containerRef.current.clientWidth,
      height: CHART_HEIGHT,
    });

    const series = chart.addBaselineSeries({
      baseValue: { type: "price", price: 0 },
      topLineColor: POSITIVE_COLOR,
      topFillColor1: "rgba(0,245,160,0.20)",
      topFillColor2: "rgba(0,245,160,0.02)",
      bottomLineColor: NEGATIVE_COLOR,
      bottomFillColor1: "rgba(255,59,111,0.02)",
      bottomFillColor2: "rgba(255,59,111,0.20)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(2)}%` },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // ── Update data ──
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    const baselineData = toBaselineData(data);
    seriesRef.current.setData(baselineData);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <motion.div
      className="rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-md p-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">
        累计盈亏曲线
      </p>

      {data.length === 0 ? (
        <div style={{ height: CHART_HEIGHT }} className="flex items-center justify-center">
          <EmptyChart />
        </div>
      ) : (
        <div ref={containerRef} style={{ height: CHART_HEIGHT }} className="w-full rounded-lg" />
      )}
    </motion.div>
  );
}
