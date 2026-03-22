"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Swords, TrendingUp, TrendingDown, Minus, Shield,
  AlertTriangle, Target, Clock, AlertCircle,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/* ── Types ── */
interface DefenseData {
  symbol: string;
  adversarial: Record<string, unknown> | null;
  alert_level: string;
  consensus_ref?: { signal: string; confidence: number } | null;
}

/* ── Config ── */
const SIGNAL_MAP: Record<string, { label: string; labelEn: string; icon: typeof TrendingUp; color: string; bg: string; border: string }> = {
  bullish:  { label: "看涨", labelEn: "Bullish",  icon: TrendingUp,   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  bearish:  { label: "看跌", labelEn: "Bearish",  icon: TrendingDown,  color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30" },
  neutral:  { label: "中性", labelEn: "Neutral",  icon: Minus,          color: "text-zinc-400",    bg: "bg-zinc-500/10",    border: "border-zinc-500/30" },
};

const STRATEGY_LABELS: Record<string, { label: string; labelEn: string; color: string }> = {
  follow: { label: "跟随", labelEn: "Follow", color: "text-emerald-400" },
  defend: { label: "防御", labelEn: "Defend", color: "text-amber-400" },
  contra: { label: "逆向", labelEn: "Contra", color: "text-indigo-400" },
  wait:   { label: "观望", labelEn: "Wait",   color: "text-zinc-400" },
};

const ALERT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  none:     { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/30" },
  low:      { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  medium:   { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  high:     { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  critical: { bg: "bg-red-600/20", text: "text-red-300", border: "border-red-500/50" },
};

const SYMBOLS = ["BTCUSDT", "ETHUSDT"] as const;
type SymbolKey = (typeof SYMBOLS)[number];

/* ── Helpers ── */
function localizeText(text: string): string {
  return text;
}

/* ── Public API fetch ── */
async function fetchPublicDefense(symbol: string) {
  const res = await fetch(`${API_BASE}/api/public/defense/latest?symbol=${symbol}`);
  if (!res.ok) throw new Error("Failed to load defense data");
  return res.json() as Promise<DefenseData | null>;
}

/* ── PredictedMove card ── */
function MoveCard({ move, isZh }: { move: Record<string, unknown>; isZh: boolean }) {
  const prob = typeof move.probability === "number" ? move.probability : 0;
  const action = (move.action as string) || "";
  const trapType = (move.trap_type as string) || "none";
  const timeframe = (move.timeframe as string) || "";
  const priceRange = (move.price_range as string) || "";

  return (
    <div className="border border-white/[0.05] bg-white/[0.01] p-5 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold font-mono text-white">{Math.round(prob * 100)}%</span>
        {trapType !== "none" && (
          <span className="text-[9px] uppercase font-black font-mono tracking-widest px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20">
            {trapType.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-3">{localizeText(action)}</p>
      <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
        {timeframe && (
          <span className="flex items-center gap-1">
            <Clock size={10} /> {timeframe}
          </span>
        )}
        {priceRange && <span>{priceRange}</span>}
      </div>
    </div>
  );
}

/* ── Zone display ── */
function ZoneSection({
  title,
  zones,
  color,
  icon: Icon,
}: {
  title: string;
  zones: string[];
  color: string;
  icon: typeof AlertTriangle;
}) {
  if (!zones || zones.length === 0) return null;
  return (
    <div>
      <h4 className={`flex items-center gap-2 text-[10px] uppercase font-black font-mono tracking-widest ${color} mb-3`}>
        <Icon size={12} />
        {title}
      </h4>
      <div className="space-y-2">
        {zones.map((z, i) => (
          <div key={i} className={`text-xs text-zinc-300 font-mono px-3 py-2 border-l-2 ${color.replace("text-", "border-")} bg-white/[0.01]`}>
            {localizeText(z)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Client Component ── */
export function AdversarialPublicClient({
  initialBtcData,
  initialEthData,
  locale,
}: {
  initialBtcData: DefenseData | null;
  initialEthData: DefenseData | null;
  locale: string;
}) {
  const isZh = locale.startsWith("zh");
  const [symbol, setSymbol] = useState<SymbolKey>("BTCUSDT");

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-defense", symbol],
    queryFn: () => fetchPublicDefense(symbol),
    initialData: symbol === "BTCUSDT" ? initialBtcData : symbol === "ETHUSDT" ? initialEthData : undefined,
    retry: 2,
    staleTime: 60_000,
  });

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
  const dealerIntent = (rawData?.dealer_intent as string) || "";
  const predictedMoves = (rawData?.predicted_moves as Record<string, unknown>[]) || [];
  const dangerZones = (rawData?.danger_zones as string[]) || [];
  const safeZones = (rawData?.safe_zones as string[]) || [];
  const opportunityZones = (rawData?.opportunity_zones as string[]) || [];
  const contraPlan = (rawData?.action_plan as string[]) || (rawData?.defense_plan as string[]) || [];

  return (
    <div className="space-y-6">
      {/* Symbol tabs */}
      <div className="flex items-center gap-3 px-2">
        {SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSymbol(s)}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-widest font-black transition-all border ${
              symbol === s
                ? "bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                : "text-zinc-500 hover:text-white border-white/[0.05] hover:border-white/10"
            }`}
          >
            {s.replace("USDT", "")}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/[0.06] border border-red-500/30 px-5 py-4">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-[11px] font-black font-mono tracking-widest uppercase text-red-300">
            {isZh ? "数据加载失败" : "Failed to load data"}
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && !data && (
        <div className="flex flex-col items-center justify-center py-32 border border-dashed border-white/[0.05] bg-white/[0.01]">
          <div className="relative flex h-10 w-10 mb-4 items-center justify-center">
            <div className="absolute inline-flex h-full w-full bg-red-500/20 animate-ping" />
            <Swords size={20} className="text-red-500 relative z-10" />
          </div>
          <h3 className="text-lg font-mono text-red-400 uppercase tracking-widest">
            {isZh ? "推演加载中..." : "Loading Analysis..."}
          </h3>
        </div>
      )}

      {/* Data */}
      {data && adv && (
        <div className="space-y-5">
          {/* Overview Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-white/[0.05] bg-black/40 p-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
                {isZh ? "信号方向" : "Signal"}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <SignalIcon size={16} className={signalInfo.color} />
                <span className={`text-base font-semibold ${signalInfo.color}`}>
                  {isZh ? signalInfo.label : signalInfo.labelEn}
                </span>
              </div>
            </div>

            <div className="border border-white/[0.05] bg-black/40 p-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
                {isZh ? "置信度" : "Confidence"}
              </span>
              <p className="text-base font-semibold text-white mt-1">{(confidence * 100).toFixed(0)}%</p>
            </div>

            <div className="border border-white/[0.05] bg-black/40 p-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
                {isZh ? "策略类型" : "Strategy"}
              </span>
              <p className={`text-base font-semibold mt-1 ${strategyInfo.color}`}>
                {isZh ? strategyInfo.label : strategyInfo.labelEn}
              </p>
            </div>

            <div className="border border-white/[0.05] bg-black/40 p-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
                {isZh ? "威胁等级" : "Alert Level"}
              </span>
              <div className="mt-1">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold ${alertColor.bg} ${alertColor.text} border ${alertColor.border}`}>
                  <Shield size={12} />
                  {alertLevel === "none" ? (isZh ? "安全" : "Safe") : alertLevel.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Dealer Intent */}
          {dealerIntent && (
            <div className="border-l-2 border-amber-500 bg-amber-500/[0.04] border border-amber-500/20 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-400" />
                <span className="text-[10px] uppercase font-black font-mono text-amber-400 tracking-widest">
                  {isZh ? "庄家核心意图 / Strategic Intent" : "Strategic Intent"}
                </span>
              </div>
              <p className="text-sm text-white font-bold leading-relaxed">
                {localizeText(dealerIntent)}
              </p>
            </div>
          )}

          {/* Predicted Moves */}
          {predictedMoves.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase font-black font-mono tracking-widest text-zinc-500 mb-4 px-1">
                {isZh ? "下阶段推演 / Tactical Forecast" : "Tactical Forecast"}
              </h3>
              <div className="space-y-3">
                {predictedMoves.slice(0, 3).map((move, idx) => (
                  <MoveCard key={idx} move={move} isZh={isZh} />
                ))}
              </div>
            </div>
          )}

          {/* Zones */}
          {(dangerZones.length > 0 || safeZones.length > 0 || opportunityZones.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <ZoneSection
                title={isZh ? "风险区 / Danger" : "Danger Zones"}
                zones={dangerZones}
                color="text-red-400"
                icon={AlertTriangle}
              />
              <ZoneSection
                title={isZh ? "安全区 / Safety" : "Safety Zones"}
                zones={safeZones}
                color="text-emerald-400"
                icon={Shield}
              />
              <ZoneSection
                title={isZh ? "机会区 / Opportunity" : "Opportunity Zones"}
                zones={opportunityZones}
                color="text-amber-400"
                icon={Target}
              />
            </div>
          )}

          {/* Contra Plan */}
          {contraPlan.length > 0 && (
            <div className="border border-white/[0.05] bg-black/40 p-5">
              <h3 className="flex items-center gap-2 text-[10px] uppercase font-black font-mono tracking-widest text-indigo-400 mb-4">
                <Swords size={12} />
                {isZh ? "逆向行动计划 / Contra Plan" : "Contra Plan"}
              </h3>
              <ul className="space-y-2">
                {contraPlan.slice(0, 4).map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-zinc-300 leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-indigo-400" />
                    {localizeText(step)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Blur overlay hint for upgrades */}
          <div className="relative border border-white/[0.05] bg-black/40 p-6 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/60 to-black z-10" />
            <div className="relative z-20 text-center py-8">
              <Swords size={28} className="text-zinc-400 mx-auto mb-4" />
              <p className="text-sm font-bold text-white mb-2">
                {isZh ? "更多详细分析需登录查看" : "Login to view full analysis"}
              </p>
              <p className="text-xs text-zinc-500 mb-4">
                {isZh ? "包含合谋检测、完整推理链、实时自动刷新" : "Includes collusion detection, full reasoning chain, real-time auto-refresh"}
              </p>
              <Link
                href={`/${locale}/login`}
                className="inline-flex items-center gap-2 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-red-400 hover:text-white border border-red-500/30 bg-red-500/10 px-6 py-3 transition-all hover:bg-red-500/20"
              >
                {isZh ? "登录查看完整分析" : "Login for Full Analysis"}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* No Data */}
      {!isLoading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/[0.05]">
          <Swords size={32} className="text-zinc-500 mb-3" />
          <p className="text-sm text-zinc-400">{isZh ? "暂无分析数据" : "No analysis data available"}</p>
          <p className="text-xs text-zinc-500 mt-1">{isZh ? "请等待系统自动分析" : "Please wait for system analysis"}</p>
        </div>
      )}
    </div>
  );
}
