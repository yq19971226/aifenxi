"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { TrendDataPoint } from "@/lib/api/performance";
import { EmptyChart } from "@/components/ui/EmptyState";

// ── Props ────────────────────────────────────────────────────

export interface WinRateTrendProps {
  data: TrendDataPoint[];
}

// ── Constants ────────────────────────────────────────────────

const LINE_COLOR = "var(--color-accent)";
const AREA_TOP_COLOR = "rgba(42,109,255,0.28)";
const AREA_BOTTOM_COLOR = "rgba(42,109,255,0.02)";
const CHART_HEIGHT = 200;

// ── Helpers ──────────────────────────────────────────────────

function toChartTime(date: string): Time {
  return (new Date(date).getTime() / 1000) as Time;
}

function toLineData(points: TrendDataPoint[]): LineData[] {
  return points.map((p) => ({
    time: toChartTime(p.date),
    value: p.win_rate * 100, // convert 0-1 → 0-100%
  }));
}

// ── Component ────────────────────────────────────────────────

export function WinRateTrend({ data }: WinRateTrendProps) {
  const t = useTranslations('performance.winRateTrend');
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

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
      localization: {
        locale: locale,
        timeFormatter: (timestamp: number) => {
          return new Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(timestamp * 1000);
        },
        priceFormatter: (price: number) => {
          return new Intl.NumberFormat(locale, {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(price / 100);
        },
      },
    });

    const series = chart.addAreaSeries({
      lineColor: LINE_COLOR,
      lineWidth: 2,
      topColor: AREA_TOP_COLOR,
      bottomColor: AREA_BOTTOM_COLOR,
      priceLineVisible: false,
      lastValueVisible: true,
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
  }, [locale]);

  // ── Update data ──
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    const lineData = toLineData(data);
    seriesRef.current.setData(lineData);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">
        {t('title')}
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
