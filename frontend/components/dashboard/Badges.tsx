"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Lock,
} from "lucide-react";
import type { PlanCapabilities } from "@/lib/api/onchain";

export function DirectionBadge({
  direction,
  isWorthTaking,
}: {
  direction: string;
  isWorthTaking?: boolean;
}) {
  const worthIcon =
    isWorthTaking === true
      ? "text-emerald-400"
      : isWorthTaking === false
        ? "text-amber-400"
        : null;

  const tb = useTranslations("dashboard.badges");
  const badge = (() => {
    if (direction === "long") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-sm font-medium text-emerald-400">
          <TrendingUp size={14} />
          {tb("long")}
        </span>
      );
    }
    if (direction === "short") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-sm font-medium text-red-400">
          <TrendingDown size={14} />
          {tb("short")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2.5 py-1 text-sm font-medium text-zinc-400">
        <Minus size={14} />
        {tb("neutral")}
      </span>
    );
  })();

  return (
    <span className="inline-flex items-center gap-1.5">
      {badge}
      {worthIcon && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${(worthIcon ?? "").replace("text-", "bg-")}`}
          title={isWorthTaking ? tb("worthTaking") : tb("notWorth")}
        />
      )}
    </span>
  );
}

export function AlertBadge({ level }: { level: string }) {
  const t = useTranslations("dashboard.risk");
  const ALERT_COLORS: Record<string, string> = {
    none: "text-zinc-500",
    low: "text-emerald-400",
    medium: "text-yellow-400",
    high: "text-orange-400",
    critical: "text-red-400",
  };
  const color = ALERT_COLORS[level] || ALERT_COLORS.none;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${color}`}>
      <span className={`h-2 w-2 rounded-full ${(color ?? "").replace("text-", "bg-")}`} />
      {t(`levels.${level || "none"}`)}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const barColor =
    pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-500" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-mono text-zinc-300">{pct}%</span>
    </div>
  );
}

export function OnchainBadge({
  symbol,
  capabilities,
}: {
  symbol: string;
  capabilities: PlanCapabilities["user_capabilities"] | null;
}) {
  const t = useTranslations('onchain');
  const locale = useLocale();
  const hasAccess = capabilities?.symbols?.some(
    (s) => s.toUpperCase() === symbol.toUpperCase()
  );

  if (!capabilities) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        <span className="h-2 w-2 rounded-full bg-zinc-500 animate-pulse" />
        {t('badge.loading')}
      </span>
    );
  }

  if (hasAccess) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400" title={t('badge.availableTooltip')}>
        <BarChart3 size={12} />
        {t('badge.available')}
      </span>
    );
  }

  return (
    <Link
      href={`/${locale}/settings/membership`}
      className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <Lock size={12} />
      {t('noAccess.upgrade')}
    </Link>
  );
}
