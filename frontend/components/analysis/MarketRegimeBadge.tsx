"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRightLeft, TrendingUp } from "lucide-react";

import type { MarketRegime } from "@/lib/api/analysis";
import { formatPrice, localizeText } from "./helpers";
import { useTranslations } from "next-intl";

export function MarketRegimeBadge({ regime }: { regime: MarketRegime }) {
  const t = useTranslations("analysis.marketRegime");
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
        regime.regime === "ranging"
          ? "border-amber-500/20 bg-amber-500/[0.04]"
          : regime.regime === "volatile"
            ? "border-red-500/20 bg-red-500/[0.04]"
            : "border-emerald-500/20 bg-emerald-500/[0.04]"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {regime.regime === "ranging" ? (
          <ArrowRightLeft className="h-4 w-4 text-amber-400" />
        ) : regime.regime === "volatile" ? (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        ) : (
          <TrendingUp className="h-4 w-4 text-emerald-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-bold ${
            regime.regime === "ranging" ? "text-amber-400"
              : regime.regime === "volatile" ? "text-red-400" : "text-emerald-400"
          }`}>
            {regime.regime === "ranging" ? t("ranging") : regime.regime === "volatile" ? t("volatile") : t("trending")}
          </span>
          {regime.adx !== null && (
            <span className="text-xs font-mono text-zinc-500">ADX {regime.adx.toFixed(1)}</span>
          )}
          {regime.confidence > 0 && (
            <span className="text-xs font-mono text-zinc-500">
              {(regime.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">{localizeText(regime.suggestion)}</p>
        {regime.support !== null && regime.resistance !== null && regime.regime === "ranging" && (
          <p className="text-xs font-mono text-zinc-500 mt-1">
            {t("support")} {formatPrice(regime.support)} ~ {t("resistance")} {formatPrice(regime.resistance)}
          </p>
        )}
      </div>
    </motion.div>
  );
}
