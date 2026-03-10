"use client";

import { useTranslations } from "next-intl";

// ── Filter options ───────────────────────────────────────────

const DAYS_OPTIONS: { label: string; value: number }[] = [
  { label: "7", value: 7 },
  { label: "30", value: 30 },
  { label: "90", value: 90 },
];

const DIRECTION_KEYS: { key: string; value: string }[] = [
  { key: "all", value: "" },
  { key: "long", value: "long" },
  { key: "short", value: "short" },
];

// ── Props ────────────────────────────────────────────────────

interface FilterBarProps {
  symbol: string;
  onSymbolChange: (v: string) => void;
  days: number;
  onDaysChange: (v: number) => void;
  direction: string;
  onDirectionChange: (v: string) => void;
}

// ── Component ────────────────────────────────────────────────

export function FilterBar({
  symbol,
  onSymbolChange,
  days,
  onDaysChange,
  direction,
  onDirectionChange,
}: FilterBarProps) {
  const t = useTranslations('performance.filter');
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Symbol input */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="perf-symbol"
          className="text-xs font-medium uppercase tracking-widest text-zinc-500"
        >
          {t('symbol')}
        </label>
        <input
          id="perf-symbol"
          type="text"
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value.toUpperCase())}
          placeholder={t('symbolPlaceholder')}
          className="input h-9 w-36"
        />
      </div>

      {/* Days selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          {t('timeRange')}
        </span>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDaysChange(opt.value)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                days === opt.value
                  ? "bg-indigo-500/10 text-indigo-400"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Direction selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          {t('direction')}
        </span>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
          {DIRECTION_KEYS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDirectionChange(opt.value)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                direction === opt.value
                  ? "bg-indigo-500/10 text-indigo-400"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {t(opt.key)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
