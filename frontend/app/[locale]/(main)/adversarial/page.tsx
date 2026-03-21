"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import {
  Swords, RefreshCw, Shield, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Clock, CheckCircle2, AlertCircle, RotateCcw,
} from "lucide-react";

import { SymbolSelector } from "@/components/layout/SymbolSelector";
import { AdversarialRenderer } from "@/components/analysis/AdversarialRenderer";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";
import { authFetch } from "@/lib/api/auth";
import { localizeText } from "@/components/analysis/helpers";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/* ── Signal badge config ── */
const SIGNAL_MAP: Record<string, { label: string; icon: typeof TrendingUp; color: string; bg: string; border: string }> = {
  bullish:  { label: "看涨", icon: TrendingUp,   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  bearish:  { label: "看跌", icon: TrendingDown,  color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30" },
  neutral:  { label: "中性", icon: Minus,          color: "text-zinc-400",    bg: "bg-zinc-500/10",    border: "border-zinc-500/30" },
};

const STRATEGY_LABELS: Record<string, { label: string; color: string }> = {
  follow: { label: "跟随", color: "text-emerald-400" },
  defend: { label: "防御", color: "text-amber-400" },
  contra: { label: "逆向", color: "text-indigo-400" },
  wait:   { label: "观望", color: "text-zinc-400" },
};

const ALERT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  none:     { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/30" },
  low:      { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  medium:   { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  high:     { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  critical: { bg: "bg-red-600/20", text: "text-red-300", border: "border-red-500/50" },
};

interface DefenseData {
  symbol: string;
  adversarial: Record<string, unknown> | null;
  collusion: Record<string, unknown> | null;
  alert_level: string;
  consensus_ref?: { signal: string; confidence: number; divergence: number } | null;
}

export default function AdversarialPage() {
  const t = useTranslations("adversarial");
  const locale = useLocale();
  const { getState } = useFeatureFlags();
  const featureState = getState("adversarial") ?? "active";
  const { user } = useAuth();
  const userLevel = effectiveLevel(user);

  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || "BTCUSDT";
  const [symbol, setSymbol] = useState(initialSymbol);
  const [data, setData] = useState<DefenseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const fetchData = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/api/defense/latest?symbol=${encodeURIComponent(sym)}`);
      if (!res.ok) throw new Error(`请求失败: ${res.status}`);
      const json = await res.json();
      if (!json) {
        setData(null);
        setError("暂无分析数据，请等待系统自动分析");
        return;
      }
      setData(json);
      setUpdatedAt(new Date().toLocaleTimeString("zh-CN"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(symbol);
    const interval = setInterval(() => fetchData(symbol), 60_000);
    return () => clearInterval(interval);
  }, [symbol, fetchData]);

  // ── 旗舰专属功能，等级不足时显示升级引导 ───────────────
  if (userLevel < 2) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md w-full text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#F5A623]/10 border border-[#F5A623]/20 mx-auto mb-6">
            <Swords size={28} className="text-[#F5A623]" />
          </div>
          <h2 className="text-xl font-black font-mono uppercase tracking-widest text-white mb-3">
            AI 对抗推演
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-2">
            基于多模架构智能体对抗推演，识别主力操盘、合谋、逆空逼多信号。
          </p>
          <p className="text-xs text-zinc-600 font-mono mb-8">旗舰专属 · Flagship Only</p>
          <Link
            href={`/${locale}/settings/membership`}
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-[#F5A623] hover:bg-[#f0a010] text-black font-black font-mono uppercase tracking-widest text-sm py-3.5 transition-all shadow-[0_0_20px_rgba(245,166,35,0.25)] hover:shadow-[0_0_30px_rgba(245,166,35,0.4)]"
          >
            升级旗舰解锁
          </Link>
          <p className="mt-4 text-[10px] text-zinc-700 font-mono">当前等级：{['免费','专业','旗舰'][userLevel] ?? '免费'}</p>
        </div>
      </div>
    );
  }

  if (featureState !== "active") {
    return <MaintenancePlaceholder featureName="AI 对抗推演" />;
  }

  const adv = data?.adversarial;
  const rawData = adv?.raw_data as Record<string, unknown> | undefined;
  const signal = (adv?.signal as string) || "neutral";
  const confidence = typeof adv?.confidence === "number" ? adv.confidence : 0;
  const signalInfo = SIGNAL_MAP[signal] || SIGNAL_MAP.neutral;
  const SignalIcon = signalInfo.icon;
  const strategyType = (rawData?.strategy_type as string) || "wait";
  const strategyInfo = STRATEGY_LABELS[strategyType] || STRATEGY_LABELS.wait;
  const alertLevel = data?.alert_level || "none";
  const alertColor = ALERT_COLORS[alertLevel] || ALERT_COLORS.none;
  const keyFindings = (adv?.key_findings as string[]) || [];
  const reasoning = (adv?.reasoning as string) || "";

  return (
    <div className="mx-auto max-w-[1000px] px-4 md:px-8 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Swords size={20} className="text-red-500" />
            {t("title")}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <SymbolSelector value={symbol} onChange={setSymbol} allowedSymbols={["BTCUSDT", "ETHUSDT"]} />
          <button
            onClick={() => fetchData(symbol)}
            disabled={loading}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="card p-5 flex items-center gap-3 border-amber-500/20">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-zinc-300">{error}</p>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-32 border border-dashed border-white/[0.05] rounded-xl bg-white/[0.01]">
          <div className="relative flex h-10 w-10 mb-4 items-center justify-center">
            <div className="absolute inline-flex h-full w-full rounded-full bg-red-500/20 animate-ping" />
            <Swords size={20} className="text-red-500 relative z-10" />
          </div>
          <h3 className="text-lg font-mono text-red-400 uppercase tracking-widest">{t("loading")}</h3>
        </div>
      )}

      {/* ── P1-H: Consistency Banner ── */}
      {data && adv && data.consensus_ref && (() => {
        const cRef = data.consensus_ref;
        const advSignal = signal;  // bullish/bearish/neutral
        const cSignal = cRef.signal || "neutral";
        const isAligned = advSignal === cSignal;
        const isStrategyConflict = isAligned && strategyType === "wait";
        const isDirectionConflict = !isAligned && advSignal !== "neutral" && cSignal !== "neutral";

        let bannerBg: string, bannerBorder: string, bannerText: string, bannerIcon: React.ReactNode, bannerMsg: string;
        if (isDirectionConflict) {
          bannerBg = "bg-amber-500/10";
          bannerBorder = "border-amber-500/30";
          bannerText = "text-amber-400";
          bannerIcon = <AlertCircle size={16} className="text-amber-400 shrink-0" />;
          bannerMsg = t("consistencyDirectionConflict");
        } else if (isStrategyConflict) {
          bannerBg = "bg-sky-500/10";
          bannerBorder = "border-sky-500/30";
          bannerText = "text-sky-400";
          bannerIcon = <RotateCcw size={16} className="text-sky-400 shrink-0" />;
          bannerMsg = t("consistencyStrategyConflict");
        } else {
          bannerBg = "bg-emerald-500/10";
          bannerBorder = "border-emerald-500/30";
          bannerText = "text-emerald-400";
          bannerIcon = <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />;
          bannerMsg = t("consistencyAligned");
        }

        const SIGNAL_LABELS: Record<string, string> = {
          bullish: SIGNAL_MAP.bullish.label,
          bearish: SIGNAL_MAP.bearish.label,
          neutral: SIGNAL_MAP.neutral.label,
        };

        return (
          <div className={`card flex items-center gap-3 px-4 py-3 border ${bannerBorder} ${bannerBg}`}>
            {bannerIcon}
            <span className={`text-sm font-medium ${bannerText}`}>{bannerMsg}</span>
            <span className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
              <span>{t("consistencyConsensus")}: <span className="font-semibold text-zinc-300">{SIGNAL_LABELS[cSignal] || cSignal}</span></span>
              <span>{t("consistencyConfidence")}: <span className="font-mono text-zinc-300">{(cRef.confidence * 100).toFixed(0)}%</span></span>
            </span>
          </div>
        );
      })()}

      {/* ── Data Display ── */}
      {data && adv && (
        <div className="space-y-5">
          {/* ── Overview Strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Signal */}
            <div className="card p-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">{t("signal")}</span>
              <div className="flex items-center gap-2 mt-1">
                <SignalIcon size={16} className={signalInfo.color} />
                <span className={`text-base font-semibold ${signalInfo.color}`}>{signalInfo.label}</span>
              </div>
            </div>

            {/* Confidence */}
            <div className="card p-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">{t("confidence")}</span>
              <p className="text-base font-semibold text-white mt-1">{(confidence * 100).toFixed(0)}%</p>
            </div>

            {/* Strategy */}
            <div className="card p-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">{t("strategy")}</span>
              <p className={`text-base font-semibold mt-1 ${strategyInfo.color}`}>{strategyInfo.label}</p>
            </div>

            {/* Alert Level */}
            <div className="card p-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">{t("alertLevel")}</span>
              <div className="mt-1">
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${alertColor.bg} ${alertColor.text} border ${alertColor.border}`}>
                  <Shield size={12} />
                  {alertLevel === "none" ? "安全" : alertLevel.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* ── Core: AdversarialRenderer (原汁原味) ── */}
          {rawData && (
            <div className="card p-5">
              <AdversarialRenderer data={rawData as any} />
            </div>
          )}

          {/* ── Key Findings ── */}
          {keyFindings.length > 0 && (
            <div className="card p-5">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">{t("keyFindings")}</h3>
              <ul className="space-y-2">
                {keyFindings.map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-zinc-300 leading-relaxed">
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${signal === "bullish" ? "bg-emerald-400" : signal === "bearish" ? "bg-red-400" : "bg-zinc-500"}`} />
                    {localizeText(finding)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Reasoning ── */}
          {reasoning && (
            <div className="card p-5">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">{t("reasoning")}</h3>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{localizeText(reasoning)}</p>
            </div>
          )}

          {/* ── Last Updated ── */}
          {updatedAt && (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
              <Clock size={10} />
              {t("lastUpdated")}: {updatedAt} · {t("autoRefresh")}
            </div>
          )}
        </div>
      )}

      {/* ── No Data ── */}
      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-20">
          <Swords size={32} className="text-zinc-500 mb-3" />
          <p className="text-sm text-zinc-400">{t("emptyTitle")}</p>
          <p className="text-xs text-zinc-500 mt-1">{t("emptySubtitle")}</p>
        </div>
      )}
    </div>
  );
}
