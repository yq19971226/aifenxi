"use client";

import { motion } from "framer-motion";

import type { QuotaInfo } from "@/lib/api/analysis";

// ── Component ────────────────────────────────────────────────

interface QuotaDisplayProps {
  quota: QuotaInfo | null;
  isLocked: boolean;
  isExhausted: boolean;
  upgradeHint: string | null;
}

export function QuotaDisplay({ quota, isLocked, isExhausted, upgradeHint }: QuotaDisplayProps) {
  return (
    <div className="flex flex-col gap-2">
      {upgradeHint && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 flex items-center"
        >
          <p className="text-sm text-amber-400 font-medium">{upgradeHint}</p>
        </motion.div>
      )}

      {isExhausted && !isLocked && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400 font-medium">
            今日配额已用完，明日 UTC 00:00 重置
          </p>
        </div>
      )}

      {quota && !isLocked && !isExhausted && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            <span className="text-xs text-zinc-500">今日分析配额</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, quota.limit) }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full ${
                    i < quota.remaining
                      ? "bg-indigo-500"
                      : "bg-white/[0.05]"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-zinc-400 font-mono ml-2">
              {quota.remaining} / {quota.limit}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
