"use client";

import { useQuery } from "@tanstack/react-query";
import { symbolsApi, type SymbolConfig } from "@/lib/api/symbols";

interface SymbolSelectorProps {
  value: string;
  onChange: (symbol: string) => void;
}

export function SymbolSelector({ value, onChange }: SymbolSelectorProps) {
  const { data: symbols = [], isLoading } = useQuery<SymbolConfig[]>({
    queryKey: ["symbols"],
    queryFn: () => symbolsApi.listSymbols(),
    staleTime: 60_000,
  });

  // Fallback: if API hasn't loaded yet, show current value
  const options =
    symbols.length > 0
      ? symbols.filter((s) => s.enabled)
      : [{ symbol: value, enabled: true }];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={isLoading || options.length <= 1}
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
  );
}
