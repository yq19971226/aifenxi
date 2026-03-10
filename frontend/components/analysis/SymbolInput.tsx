"use client";

import { RefreshCw } from "lucide-react";

// ── Component ────────────────────────────────────────────────

interface SymbolInputProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  quickSymbols: string[];
  running: boolean;
  canStart: boolean;
  onStart: () => void;
}

export function SymbolInput({
  symbol,
  onSymbolChange,
  quickSymbols,
  running,
  canStart,
  onStart,
}: SymbolInputProps) {
  const displaySymbols = quickSymbols.slice(0, 5);

  return (
    <div className="flex flex-col lg:flex-row items-end gap-4 bg-white/[0.01] border border-white/[0.03] p-5 rounded-lg">
      <div className="w-full flex-1 space-y-2">
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          交易对 Symbol
        </label>
        <div className="relative">
          <input
            type="text"
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value.toUpperCase())}
            placeholder="BTCUSDT"
            disabled={running}
            className={`w-full bg-black/40 border border-white/[0.08] focus:border-indigo-500/50 rounded-lg py-3.5 pl-4 text-white text-base font-mono transition-all outline-none ${
              displaySymbols.length >= 4 ? "pr-44" : displaySymbols.length >= 2 ? "pr-28" : "pr-16"
            }`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            {displaySymbols.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSymbolChange(s)}
                disabled={running}
                className="px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-xs font-mono text-zinc-300 transition-colors"
              >
                {(s ?? "").replace("USDT", "")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Start button */}
      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        className={`shrink-0 w-full lg:w-[180px] h-[52px] rounded-lg font-bold text-base flex items-center justify-center gap-2 transition-all duration-200 ${
          running
            ? "bg-white/[0.05] text-zinc-400 border border-white/[0.1]"
            : canStart
              ? "bg-indigo-600 text-white hover:bg-indigo-500"
              : "bg-white/[0.02] text-zinc-600 border border-white/[0.05]"
        }`}
      >
        {running ? (
          <>
            <RefreshCw size={14} className="animate-spin" />
            分析中...
          </>
        ) : (
          "开始分析"
        )}
      </button>
    </div>
  );
}
