/**
 * LocalizedChart 组件
 * 封装 TradingView Lightweight Charts，支持多语言国际化
 * 
 * 功能：
 * - 根据当前语言自动格式化时间轴和价格轴
 * - 使用 Intl API 进行本地化格式化
 * - 支持响应式布局
 * - 语言切换时自动更新图表格式
 */

'use client';

import { useLocale } from 'next-intl';
import { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  ColorType,
  LineStyle,
} from 'lightweight-charts';

/**
 * 图表数据点接口
 */
export interface ChartDataPoint {
  /** Unix 时间戳（秒） */
  time: number;
  /** 价格值 */
  value: number;
}

/**
 * LocalizedChart 组件属性
 */
export interface LocalizedChartProps {
  /** 图表数据 */
  data: ChartDataPoint[];
  /** 图表标题 */
  title?: string;
  /** 图表高度（像素，默认 400） */
  height?: number;
  /** 图表宽度（像素，默认自适应容器宽度） */
  width?: number;
  /** 线条颜色（默认 #6366f1） */
  lineColor?: string;
  /** 线条宽度（默认 2） */
  lineWidth?: number;
  /** 是否显示网格（默认 true） */
  showGrid?: boolean;
}

/**
 * LocalizedChart 组件
 * 
 * @example
 * ```tsx
 * <LocalizedChart
 *   data={[
 *     { time: 1709971200, value: 50000 },
 *     { time: 1709974800, value: 51000 },
 *   ]}
 *   title="BTC/USDT"
 *   height={400}
 * />
 * ```
 */
export function LocalizedChart({
  data,
  title,
  height = 400,
  width,
  lineColor = '#6366f1',
  lineWidth = 2,
  showGrid = true,
}: LocalizedChartProps) {
  const locale = useLocale();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const normalizedLineWidth = Math.max(1, Math.min(4, Math.round(lineWidth))) as 1 | 2 | 3 | 4;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 创建图表实例
    const chart = createChart(chartContainerRef.current, {
      width: width || chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#131316' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: {
          color: showGrid ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
        },
        horzLines: {
          color: showGrid ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
        },
      },
      crosshair: {
        mode: 1, // Normal crosshair mode
        vertLine: {
          color: 'rgba(99, 102, 241, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: 'rgba(99, 102, 241, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      localization: {
        locale: locale,
        /**
         * 时间格式化器
         * 根据当前语言格式化时间戳
         */
        timeFormatter: (timestamp: number) => {
          return new Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(timestamp * 1000);
        },
        /**
         * 价格格式化器
         * 根据当前语言格式化价格数值
         */
        priceFormatter: (price: number) => {
          return new Intl.NumberFormat(locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8,
          }).format(price);
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
    });

    // 添加线条系列
    const lineSeries = chart.addLineSeries({
      color: lineColor,
      lineWidth: normalizedLineWidth,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // 设置数据
    if (data && data.length > 0) {
      const formattedData: LineData[] = data.map((point) => ({
        time: point.time as any,
        value: point.value,
      }));
      lineSeries.setData(formattedData);
    }

    // 自动缩放以适应数据
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = lineSeries;

    // 响应式调整
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: width || chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [data, locale, height, width, lineColor, normalizedLineWidth, showGrid]);

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
      )}
      <div
        ref={chartContainerRef}
        className="rounded-lg overflow-hidden border border-white/5"
      />
    </div>
  );
}
