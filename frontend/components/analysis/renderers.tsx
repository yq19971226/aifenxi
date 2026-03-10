"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { SignalDirection } from "@/lib/api/analysis";
import { fieldLabel, formatDirection, formatPrice, formatValue, getSignalStyle, localizeText } from "./helpers";

// ── Direction badge ──────────────────────────────────────────

export function DirectionBadge({ direction }: { direction: string }) {
  const style =
    direction === "bullish" || direction === "long"
      ? "bg-emerald-500/15 text-emerald-400"
      : direction === "bearish" || direction === "short"
        ? "bg-red-500/15 text-red-400"
        : "bg-zinc-500/15 text-zinc-400";
  const label = direction === "bullish" || direction === "long" ? "多" : direction === "bearish" || direction === "short" ? "空" : formatDirection(direction);
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${style}`}>
      {label}
    </span>
  );
}

// ── Signal row (signal + confidence + trend in one row) ──────

export function SignalRow({ data }: { data: Record<string, unknown> }) {
  const signal = String(data.signal || "");
  const confidence = typeof data.confidence === "number" ? data.confidence : null;
  const trend = String(data.trend || "");

  if (!signal && confidence === null && !trend) return null;

  const signalStyle = getSignalStyle(signal as SignalDirection);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {signal && (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold ${signalStyle.bg} ${signalStyle.text} border ${signalStyle.border}`}>
          {signal === "bullish" ? <TrendingUp className="h-3 w-3" /> : signal === "bearish" ? <TrendingDown className="h-3 w-3" /> : null}
          {formatDirection(signal)}
        </span>
      )}
      {confidence !== null && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-sm font-mono text-zinc-300">
          置信度 <span className="font-bold">{(confidence * 100).toFixed(0)}%</span>
        </span>
      )}
      {trend && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-sm text-zinc-400">
          趋势: {formatDirection(trend)}
        </span>
      )}
    </div>
  );
}

// ── Price level badges ───────────────────────────────────────

export function PriceLevels({ levels, type }: { levels: number[]; type: "support" | "resistance" }) {
  if (levels.length === 0) return <span className="text-sm text-zinc-500">—</span>;
  const color = type === "support" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10";
  const icon = type === "support" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />;
  return (
    <div className="flex flex-wrap gap-1.5">
      {levels.map((p, i) => (
        <span key={i} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono font-medium ${color}`}>
          {icon}
          {formatPrice(p)}
        </span>
      ))}
    </div>
  );
}

// ── Reasoning block ──────────────────────────────────────────

export function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const localized = localizeText(text);
  const isLong = localized.length > 200;
  const displayed = isLong && !expanded ? localized.slice(0, 200) + "…" : localized;

  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
      <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">{displayed}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-accent hover:underline"
        >
          {expanded ? "收起" : "展开全文"}
        </button>
      )}
    </div>
  );
}

// ── Object array table ───────────────────────────────────────

const _INITIAL_SHOW = 5;

export function ObjectArrayTable({ items }: { items: Record<string, unknown>[] }) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return <span className="text-sm text-zinc-500">未检测到</span>;

  const isPattern = items[0] && "pattern_name" in items[0];

  if (isPattern) {
    const seen = new Map<string, Record<string, unknown>>();
    for (const p of items) {
      const k = `${p.pattern_name}_${p.direction}`;
      const existing = seen.get(k);
      if (!existing || (typeof p.strength === "number" && p.strength > (existing.strength as number))) {
        seen.set(k, p);
      }
    }
    const unique = Array.from(seen.values()).sort(
      (a, b) => ((b.strength as number) || 0) - ((a.strength as number) || 0),
    );
    const show = showAll ? unique : unique.slice(0, _INITIAL_SHOW);

    return (
      <div className="space-y-1">
        {show.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <DirectionBadge direction={String(p.direction || "")} />
            <span className="text-zinc-300 truncate">
              {String(p.display_name || p.pattern_name || "?")}
            </span>
            {typeof p.strength === "number" && (
              <span className="ml-auto shrink-0 font-mono text-zinc-500">
                {(p.strength * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
        {unique.length > _INITIAL_SHOW && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-accent hover:underline"
          >
            {showAll ? "收起" : `展开全部 (${unique.length})`}
          </button>
        )}
      </div>
    );
  }

  // Generic object array — import DataPairs lazily to avoid circular deps
  const displayed = showAll ? items : items.slice(0, _INITIAL_SHOW);
  return (
    <div className="space-y-2">
      {displayed.map((item, i) => (
        <div key={i} className="ml-2 border-l border-white/[0.06] pl-2">
          {Object.entries(item)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-sm text-zinc-500">{fieldLabel(k)}</span>
                <span className="text-right text-sm font-mono text-zinc-300">{formatValue(v)}</span>
              </div>
            ))}
        </div>
      ))}
      {items.length > _INITIAL_SHOW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {showAll ? "收起" : `展开全部 (${items.length})`}
        </button>
      )}
    </div>
  );
}

export function PreviewList({
  items,
  renderItem,
  initialCount = 10,
}: {
  items: string[];
  renderItem: (item: string, index: number) => React.ReactNode;
  initialCount?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? items : items.slice(0, initialCount);

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {displayed.map((item, index) => renderItem(item, index))}
      </ul>
      {items.length > initialCount && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {showAll ? "收起" : `展开全部 (${items.length})`}
        </button>
      )}
    </div>
  );
}

// ── Collapsible sub-section ──────────────────────────────────

export function CollapsibleSection({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
      >
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-3 w-3" />
        </motion.div>
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-2 mt-1 border-l border-white/[0.06] pl-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
