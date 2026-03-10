"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatPrice, formatValue, fieldLabel, localizeText } from "./helpers";
import { HIDDEN_FIELDS } from "./constants";
import { DirectionBadge } from "./renderers";

const INITIAL_ROWS = 5;

// ── FVG item type ────────────────────────────────────────────

interface FvgItem {
  direction?: string;
  gap_high?: number;
  gap_low?: number;
  gap_size?: number;
  kline_index?: number;
  interval?: string;
  mitigated?: boolean;
  mitigation_type?: string;
  distance_pct?: number;
  filter_mode?: string;
  atr_fallback?: boolean;
  [key: string]: unknown;
}

// ── FVG Table ────────────────────────────────────────────────

export function FvgTable({ items }: { items: FvgItem[] }) {
  const t = useTranslations('analysis.fvgTable');
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{t('empty')}</p>;
  }

  const bullish = items.filter((f) => f.direction === "bullish" || f.direction === "看涨").length;
  const bearish = items.length - bullish;
  const nearest = items.reduce(
    (min, f) => (typeof f.distance_pct === "number" && f.distance_pct < min ? f.distance_pct : min),
    Infinity,
  );

  const sorted = [...items].sort((a, b) => (a.distance_pct ?? 999) - (b.distance_pct ?? 999));
  const displayed = showAll ? sorted : sorted.slice(0, INITIAL_ROWS);

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap text-xs md:text-sm">
        <span className="font-mono font-medium text-zinc-300">{t('summary.total', { count: items.length })}</span>
        <span className="text-emerald-400">{t('summary.bullish', { count: bullish })}</span>
        <span className="text-red-400">{t('summary.bearish', { count: bearish })}</span>
        {nearest < Infinity && (
          <span className="text-zinc-500">
            {t('summary.nearest')} <span className="font-mono text-zinc-300">{(nearest * 100).toFixed(2)}%</span>
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs md:text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-zinc-500">
              <th className="px-2 py-1.5 text-left font-medium">{t('columns.direction')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('columns.gapRange')}</th>
              <th className="px-2 py-1.5 text-right font-medium hidden sm:table-cell">{t('columns.size')}</th>
              <th className="px-2 py-1.5 text-center font-medium">{t('columns.interval')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('columns.distance')}</th>
              <th className="px-2 py-1.5 text-center font-medium">{t('columns.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {displayed.map((f, i) => {
              const isBull = f.direction === "bullish" || f.direction === "看涨";
              return (
                <tr
                  key={i}
                  className={isBull ? "bg-emerald-500/[0.03]" : "bg-red-500/[0.03]"}
                >
                  <td className="px-2 py-1.5">
                    <DirectionBadge direction={f.direction || "neutral"} />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-300">
                    {f.gap_low != null && f.gap_high != null
                      ? `${formatPrice(f.gap_low)} ~ ${formatPrice(f.gap_high)}`
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-400 hidden sm:table-cell">
                    {f.gap_size != null ? formatPrice(f.gap_size) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center text-zinc-400">
                    {f.interval || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-300">
                    {typeof f.distance_pct === "number"
                      ? `${(f.distance_pct * 100).toFixed(2)}%`
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        f.mitigated
                          ? "bg-zinc-500/15 text-zinc-500"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {f.mitigated ? t('status.mitigated') : t('status.unmitigated')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expand toggle */}
      {items.length > INITIAL_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {showAll ? t('actions.collapse') : t('actions.expandAll', { count: items.length })}
        </button>
      )}
    </div>
  );
}

// ── Order Block item type ────────────────────────────────────

interface OrderBlockItem {
  direction?: string;
  ob_type?: string;
  ob_high?: number;
  ob_low?: number;
  trigger?: string;
  phase_context?: string;
  phase_confidence?: number;
  whale_confirmed?: boolean;
  [key: string]: unknown;
}

// ── Order Block Table ────────────────────────────────────────

export function OrderBlockTable({ items }: { items: OrderBlockItem[] }) {
  const t = useTranslations('analysis.orderBlockTable');
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{t('empty')}</p>;
  }

  const bullish = items.filter((b) => b.direction === "bullish" || b.direction === "看涨").length;
  const bearish = items.length - bullish;
  const displayed = showAll ? items : items.slice(0, INITIAL_ROWS);

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap text-xs md:text-sm">
        <span className="font-mono font-medium text-zinc-300">{t('summary.total', { count: items.length })}</span>
        <span className="text-emerald-400">{t('summary.bullish', { count: bullish })}</span>
        <span className="text-red-400">{t('summary.bearish', { count: bearish })}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] text-xs md:text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-zinc-500">
              <th className="px-2 py-1.5 text-left font-medium">{t('columns.direction')}</th>
              <th className="px-2 py-1.5 text-center font-medium">{t('columns.type')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('columns.priceRange')}</th>
              <th className="px-2 py-1.5 text-left font-medium hidden sm:table-cell">{t('columns.trigger')}</th>
              <th className="px-2 py-1.5 text-center font-medium">{t('columns.whale')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {displayed.map((b, i) => {
              const isBull = b.direction === "bullish" || b.direction === "看涨";
              return (
                <tr
                  key={i}
                  className={isBull ? "bg-emerald-500/[0.03]" : "bg-red-500/[0.03]"}
                >
                  <td className="px-2 py-1.5">
                    <DirectionBadge direction={b.direction || "neutral"} />
                  </td>
                  <td className="px-2 py-1.5 text-center text-zinc-400">
                    {b.ob_type ? localizeText(b.ob_type) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-zinc-300">
                    {b.ob_low != null && b.ob_high != null
                      ? `${formatPrice(b.ob_low)} ~ ${formatPrice(b.ob_high)}`
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-left text-zinc-400 hidden sm:table-cell truncate max-w-[140px]">
                    {b.trigger ? localizeText(b.trigger) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {b.whale_confirmed ? (
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-400">{t('whale.yes')}</span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length > INITIAL_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {showAll ? t('actions.collapse') : t('actions.expandAll', { count: items.length })}
        </button>
      )}
    </div>
  );
}

// ── Generic Object Table (improved fallback) ─────────────────

export function GenericObjectTable({ items, label }: { items: Record<string, unknown>[]; label?: string }) {
  const t = useTranslations('analysis.genericTable');
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) {
    return <span className="text-sm text-zinc-500">{t('empty')}</span>;
  }

  // Extract column keys from all items (union), limit to 6 most common
  const keyCounts = new Map<string, number>();
  for (const item of items) {
    for (const k of Object.keys(item)) {
      if (HIDDEN_FIELDS.has(k)) continue;
      if (item[k] !== null && item[k] !== undefined) {
        keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
      }
    }
  }
  const columns = Array.from(keyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 6);

  const displayed = showAll ? items : items.slice(0, INITIAL_ROWS);

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs md:text-sm font-medium text-zinc-400">
          {label} <span className="text-zinc-500">({items.length})</span>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-zinc-500">
              {columns.map((col) => (
                <th key={col} className="px-2 py-1.5 text-left font-medium truncate max-w-[140px]">
                  {fieldLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {displayed.map((item, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1.5 font-mono text-zinc-300 truncate max-w-[140px]">
                    {formatValue(item[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > INITIAL_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {showAll ? t('actions.collapse') : t('actions.expandAll', { count: items.length })}
        </button>
      )}
    </div>
  );
}
