"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import {
  fetchDashboardOverview,
  fetchDashboardSignals,
  fetchDashboardInsights,
  fetchDashboardAccuracy,
  type SymbolOverview,
  type SignalEvent,
  type InsightItem,
  type AccuracyResponse,
} from "@/lib/api/dashboard";
import {
  AlertCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Clock,
  Lock,
  Zap,
  Link as LinkIcon,
  Newspaper,
  ShieldAlert,
  Crosshair,
} from "lucide-react";

/* ---------- helpers ---------- */

function relativeTime(isoStr: string | null | undefined, t: (k: string, v?: Record<string, string | number>) => string) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("heroJustNow");
  if (min < 60) return t("heroMinAgo", { min });
  return t("heroHourAgo", { hour: Math.floor(min / 60) });
}

function blurPrice(val: number | null | undefined): string {
  if (val == null) return "—";
  const s = val.toFixed(2);
  return s.slice(0, -3) + "***";
}

function formatPrice(val: number | null | undefined): string {
  if (val == null) return "—";
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SIGNAL_ICON_MAP: Record<string, { icon: typeof TrendingUp; color: string; bg: string }> = {
  direction_change: { icon: RefreshCw, color: "text-blue-400", bg: "bg-blue-500/10" },
  confidence_rise: { icon: ArrowUpRight, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  confidence_drop: { icon: ArrowDownRight, color: "text-amber-400", bg: "bg-amber-500/10" },
  opportunity: { icon: Zap, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  risk_alert: { icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10" },
};

const INSIGHT_ICON_MAP: Record<string, typeof LinkIcon> = {
  onchain: LinkIcon,
  macro: Newspaper,
  risk: ShieldAlert,
  dealer: Crosshair,
};

/* ---------- main page ---------- */

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { user } = useAuth();
  const level = effectiveLevel(user);

  const {
    data: overview,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: fetchDashboardOverview,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  const { data: signals } = useQuery({
    queryKey: ["dashboard-signals"],
    queryFn: () => fetchDashboardSignals(15),
    refetchInterval: 30_000,
  });

  const { data: insights } = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: fetchDashboardInsights,
    refetchInterval: 60_000,
  });

  const { data: accuracy } = useQuery<AccuracyResponse>({
    queryKey: ["dashboard-accuracy"],
    queryFn: () => fetchDashboardAccuracy(7),
    refetchInterval: 120_000,
  });

  // derived stats
  const symbols = overview?.symbols ?? [];
  const heroStats = useMemo(() => {
    let long = 0, short = 0, neutral = 0;
    let latest = "";
    for (const s of symbols) {
      if (s.direction === "long") long++;
      else if (s.direction === "short") short++;
      else neutral++;
      if (s.strategy_updated_at && s.strategy_updated_at > latest) latest = s.strategy_updated_at;
    }
    return { long, short, neutral, latest };
  }, [symbols]);

  const sortedSymbols = useMemo(() => {
    return [...symbols].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  }, [symbols]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="relative h-16 w-16 mb-5">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
          </svg>
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: "2s" }}>
            <div className="absolute top-0 left-1/2 -ml-[4px] w-2 h-2 rounded-full bg-zinc-400 shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
          </div>
        </div>
        <p className="text-sm font-mono text-zinc-500 tracking-widest uppercase">{t("initializingEngine")}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-400">
        <AlertCircle size={48} className="mb-4 opacity-50" />
        <h2 className="text-lg font-bold mb-2">{t("connectionFailed")}</h2>
        <p className="text-sm text-zinc-400 mb-6">{t("connectionFailedDesc")}</p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors text-sm font-medium text-white"
        >
          <RefreshCw size={14} /> {t("retryConnection")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto px-4 md:px-8 py-8">
      {/* ── Zone 1: Hero Summary ── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-500/[0.07] blur-[100px] -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-emerald-500/[0.04] blur-[80px] -ml-20 -mb-20" />
        </div>
        <div className="relative z-10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-2">{t("title")}</h1>
              <p className="text-sm text-zinc-400">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              {t("autoRefresh")}
            </div>
          </div>

          {/* Hero Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {/* Direction counts */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex gap-1.5">
                {heroStats.long > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                    ▲ {heroStats.long}
                  </span>
                )}
                {heroStats.short > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 text-xs font-bold">
                    ▼ {heroStats.short}
                  </span>
                )}
                {heroStats.neutral > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-zinc-500/10 text-zinc-400 text-xs font-bold">
                    — {heroStats.neutral}
                  </span>
                )}
              </div>
            </div>

            {/* Accuracy */}
            <div className="flex flex-col px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">
                {t("heroAccuracy", { days: 7 })}
              </span>
              {level >= 1 && accuracy ? (
                <span className={`text-lg font-black tracking-tight ${accuracy.accuracy >= 0.65 ? "text-emerald-400" : accuracy.accuracy >= 0.45 ? "text-amber-400" : "text-red-400"}`}>
                  {(accuracy.accuracy * 100).toFixed(0)}%
                  <span className="text-[10px] font-normal text-zinc-500 ml-1">{accuracy.hit_count}/{accuracy.total}</span>
                </span>
              ) : level < 1 ? (
                <span className="flex items-center gap-1 text-sm text-zinc-500">
                  <Lock size={12} /> {t("membership.upgradeHint")}
                </span>
              ) : (
                <span className="text-lg font-black text-zinc-600">—</span>
              )}
            </div>

            {/* New signals count */}
            <div className="flex flex-col px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{t("timeline.title")}</span>
              <span className="text-lg font-black text-indigo-400 tracking-tight">
                {signals?.total ?? 0}
                <span className="text-[10px] font-normal text-zinc-500 ml-1">条</span>
              </span>
            </div>

            {/* Last update */}
            <div className="flex flex-col px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{t("heroLastUpdate")}</span>
              <span className="text-sm font-semibold text-zinc-300 flex items-center gap-1.5">
                <Clock size={12} className="text-zinc-500" />
                {relativeTime(heroStats.latest, t) || "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Zone 2: Symbol Signal Cards ── */}
      {sortedSymbols.length === 0 ? (
        <div className="rounded-xl border border-white/[0.04] border-dashed p-14 text-center">
          <Target size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">暂无信号数据</p>
          <p className="text-xs text-zinc-600 mt-1">请在后台「币种管理」中启用交易对</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedSymbols.map((s) => (
            <SymbolCard key={s.symbol} s={s} level={level} locale={locale} t={t} />
          ))}
        </div>
      )}

      {/* ── Zone 3 + 4: Timeline + Insights side by side on desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Timeline */}
        <div className="lg:col-span-7">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-indigo-400" />
                <span className="text-sm font-semibold text-white">{t("timeline.title")}</span>
              </div>
              <Link
                href={`/${locale}/consensus`}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                {t("goConsensus")} <ChevronRight size={12} />
              </Link>
            </div>
            <div className="p-5 max-h-[360px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              {!signals?.signals?.length ? (
                <div className="text-center py-10 text-sm text-zinc-500">{t("timeline.empty")}</div>
              ) : (
                <div className="space-y-3">
                  {signals.signals.map((sig, idx) => (
                    <SignalTimelineItem key={`${sig.timestamp}-${idx}`} sig={sig} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Insights */}
        <div className="lg:col-span-5">
          <div className="card overflow-hidden h-full">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
              <Target size={14} className="text-amber-400" />
              <span className="text-sm font-semibold text-white">{t("insights.title")}</span>
            </div>
            <div className="p-5 max-h-[360px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              {!insights?.insights?.length ? (
                <div className="text-center py-10 text-sm text-zinc-500">{t("insights.empty")}</div>
              ) : (
                <div className="space-y-2.5">
                  {insights.insights.map((item, idx) => (
                    <InsightRow key={`${item.type}-${item.symbol}-${idx}`} item={item} t={t} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Symbol Card ---------- */

function SymbolCard({
  s,
  level,
  locale,
  t,
}: {
  s: SymbolOverview;
  level: number;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const isLong = s.direction === "long";
  const isShort = s.direction === "short";
  const conf = Math.round((s.confidence ?? 0) * 100);
  const canSeeStrategy = level >= 1;

  const barColor =
    conf >= 70
      ? isLong
        ? "bg-emerald-500"
        : "bg-red-500"
      : conf >= 50
        ? "bg-amber-500"
        : conf >= 30
          ? "bg-blue-500"
          : "bg-zinc-600";

  const accentBorder = isLong
    ? "border-l-emerald-500"
    : isShort
      ? "border-l-red-500"
      : "border-l-zinc-600";

  return (
    <Link
      href={`/${locale}/consensus?symbol=${s.symbol}`}
      className={`group relative flex flex-col p-5 rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.1] transition-all border-l-[3px] ${accentBorder}`}
    >
      {/* Row 1: Symbol + Price + Direction badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-black text-white tracking-tight">
            {s.display_name || s.symbol.replace("USDT", "")}
          </span>
          <span className="text-sm font-mono text-zinc-400">
            {formatPrice(s.latest_price)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-bold ${
              isLong
                ? "bg-emerald-500/10 text-emerald-400"
                : isShort
                  ? "bg-red-500/10 text-red-400"
                  : "bg-zinc-500/10 text-zinc-400"
            }`}
          >
            {isLong && <TrendingUp size={12} className="inline mr-1" />}
            {isShort && <TrendingDown size={12} className="inline mr-1" />}
            {!isLong && !isShort && <Minus size={12} className="inline mr-1" />}
            {t(`direction.${s.direction || "neutral"}`)}
          </span>
        </div>
      </div>

      {/* Row 2: Confidence bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${Math.min(conf, 100)}%` }}
          />
        </div>
        <span className={`text-sm font-black tabular-nums min-w-[40px] text-right ${conf >= 70 ? (isLong ? "text-emerald-400" : "text-red-400") : "text-zinc-400"}`}>
          {conf}%
        </span>
      </div>

      {/* Row 3: Strategy (blurred for free users) */}
      {s.direction !== "neutral" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2">
          {s.entry_low && s.entry_high && (
            <span className="text-zinc-400">
              {t("entryRange")}{" "}
              <span className={canSeeStrategy ? "text-zinc-200 font-semibold" : "text-zinc-500 blur-[3px] select-none"}>
                {canSeeStrategy ? formatPrice(s.entry_low) : blurPrice(s.entry_low)}–{canSeeStrategy ? formatPrice(s.entry_high) : blurPrice(s.entry_high)}
              </span>
            </span>
          )}
          {s.stop_loss && (
            <span className="text-zinc-400">
              {t("stopLoss")}{" "}
              <span className={canSeeStrategy ? "text-red-400/80 font-semibold" : "text-zinc-500 blur-[3px] select-none"}>
                {canSeeStrategy ? formatPrice(s.stop_loss) : blurPrice(s.stop_loss)}
              </span>
            </span>
          )}
          {s.targets?.[0] && (
            <span className="text-zinc-400">
              {t("target")}{" "}
              <span className={canSeeStrategy ? "text-emerald-400/80 font-semibold" : "text-zinc-500 blur-[3px] select-none"}>
                {canSeeStrategy ? formatPrice(s.targets[0]) : blurPrice(s.targets[0])}
              </span>
            </span>
          )}
          {s.risk_reward_ratio > 0 && (
            <span className="text-zinc-400">
              {t("riskReward")}{" "}
              <span className="text-zinc-200 font-semibold">1:{s.risk_reward_ratio.toFixed(1)}</span>
            </span>
          )}
        </div>
      )}

      {/* Row 4: Reasoning + Dealer + Time */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/[0.04]">
        <div className="flex-1 text-[11px] text-zinc-500 line-clamp-1 pr-4">
          {s.reasoning ? s.reasoning.slice(0, 60) : ""}
          {s.dealer_intent && s.dealer_intent !== "unknown" && (
            <span className="text-amber-400/80 ml-2">🎯 {s.dealer_intent}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {s.strategy_updated_at && (
            <span className="text-[10px] text-zinc-600">
              <Clock size={10} className="inline mr-0.5" />
              {relativeTime(s.strategy_updated_at, t)}
            </span>
          )}
          <ChevronRight size={14} className="text-zinc-600 group-hover:text-white transition-colors" />
        </div>
      </div>

      {/* Free user upgrade hint overlay */}
      {!canSeeStrategy && s.direction !== "neutral" && (
        <div className="absolute bottom-2 right-14 text-[10px] text-indigo-400 flex items-center gap-1">
          <Lock size={10} /> {t("membership.upgradeHint")}
        </div>
      )}
    </Link>
  );
}

/* ---------- Signal Timeline Item ---------- */

function SignalTimelineItem({ sig }: { sig: SignalEvent }) {
  const info = SIGNAL_ICON_MAP[sig.type] ?? SIGNAL_ICON_MAP.direction_change;
  const Icon = info.icon;
  const time = sig.timestamp ? new Date(sig.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="flex items-start gap-3 group">
      <span className="text-[11px] font-mono text-zinc-600 w-12 shrink-0 pt-0.5 text-right">{time}</span>
      <div className={`p-1 rounded-md ${info.bg} shrink-0 mt-0.5`}>
        <Icon size={12} className={info.color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-300 leading-relaxed">{sig.message}</p>
        {sig.detail && <p className="text-[10px] text-zinc-500 mt-0.5">{sig.detail}</p>}
      </div>
    </div>
  );
}

/* ---------- Insight Row ---------- */

function InsightRow({ item, t }: { item: InsightItem; t: (k: string) => string }) {
  const Icon = INSIGHT_ICON_MAP[item.type] ?? ShieldAlert;
  const typeLabel = t(`insights.types.${item.type}` as any) || item.type;
  const colorMap: Record<string, string> = {
    onchain: "text-blue-400 bg-blue-500/10",
    macro: "text-amber-400 bg-amber-500/10",
    risk: "text-red-400 bg-red-500/10",
    dealer: "text-purple-400 bg-purple-500/10",
  };
  const cls = colorMap[item.type] ?? "text-zinc-400 bg-zinc-500/10";
  const [textColor, bgColor] = cls.split(" ");

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
      <div className={`p-1.5 rounded-md ${bgColor} shrink-0`}>
        <Icon size={12} className={textColor} />
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${textColor}`}>{typeLabel}</span>
        <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed line-clamp-2">{item.text}</p>
      </div>
    </div>
  );
}
