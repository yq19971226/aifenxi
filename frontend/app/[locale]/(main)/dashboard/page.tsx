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
  Activity,
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
      <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-primary/95 shadow-modal backdrop-blur-xl">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-500/[0.04] blur-[100px] -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-emerald-500/[0.03] blur-[80px] -ml-20 -mb-20" />
        </div>
        <div className="relative z-10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-2">{t("title")}</h1>
              <p className="text-sm text-zinc-400 font-medium">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              </span>
              {t("autoRefresh")}
            </div>
          </div>

          {/* Hero Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
            {/* Direction counts */}
            <div className="flex flex-col px-5 py-4 rounded-xl bg-bg-surface border border-border shadow-inner justify-center">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><TrendingUp size={12}/>{t("heroMarketDirection")}</span>
              <div className="flex gap-2">
                {heroStats.long > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-bull/10 text-bull text-xs font-bold font-mono tracking-widest">
                    BULL {heroStats.long}
                  </span>
                )}
                {heroStats.short > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-bear/10 text-bear text-xs font-bold font-mono tracking-widest">
                    BEAR {heroStats.short}
                  </span>
                )}
                {heroStats.neutral > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-bg-elevated text-zinc-400 text-xs font-bold font-mono tracking-widest">
                    NTL {heroStats.neutral}
                  </span>
                )}
              </div>
            </div>

            {/* Accuracy */}
            <div className="flex flex-col px-5 py-4 rounded-xl bg-bg-surface border border-border shadow-inner justify-center group relative overflow-hidden">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5 flex-wrap">
                <Target size={12}/>{t("heroAccuracy", { days: 7 })}
              </span>
              {level >= 1 && accuracy ? (
                <span className={`text-xl font-black tracking-tight z-10 ${accuracy.accuracy >= 0.65 ? "text-bull" : accuracy.accuracy >= 0.45 ? "text-warn" : "text-bear"}`}>
                  {(accuracy.accuracy * 100).toFixed(0)}%
                  <span className="text-[10px] font-mono font-bold text-zinc-500 ml-2 tracking-widest">{accuracy.hit_count}/{accuracy.total}</span>
                </span>
              ) : level < 1 ? (
                <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 z-10 cursor-pointer hover:text-indigo-300 transition-colors uppercase tracking-widest">
                  <Lock size={12} /> {t("membership.upgradeHint")}
                </span>
              ) : (
                <span className="text-xl font-black text-zinc-600 z-10">—</span>
              )}
               {/* Background chart trace decoration */}
               <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transition-transform group-hover:scale-110 group-hover:opacity-20">
                 <svg width="80" height="40" viewBox="0 0 80 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                   <path d="M0 40C10 35 20 10 30 15C40 20 45 5 55 10C65 15 70 5 80 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                   <path d="M0 40C10 35 20 10 30 15C40 20 45 5 55 10C65 15 70 5 80 0L80 40H0Z" fill="currentColor"/>
                 </svg>
               </div>
            </div>

            {/* New signals count */}
            <div className="flex flex-col px-5 py-4 rounded-xl bg-bg-surface border border-border shadow-inner justify-center group">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Activity size={12}/>{t("timeline.title")}</span>
              <span className="text-xl font-black text-white tracking-tight group-hover:text-indigo-400 transition-colors flex items-end">
                {signals?.total ?? 0}
                <span className="text-[10px] font-bold font-mono text-zinc-500 ml-1.5 tracking-widest mb-1.5 uppercase opacity-80">{t("signalsGenerated")}</span>
              </span>
            </div>

            {/* Last update */}
            <div className="flex flex-col px-5 py-4 rounded-xl bg-bg-surface border border-border shadow-inner justify-center">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Clock size={12}/>{t("heroLastUpdate")}</span>
              <span className="text-sm font-bold text-zinc-300 flex items-center gap-2">
                {relativeTime(heroStats.latest, t) || "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Zone 2: Symbol Signal Cards ── */}
      {sortedSymbols.length === 0 ? (
        <div className="rounded-2xl border border-border border-dashed bg-bg-surface/30 p-16 text-center">
          <Target size={40} className="text-zinc-600 mx-auto mb-4" />
          <p className="text-base font-bold text-zinc-400">{t("noSignalsData")}</p>
          <p className="text-sm font-medium text-zinc-500 mt-2">{t("enablePairsInAdmin")}</p>
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
          <div className="card bg-bg-surface border border-border rounded-xl flex flex-col h-[420px]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-indigo-400" />
                <span className="text-sm font-bold text-white tracking-widest">{t("timeline.title")}</span>
              </div>
              <Link
                href={`/${locale}/consensus`}
                className="text-xs font-medium text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                {t("goConsensus")} <ChevronRight size={12} />
              </Link>
            </div>
            <div className="p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-bg-elevated flex-1">
              {!signals?.signals?.length ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">{t("timeline.empty")}</div>
              ) : (
                <div className="space-y-4">
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
          <div className="card bg-bg-surface border border-border rounded-xl flex flex-col h-[420px]">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2 shrink-0">
              <Target size={14} className="text-amber-400" />
              <span className="text-sm font-bold text-white tracking-widest">{t("insights.title")}</span>
            </div>
            <div className="p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-bg-elevated flex-1">
              {!insights?.insights?.length ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">{t("insights.empty")}</div>
              ) : (
                <div className="space-y-3">
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
        ? "bg-bull"
        : "bg-bear"
      : conf >= 50
        ? "bg-warn"
        : conf >= 30
          ? "bg-info"
          : "bg-zinc-600";

  const accentBorder = isLong
    ? "border-l-bull"
    : isShort
      ? "border-l-bear"
      : "border-l-zinc-600";

  return (
    <Link
      href={`/${locale}/consensus?symbol=${s.symbol}`}
      className={`group relative flex flex-col p-6 rounded-2xl border border-border bg-bg-surface hover:bg-bg-elevated hover:border-hover transition-all shadow-inner border-l-[4px] ${accentBorder}`}
    >
      {/* Row 1: Symbol + Price + Direction badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-border flex items-center justify-center text-base font-black font-mono text-zinc-300 shadow-inner group-hover:text-white transition-colors">
            {s.symbol.substring(0, 1)}
          </div>
          <div>
            <span className="text-lg font-black text-white tracking-tight group-hover:text-indigo-400 transition-colors block leading-none">
              {s.display_name || s.symbol.replace("USDT", "")}
            </span>
            <span className="text-xs font-mono font-bold text-zinc-500 group-hover:text-zinc-400 transition-colors mt-1 block">
              {formatPrice(s.latest_price)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black font-mono uppercase tracking-widest ${
              isLong
                ? "bg-bull/10 text-bull shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                : isShort
                  ? "bg-bear/10 text-bear shadow-[0_0_8px_rgba(239,68,68,0.2)]"
                  : "bg-bg-elevated text-zinc-400"
            }`}
          >
            {isLong && <TrendingUp size={12} className="inline mr-1" strokeWidth={3}/>}
            {isShort && <TrendingDown size={12} className="inline mr-1" strokeWidth={3}/>}
            {!isLong && !isShort && <Minus size={12} className="inline mr-1" strokeWidth={3}/>}
            {t(`direction.${s.direction || "neutral"}`)}
          </span>
        </div>
      </div>

      {/* Row 2: Confidence bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 rounded-full bg-bg-elevated border border-border overflow-hidden shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
            style={{ width: `${Math.min(conf, 100)}%` }}
          />
        </div>
        <span className={`text-[15px] font-black font-mono tabular-nums min-w-[50px] text-right tracking-tight ${conf >= 70 ? (isLong ? "text-bull" : "text-bear") : "text-zinc-400"}`}>
          {conf}%
        </span>
      </div>

      {/* Row 3: Strategy (blurred for free users) */}
      {s.direction !== "neutral" && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs mb-3">
          {s.entry_low && s.entry_high && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{t("entryRange")}</span>
              <span className={canSeeStrategy ? "text-zinc-200 font-bold font-mono tracking-tight" : "text-zinc-600 blur-[4px] select-none font-bold font-mono"}>
                {canSeeStrategy ? formatPrice(s.entry_low) : blurPrice(s.entry_low)} <span className="text-zinc-600 font-normal mx-0.5">-</span> {canSeeStrategy ? formatPrice(s.entry_high) : blurPrice(s.entry_high)}
              </span>
            </div>
          )}
          {s.stop_loss && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{t("stopLoss")}</span>
              <span className={canSeeStrategy ? "text-bear font-bold font-mono tracking-tight" : "text-zinc-600 blur-[4px] select-none font-bold font-mono"}>
                {canSeeStrategy ? formatPrice(s.stop_loss) : blurPrice(s.stop_loss)}
              </span>
            </div>
          )}
          {s.targets?.[0] && (
             <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{t("target")}</span>
              <span className={canSeeStrategy ? "text-bull font-bold font-mono tracking-tight" : "text-zinc-600 blur-[4px] select-none font-bold font-mono"}>
                {canSeeStrategy ? formatPrice(s.targets[0]) : blurPrice(s.targets[0])}
              </span>
            </div>
          )}
          {s.risk_reward_ratio > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{t("riskReward")}</span>
              <span className="text-indigo-400 font-black font-mono tracking-tight">1:{s.risk_reward_ratio.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}

      {/* Row 4: Reasoning + Dealer + Time */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
        <div className="flex-1 text-sm font-medium text-zinc-400 line-clamp-1 pr-4">
          {s.reasoning ? s.reasoning.slice(0, 60) : ""}
          {s.dealer_intent && s.dealer_intent !== "unknown" && (
            <span className="text-amber-400 ml-2 font-bold tracking-tight">🎯 {s.dealer_intent}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {s.strategy_updated_at && (
            <span className="text-[10px] text-zinc-500 font-mono font-bold tracking-widest uppercase">
              <Clock size={12} className="inline mr-1" />
              {relativeTime(s.strategy_updated_at, t)}
            </span>
          )}
          <ChevronRight size={16} className="text-zinc-600 group-hover:text-white transition-colors" />
        </div>
      </div>

      {/* Free user upgrade hint overlay */}
      {!canSeeStrategy && s.direction !== "neutral" && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-surface/90 backdrop-blur-sm border border-border px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2 shadow-lg">
          <Lock size={14} /> {t("membership.upgradeHint")}
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
    <div className="flex items-start gap-4 group">
      <span className="text-[10px] font-black font-mono text-zinc-500 w-10 shrink-0 pt-1.5 text-right tracking-[0.05em]">{time}</span>
      <div className={`p-2 rounded-xl ${info.bg} shrink-0 border border-transparent group-hover:border-currentColor transition-colors`}>
        <Icon size={16} className={info.color} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm font-bold text-zinc-200 leading-relaxed tracking-tight group-hover:text-white transition-colors">{sig.message}</p>
        {sig.detail && <p className="text-xs font-medium text-zinc-500 mt-1">{sig.detail}</p>}
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
    <div className="flex items-start gap-4 p-4 rounded-xl bg-bg-surface shadow-inner border border-transparent hover:border-border transition-colors group">
      <div className={`p-2.5 rounded-lg ${bgColor} shrink-0 group-hover:scale-110 group-hover:shadow-[0_0_12px_currentColor] transition-all`}>
        <Icon size={18} className={textColor} />
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-[10px] font-black font-mono uppercase tracking-widest ${textColor}`}>{typeLabel}</span>
        <p className="text-sm font-medium text-zinc-300 mt-1.5 leading-relaxed line-clamp-2">{item.text}</p>
      </div>
    </div>
  );
}
