"use client";

import { useMemo } from "react";
import { useTradePreferences } from "@/lib/hooks/useTradePreferences";
import { calculatePosition, type PositionInput } from "@/lib/utils/position-sizing";

interface Props {
  input: PositionInput;
}

export function PositionSummary({ input }: Props) {
  const { preferences, loaded } = useTradePreferences();

  const result = useMemo(() => {
    if (!preferences) return null;
    return calculatePosition(input, preferences);
  }, [input, preferences]);

  if (!loaded) return null;

  if (!preferences) return null;

  if (input.direction === "neutral" || input.entryPrice <= 0 || !result) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-zinc-500">
        若入场：保证金{" "}
        <span className="font-mono text-white">${result.margin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </span>
      <span className="text-zinc-500">
        最大亏损{" "}
        <span className="font-mono text-red-400">
          ${result.maxLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({((preferences.riskPct) * 100).toFixed(0)}%)
        </span>
      </span>
    </div>
  );
}
