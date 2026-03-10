/**
 * 国际化格式化工具函数
 * 提供数字和日期的本地化格式化功能
 */

'use client';

import { useLocale } from 'next-intl';

/**
 * 数字格式化 Hook
 * 根据当前语言区域格式化数字、价格、百分比和成交量
 */
export function useNumberFormatter() {
  const locale = useLocale();

  return {
    /**
     * 格式化价格（带货币符号）
     * @param value - 数值
     * @param currency - 货币代码（默认 USD）
     * @returns 格式化后的价格字符串
     * @example formatPrice(1234.56) => "$1,234.56" (en) / "¥1,234.56" (zh-CN)
     */
    formatPrice: (value: number, currency: string = 'USD'): string => {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 8,
      }).format(value);
    },

    /**
     * 格式化百分比
     * @param value - 数值（0-100）
     * @param decimals - 小数位数（默认 2）
     * @returns 格式化后的百分比字符串
     * @example formatPercent(12.34) => "12.34%"
     */
    formatPercent: (value: number, decimals: number = 2): string => {
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value / 100);
    },

    /**
     * 格式化普通数字（带千位分隔符）
     * @param value - 数值
     * @param decimals - 小数位数（默认 2）
     * @returns 格式化后的数字字符串
     * @example formatNumber(1234567.89) => "1,234,567.89"
     */
    formatNumber: (value: number, decimals: number = 2): string => {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    },

    /**
     * 格式化成交量（简化显示，带 K/M/B 后缀）
     * @param value - 数值
     * @returns 格式化后的成交量字符串
     * @example formatVolume(1234567) => "1.23M"
     */
    formatVolume: (value: number): string => {
      if (value >= 1e9) {
        return `${(value / 1e9).toFixed(2)}B`;
      }
      if (value >= 1e6) {
        return `${(value / 1e6).toFixed(2)}M`;
      }
      if (value >= 1e3) {
        return `${(value / 1e3).toFixed(2)}K`;
      }
      return value.toFixed(2);
    },
  };
}

/**
 * 日期格式化 Hook
 * 根据当前语言区域格式化日期和时间
 */
export function useDateFormatter() {
  const locale = useLocale();

  return {
    /**
     * 格式化完整日期时间
     * @param date - 日期对象、时间戳或日期字符串
     * @returns 格式化后的日期时间字符串
     * @example formatDateTime(new Date()) => "Mar 9, 2025 2:30 PM" (en) / "2025年3月9日 14:30" (zh-CN)
     */
    formatDateTime: (date: Date | string | number): string => {
      const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    },

    /**
     * 格式化日期
     * @param date - 日期对象、时间戳或日期字符串
     * @returns 格式化后的日期字符串
     * @example formatDate(new Date()) => "Mar 9, 2025" (en) / "2025年3月9日" (zh-CN)
     */
    formatDate: (date: Date | string | number): string => {
      const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(d);
    },

    /**
     * 格式化时间
     * @param date - 日期对象、时间戳或日期字符串
     * @returns 格式化后的时间字符串
     * @example formatTime(new Date()) => "2:30:45 PM" (en) / "14:30:45" (zh-CN)
     */
    formatTime: (date: Date | string | number): string => {
      const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(d);
    },

    /**
     * 格式化相对时间（如 "2小时前"）
     * @param date - 日期对象、时间戳或日期字符串
     * @returns 格式化后的相对时间字符串
     * @example formatRelative(Date.now() - 7200000) => "2 hours ago" (en) / "2小时前" (zh-CN)
     */
    formatRelative: (date: Date | string | number): string => {
      const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

      if (diffDay > 0) return rtf.format(-diffDay, 'day');
      if (diffHour > 0) return rtf.format(-diffHour, 'hour');
      if (diffMin > 0) return rtf.format(-diffMin, 'minute');
      return rtf.format(-diffSec, 'second');
    },
  };
}
