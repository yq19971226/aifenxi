"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { QuotaInfo } from "@/lib/api/analysis";

// ── Component ────────────────────────────────────────────────

interface QuotaDisplayProps {
  quota: QuotaInfo | null;
  isLocked: boolean;
  isExhausted: boolean;
  upgradeHint: string | null;
}

export function QuotaDisplay({ quota, isLocked, isExhausted, upgradeHint }: QuotaDisplayProps) {
  const t = useTranslations("analysis.quotaDisplay");
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
            {t("exhausted")}
          </p>
        </div>
      )}

      {quota && !isLocked && !isExhausted && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              <span className="text-xs text-zinc-500">{t("remaining")}</span>
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                // effectiveTotal: bonus 充值后 remaining 可能 > limit（limit=0 时尤其如此）
                const effectiveTotal = Math.max(quota.limit, quota.remaining);
                const barCount = Math.min(5, effectiveTotal);
                return (
                  <div className="flex gap-1">
                    {barCount > 0 && Array.from({ length: barCount }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 w-6 rounded-full ${
                          i < quota.remaining
                            ? quota.remaining <= 2 ? "bg-amber-500" : "bg-indigo-500"
                            : "bg-white/[0.05]"
                        }`}
                      />
                    ))}
                  </div>
                );
              })()}
              <span className={`text-xs font-mono ml-2 ${quota.remaining <= 2 ? "text-amber-400" : "text-zinc-400"}`}>
                {quota.remaining}{quota.limit > 0 ? ` / ${quota.limit}` : ""}
              </span>
            </div>
          </div>

          {/* Low quota warning */}
          {quota.remaining > 0 && quota.remaining <= 2 && (
            <p className="text-[11px] text-amber-400/80 font-medium">
              ⚡ {t("lowWarning")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
