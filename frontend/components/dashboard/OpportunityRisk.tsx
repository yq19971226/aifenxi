"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Crosshair,
  Shield,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import type { SymbolOverview } from "@/lib/api/dashboard";

const ALERT_STYLES: Record<string, { color: string; dot: string }> = {
  none: { color: "text-zinc-400", dot: "bg-zinc-500" },
  low: { color: "text-emerald-400", dot: "bg-emerald-400" },
  medium: { color: "text-yellow-400", dot: "bg-yellow-400" },
  high: { color: "text-orange-400", dot: "bg-orange-400" },
  critical: { color: "text-red-400", dot: "bg-red-400" },
};

export function OpportunityRank({ symbols }: { symbols: SymbolOverview[] }) {
  const locale = useLocale();
  const t = useTranslations("dashboard.opportunity");
  const opportunities = symbols
    .filter((s) => s.is_worth_taking && s.direction !== "neutral")
    .sort((a, b) => b.risk_reward_ratio - a.risk_reward_ratio);

  return (
    <div className="card p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Crosshair size={14} className="text-accent" />
        <h3 className="text-sm font-semibold text-white">{t("title")}</h3>
        <span className="text-xs text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded-full font-mono">
          {t("count", { count: opportunities.length })}
        </span>
      </div>

      {opportunities.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4">{t("empty")}</p>
      ) : (
        <div className="space-y-2">
          {opportunities.map((item, idx) => (
            <motion.div
              key={item.symbol}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.05 }}
            >
              <Link
                href={`/${locale}/consensus?symbol=${item.symbol}`}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {item.display_name || (item.symbol ?? "").replace("USDT", "")}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">{item.symbol}</span>
                    <ExternalLink size={10} className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 font-mono">
                    {item.latest_price != null && (
                      <span className="text-zinc-400">{formatPrice(item.latest_price)}</span>
                    )}
                    {item.entry_low != null && item.entry_high != null && (
                      <span>
                        {t("entry", { low: formatPrice(item.entry_low), high: formatPrice(item.entry_high) })}
                      </span>
                    )}
                    {item.stop_loss != null && (
                      <span className="text-red-400/70">SL {formatPrice(item.stop_loss)}</span>
                    )}
                    {item.targets.length > 0 && (
                      <span className="text-emerald-400/70">TP {formatPrice(item.targets[0])}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-sm font-mono font-semibold text-white">
                    RR 1:{item.risk_reward_ratio.toFixed(1)}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">
                    {Math.round(item.confidence * 100)}%
                  </span>
                  <ChevronRight size={14} className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RiskRadar({ symbols }: { symbols: SymbolOverview[] }) {
  const locale = useLocale();
  const t = useTranslations("dashboard.risk");
  return (
    <div className="card p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={14} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-white">{t("title")}</h3>
      </div>

      {symbols.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4">{t("empty")}</p>
      ) : (
        <div className="space-y-1">
          {symbols.map((item, idx) => {
            const cfg = ALERT_STYLES[item.alert_level] || ALERT_STYLES.none;
            return (
              <motion.div
                key={item.symbol}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
              >
                <Link
                  href={`/${locale}/consensus?symbol=${item.symbol}`}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                    <span className="text-sm text-white font-medium">
                      {item.display_name || (item.symbol ?? "").replace("USDT", "")}/USDT
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm ${cfg.color}`}>{t(`levels.${item.alert_level || "none"}`)}</span>
                    <ChevronRight size={14} className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function OpportunityRiskSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 skeleton rounded" />
          <div className="h-4 w-16 skeleton rounded" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="py-2.5 px-3">
              <div className="h-4 w-32 skeleton rounded mb-2" />
              <div className="h-3 w-48 skeleton rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 skeleton rounded" />
          <div className="h-4 w-16 skeleton rounded" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 px-3">
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 skeleton rounded-full" />
                <div className="h-4 w-20 skeleton rounded" />
              </div>
              <div className="h-4 w-10 skeleton rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
