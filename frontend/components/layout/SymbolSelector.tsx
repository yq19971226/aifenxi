"use client";

import { useQuery } from "@tanstack/react-query";
import { symbolsApi, type SymbolConfig } from "@/lib/api/symbols";

interface SymbolSelectorProps {
  value: string;
  onChange: (symbol: string) => void;
}

export function SymbolSelector({ value, onChange }: SymbolSelectorProps) {
  const { data: symbols = [], isLoading, isError } = useQuery<SymbolConfig[]>({
    queryKey: ["symbols"],
    queryFn: () => symbolsApi.listSymbols(),
    staleTime: 60_000,
  });

  const enabledSymbols = symbols.filter((s) => s.enabled);
  const options =
    enabledSymbols.length > 0
      ? enabledSymbols
      : [{ symbol: value, enabled: true }];

  const isSingleOption = options.length <= 1 && !isLoading && !isError;

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isLoading}
        className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-zinc-200 outline-none transition-colors hover:border-accent/50 focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((s) => (
          <option
            key={s.symbol}
            value={s.symbol}
            className="bg-[#0F1117] text-zinc-200"
          >
            {s.symbol}
          </option>
        ))}
      </select>
      {isSingleOption && (
        <span className="text-xs text-zinc-500" title="管理员仅启用了 1 个币种">单币种</span>
      )}
    </div>
  );
}
