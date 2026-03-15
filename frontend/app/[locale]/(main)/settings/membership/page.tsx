"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { fetchCurrentUser } from "@/lib/api/auth";
import { usePaymentStatusSync } from "@/lib/hooks/usePaymentStatusSync";
import {
  createPayment,
  type PaymentInfo,
  type PaymentNetwork,
  type DurationMonths,
} from "@/lib/api/payment";
import {
  fetchPlans,
  fetchFreeTrialStatus,
  claimFreeTrial,
  type PlansResponse,
  type FreeTrialStatus,
} from "@/lib/api/membership";
import type { UserInfo } from "@/lib/api/auth";
import { EmptyPayments } from "@/components/ui/EmptyState";
import { STATUS_STYLES, getPaymentStatusMessage } from "@/lib/payment-status";

// Level names resolved via t('currentStatus.levels.X') — kept as key map for PaymentHistory
const LEVEL_NAME_KEYS: Record<number, string> = { 0: "0", 1: "1", 2: "2" };
const LEVEL_COLORS: Record<number, string> = {
  0: "text-zinc-400",
  1: "text-accent",
  2: "text-[#F5A623]",
};
const LEVEL_BORDER: Record<number, string> = {
  0: "border-zinc-500/30",
  1: "border-accent/40",
  2: "border-[#F5A623]/40",
};
const LEVEL_GLOW: Record<number, string> = {
  0: "",
  1: "shadow-[0_0_20px_rgba(42,109,255,0.15)]",
  2: "shadow-[0_0_20px_rgba(245,166,35,0.15)]",
};

const NETWORKS: PaymentNetwork[] = ["TRC-20", "ERC-20", "BEP-20"];

const PAYMENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

interface PlanFeature {
  name: string;
  free: string;
  pro: string;
  flagship: string;
}

// PLAN_FEATURES is a static fallback only used when API doesn't return features.
// The actual display data comes from plansData.features via API.
const PLAN_FEATURES: PlanFeature[] = [];

interface CurrentStatusCardProps {
  user: UserInfo;
}

type MembershipTranslateValues = Record<string, string | number | Date>;
type MembershipTranslator = (key: string, values?: MembershipTranslateValues) => string;

function CurrentStatusCard({ user, t }: CurrentStatusCardProps & { t: MembershipTranslator }) {
  const locale = useLocale();
  const level = user.membership_level;
  const name = t(`currentStatus.levels.${level}`);
  const color = LEVEL_COLORS[level] ?? "text-zinc-500";

  const expiresAt = user.membership_expires_at;
  let expiryInfo: { dateStr: string; daysLeft: number } | null = null;
  if (level > 0 && expiresAt) {
    const expDate = new Date(expiresAt);
    const diffMs = expDate.getTime() - Date.now();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysLeft > 0) {
      expiryInfo = {
        dateStr: expDate.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" }),
        daysLeft,
      };
    }
  }

  return (
    <div className="relative bg-black border border-white/[0.05] p-6 overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${level === 2 ? 'bg-[#F5A623]' : level === 1 ? 'bg-indigo-500' : 'bg-zinc-600'}`} />
      <div className="flex items-center justify-between border-b border-white/[0.05] pb-4 mb-4">
        <p className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500">{t('currentStatus.title')}</p>
        <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">{user.email}</span>
      </div>
      <div className="flex items-end gap-4 mt-2">
        <span className={`text-4xl font-black font-mono tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] ${color}`}>{name}</span>
        {level > 0 ? (
           <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 border ${level === 2 ? 'border-[#F5A623]/30 text-[#F5A623] bg-[#F5A623]/10' : 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'}`}>生效中</span>
        ) : (
           <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 border border-zinc-500/30 text-zinc-400 bg-zinc-500/10">未激活</span>
        )}
      </div>
      {expiryInfo && (
        <div className={`mt-6 flex items-center justify-between p-4 border border-white/[0.05] bg-white/[0.02] text-[10px] font-mono font-bold uppercase tracking-widest ${expiryInfo.daysLeft <= 7 ? "text-red-400 border-red-500/20 bg-red-500/5" : expiryInfo.daysLeft <= 30 ? "text-amber-400" : "text-zinc-400"}`}>
          <div className="flex items-center gap-3">
            {expiryInfo.daysLeft <= 7 && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full bg-red-400 opacity-75"/>
                <span className="relative inline-flex h-2 w-2 bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]"/>
              </span>
            )}
            <span>{t('currentStatus.expiresAt', { date: expiryInfo.dateStr })}</span>
          </div>
          <span className="text-zinc-500">{t('currentStatus.daysLeft', { count: expiryInfo.daysLeft })}</span>
        </div>
      )}
    </div>
  );
}

interface PlanComparisonTableProps {
  plansData: PlansResponse | undefined;
}

function PlanComparisonTable({ plansData, t }: PlanComparisonTableProps & { t: MembershipTranslator }) {
  const features = plansData?.features ?? PLAN_FEATURES;
  const proPrice = plansData?.plans?.find((p) => p.plan === 1)?.price_monthly ?? 99;
  const flagshipPrice = plansData?.plans?.find((p) => p.plan === 2)?.price_monthly ?? 299;

  return (
    <div className="relative bg-black border border-white/[0.05] p-6 lg:p-8 mt-4 overflow-hidden">
      <div className="absolute top-0 right-0 w-8 h-[1px] bg-white/[0.2]" />
      <p className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500 mb-6">{t('planComparison.title')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-white/[0.1]">
              <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">{t('planComparison.feature')}</th>
              <th className="pb-4 text-center text-[10px] font-bold text-zinc-500 tracking-widest uppercase">{t('planComparison.free')} <br/><span className="text-[9px] text-zinc-600">$0</span></th>
              <th className="pb-4 text-center text-[10px] font-bold text-indigo-400 tracking-widest uppercase">{t('planComparison.pro')} <br/><span className="text-[9px] text-indigo-500/70">${proPrice}/{t('planSelection.perMonth')}</span></th>
              <th className="pb-4 text-center text-[10px] font-bold text-[#F5A623] tracking-widest uppercase">{t('planComparison.flagship')} <br/><span className="text-[9px] text-[#F5A623]/70">${flagshipPrice}/{t('planSelection.perMonth')}</span></th>
            </tr>
          </thead>
          <tbody>
            {features.map((f, i) => (
              <tr key={f.name} className={`border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors ${i%2===0?'bg-white/[0.01]':''}`}>
                <td className="py-4 text-[11px] text-zinc-400 pl-2 uppercase tracking-wider">{f.name}</td>
                <td className="py-4 text-center text-[10px] text-zinc-600 uppercase">{f.free}</td>
                <td className="py-4 text-center text-[10px] text-zinc-300 uppercase">{f.pro}</td>
                <td className="py-4 text-center text-[10px] text-white font-bold uppercase">{f.flagship}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: 1 | 2;
  name: string;
  monthlyPrice: number;
  totalPrice: number;
  durationMonths: DurationMonths;
  color: string;
  borderColor: string;
  glow: string;
  selected: boolean;
  onSelect: () => void;
}

const DURATION_LABEL_KEYS: Record<DurationMonths, string> = {
  1: "perMonth",
  3: "perQuarter",
  12: "perYear",
};

function PlanCard({ plan, name, monthlyPrice, totalPrice, durationMonths, color, borderColor, glow, selected, onSelect }: PlanCardProps) {
  const avgMonthly = durationMonths > 1 ? Math.round(totalPrice / durationMonths * 100) / 100 : monthlyPrice;
  const hasSaving = durationMonths > 1 && avgMonthly < monthlyPrice;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative w-full border p-6 text-left transition-all duration-300 overflow-hidden group
        ${selected ? `${borderColor} ${glow} bg-${plan === 2 ? '[#F5A623]' : 'indigo-500'}/10` : "border-white/[0.05] bg-black/40 hover:border-white/[0.2] hover:bg-white/[0.02]"}
      `}
    >
      <div className={`absolute top-0 right-0 p-2 font-mono text-[8px] uppercase transition-opacity ${selected ? `opacity-100 ${color}` : 'opacity-20 group-hover:opacity-100 group-hover:text-zinc-500'}`}>方案 {plan}</div>
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xl font-black font-mono tracking-widest uppercase ${color} drop-shadow-[0_0_10px_currentColor]`}>{name}</span>
        {selected && (
          <span className="flex h-2 w-2 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full opacity-75 bg-current ${color}`}/>
            <span className={`relative inline-flex h-2 w-2 bg-current ${color}`}/>
          </span>
        )}
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className="font-mono text-3xl font-black text-white tracking-tighter">${totalPrice}</span>
        <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest border-l border-white/[0.1] pl-2 pb-1.5">{DURATION_LABEL_KEYS[durationMonths]}</span>
      </div>
      {hasSaving && (
        <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/[0.05]">
          <span className="text-[10px] font-mono text-zinc-600 line-through tracking-wider">原价: ${monthlyPrice}/月</span>
          <span className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
            省 {Math.round((1 - avgMonthly / monthlyPrice) * 100)}%
          </span>
        </div>
      )}
    </button>
  );
}

function useCountdown(targetMs: number | null): string {
  const [remaining, setRemaining] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (targetMs === null) {
      setRemaining("");
      return;
    }

    const tick = () => {
      const diff = targetMs - Date.now();
      if (diff <= 0) {
        setRemaining("00:00");
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      const mins = Math.floor(diff / 60_000);
      const secs = Math.floor((diff % 60_000) / 1000);
      setRemaining(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetMs]);

  return remaining;
}

interface PaymentDisplayProps {
  payment: PaymentInfo;
  expiresAt: number;
}

function PaymentDisplay({ payment, expiresAt }: PaymentDisplayProps) {
  const t = useTranslations('settings.membership');
  const countdown = useCountdown(expiresAt);
  const [copied, setCopied] = useState(false);
  const isExpired = countdown === "00:00";
  const statusStyle = STATUS_STYLES[payment.status] ?? STATUS_STYLES.pending;
  const statusMessage = getPaymentStatusMessage(
    payment.status,
    payment.status_reason,
    isExpired
  );

  const handleCopy = useCallback(async () => {
    if (!payment.pay_address) return;
    try {
      await navigator.clipboard.writeText(payment.pay_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error: unknown) {
      console.error("Copy payment address failed", error);
    }
  }, [payment.pay_address]);

  return (
    <div className="relative bg-black border border-white/[0.05] p-6 lg:p-8 mt-6">
      <div className={`absolute top-0 right-0 w-1/3 h-[1px] ${payment.status === 'pending' ? 'bg-[#F5A623]/50' : 'bg-white/[0.1]'}`} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/[0.05]">
        <p className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500">{t('payment.info.title')}</p>
        <div className="flex items-center gap-4">
          {payment.status === "pending" && !isExpired ? (
            <div className="flex items-center gap-3 border border-[#F5A623]/30 px-3 py-1 bg-[#F5A623]/5">
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full bg-[#F5A623] opacity-75"/>
                <span className="relative inline-flex h-1.5 w-1.5 bg-[#F5A623]"/>
              </span>
              <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest">{t('payment.info.timeRemaining')}</span>
              <span className="font-mono text-sm font-black text-[#F5A623] drop-shadow-[0_0_8px_rgba(245,166,35,0.4)]">{countdown}</span>
            </div>
          ) : (
            <span className={`px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] border ${payment.status === "pending" ? "border-zinc-500/30 text-zinc-500 bg-zinc-500/10" : `${statusStyle.bg} ${statusStyle.text} border-current/30`}`}>
              {payment.status === "pending" ? t('payment.info.expired') : statusStyle.label}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <p className="text-[9px] font-bold font-mono uppercase tracking-[0.3em] text-zinc-600 mb-2">{t('payment.info.amount')}</p>
          <p className="font-mono text-3xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            {payment.pay_amount} <span className="text-sm text-zinc-500 font-bold ml-1">{payment.pay_currency?.toUpperCase()}</span>
          </p>
        </div>

        <div>
          <p className="text-[9px] font-bold font-mono uppercase tracking-[0.3em] text-zinc-600 mb-2">{t('payment.info.address')}</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <code className="block flex-1 border border-white/[0.1] bg-white/[0.02] px-4 py-3 font-mono text-[10px] text-indigo-300 break-all text-center sm:text-left">
              {payment.pay_address}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className={`w-full sm:w-auto shrink-0 border px-6 py-3 font-mono text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-white/5 ${copied ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-white/[0.1] text-zinc-400'}`}
            >
              {copied ? t('payment.info.copied') : t('payment.info.copy')}
            </button>
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex items-center justify-center sm:justify-start gap-3 pt-6 border-t border-white/[0.05]">
         <span className={`text-[10px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 ${payment.status === "pending" && isExpired ? "text-zinc-500" : statusStyle.text}`}>
             <span className="text-zinc-600">状态:</span> {statusMessage}
         </span>
      </div>
    </div>
  );
}

interface PaymentHistoryProps {
  payments: PaymentInfo[];
}

function PaymentHistory({ payments }: PaymentHistoryProps) {
  const t = useTranslations('settings.membership');
  if (payments.length === 0) {
    return (
      <div className="relative bg-black border border-white/[0.05] p-20 text-center overflow-hidden">
        <EmptyPayments />
      </div>
    );
  }

  return (
    <div className="relative bg-black border border-white/[0.05] p-6 lg:p-8 overflow-hidden">
      <div className="absolute top-0 right-0 w-8 h-[1px] bg-white/[0.2]" />
      <p className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500 mb-6">{t('history.title')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-white/[0.1]">
              <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.date')}</th>
              <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.plan')}</th>
              <th className="pb-4 text-right text-[10px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.amount')}</th>
              <th className="pb-4 text-left pl-4 text-[10px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.network')}</th>
              <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => {
              const st = STATUS_STYLES[p.status] ?? STATUS_STYLES.pending;
              return (
                <tr key={p.id} className={`border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors ${i%2===0?'bg-white/[0.01]':''}`}>
                  <td className="py-4 font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    {p.created_at ? formatDate(p.created_at) : "—"}
                  </td>
                  <td className="py-4 text-[11px] text-zinc-300 uppercase tracking-wider font-bold">
                    {t(`currentStatus.levels.${LEVEL_NAME_KEYS[p.plan] ?? p.plan}`)}
                  </td>
                  <td className="py-4 text-right font-mono text-[11px] font-black text-white">
                    ${p.amount_usd}
                  </td>
                  <td className="py-4 text-[10px] text-zinc-500 pl-4 uppercase tracking-widest">
                    {p.network ?? "—"}
                  </td>
                  <td className="py-4">
                    <span className={`inline-flex px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] border ${st.text} ${st.bg} border-current/30`}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FreeTrialCard() {
  const t = useTranslations('settings.membership');
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: trial } = useQuery<FreeTrialStatus>({
    queryKey: ["freeTrial"],
    queryFn: fetchFreeTrialStatus,
  });

  const handleClaim = useCallback(async () => {
    if (claiming || !trial?.enabled || trial?.claimed) return;
    setClaiming(true);
    setError(null);
    try {
      await claimFreeTrial();
      queryClient.invalidateQueries({ queryKey: ["freeTrial"] });
      queryClient.invalidateQueries({ queryKey: ["analysis-quota"] });
    } catch (error: unknown) {
      console.error("Claim free trial failed", error);
      setError(error instanceof Error ? error.message : "领取失败");
    } finally {
      setClaiming(false);
    }
  }, [claiming, queryClient, trial?.claimed, trial?.enabled]);

  if (!trial?.enabled) return null;

  return (
    <div className="relative bg-black border border-indigo-500/20 p-6 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-indigo-500/50" />
      <div className="absolute top-0 right-0 w-8 h-[1px] bg-indigo-500/50" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-black font-mono uppercase tracking-[0.3em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] mb-2">{t('freeTrial.title')}</p>
          <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">
            {trial.claimed
              ? trial.remaining > 0
                ? t('freeTrial.remaining', { count: trial.remaining })
                : t('freeTrial.exhausted')
              : t('freeTrial.description', { count: trial.total })}
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          {!trial.claimed && (
            <button
              type="button"
              onClick={handleClaim}
              disabled={claiming}
              className="border border-indigo-500/40 bg-indigo-600/90 px-6 py-2.5 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-white hover:bg-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] disabled:opacity-50 transition-all duration-300"
            >
              {claiming ? t('freeTrial.claiming') : t('freeTrial.claim')}
            </button>
          )}
          {trial.claimed && trial.remaining > 0 && (
            <span className="inline-block border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[10px] font-black font-mono tracking-[0.2em] text-emerald-400 uppercase">
              {trial.remaining} {t('freeTrial.claimed')}
            </span>
          )}
          {trial.claimed && trial.remaining === 0 && (
            <span className="inline-block border border-zinc-500/30 bg-zinc-500/10 px-4 py-2 text-[10px] font-black font-mono tracking-[0.2em] text-zinc-500 uppercase">
              {t('freeTrial.used')}
            </span>
          )}
        </div>
      </div>
      {error && <p className="mt-4 text-[10px] font-mono text-red-400 tracking-widest uppercase">{error}</p>}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MembershipPage() {
  const t = useTranslations('settings.membership');
  const [selectedPlan, setSelectedPlan] = useState<1 | 2>(1);
  const [selectedDuration, setSelectedDuration] = useState<DurationMonths>(1);
  const [selectedNetwork, setSelectedNetwork] = useState<PaymentNetwork>("TRC-20");
  const [currentPayment, setCurrentPayment] = useState<PaymentInfo | null>(null);
  const [paymentExpiresAt, setPaymentExpiresAt] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const completedSyncRef = useRef(false);

  const { data: user } = useQuery<UserInfo>({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
  });

  const { data: plansData } = useQuery<PlansResponse>({
    queryKey: ["membershipPlans"],
    queryFn: fetchPlans,
  });

  const { history, currentPayment: syncedCurrentPayment } = usePaymentStatusSync(currentPayment);

  useEffect(() => {
    if (!currentPayment || !syncedCurrentPayment) {
      return;
    }
    if (
      currentPayment.payment_id === syncedCurrentPayment.payment_id && (
        currentPayment.status !== syncedCurrentPayment.status ||
        currentPayment.status_reason !== syncedCurrentPayment.status_reason ||
        currentPayment.provider_status !== syncedCurrentPayment.provider_status ||
        currentPayment.pay_address !== syncedCurrentPayment.pay_address ||
        currentPayment.pay_amount !== syncedCurrentPayment.pay_amount ||
        currentPayment.pay_currency !== syncedCurrentPayment.pay_currency
      )
    ) {
      setCurrentPayment(syncedCurrentPayment);
    }
  }, [currentPayment, syncedCurrentPayment]);

  useEffect(() => {
    if (currentPayment?.status === "completed" && !completedSyncRef.current) {
      completedSyncRef.current = true;
      void queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    }
    if (currentPayment?.status !== "completed") {
      completedSyncRef.current = false;
    }
  }, [currentPayment?.status, queryClient]);

  const proPlan = plansData?.plans?.find((p) => p.plan === 1);
  const flagshipPlan = plansData?.plans?.find((p) => p.plan === 2);
  const proPrice = proPlan?.price_monthly ?? 99;
  const flagshipPrice = flagshipPlan?.price_monthly ?? 299;

  const getPlanTotal = (plan: typeof proPlan, dur: DurationMonths): number => {
    if (!plan) return 0;
    if (dur === 3) return plan.price_quarterly;
    if (dur === 12) return plan.price_yearly;
    return plan.price_monthly;
  };

  const proTotal = getPlanTotal(proPlan, selectedDuration);
  const flagshipTotal = getPlanTotal(flagshipPlan, selectedDuration);
  const selectedTotal = selectedPlan === 1 ? proTotal : flagshipTotal;

  const handleCreatePayment = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const payment = await createPayment({
        plan: selectedPlan,
        network: selectedNetwork,
        duration_months: selectedDuration,
      });
      setCurrentPayment(payment);
      setPaymentExpiresAt(Date.now() + PAYMENT_TIMEOUT_MS);
      void queryClient.invalidateQueries({ queryKey: ["paymentHistory"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建支付失败";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }, [queryClient, selectedPlan, selectedNetwork, selectedDuration]);

  return (
    <div className="flex flex-col gap-10 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto min-h-screen">
      <div className="pb-6 border-b border-white/[0.05]">
        <h1 className="text-3xl font-black text-white font-mono tracking-widest uppercase mb-2">
           {t('title')}
        </h1>
        <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.3em]">会员状态 & 升级</p>
      </div>

      {user && <CurrentStatusCard user={user} t={t} />}

      <FreeTrialCard />

      <PlanComparisonTable plansData={plansData} t={t} />

      <div className="relative bg-black border border-white/[0.05] p-6 lg:p-8 overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 pb-6 border-b border-white/[0.05]">
          <p className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500">{t('planSelection.title')}</p>

          <div className="inline-flex bg-black border border-white/[0.1] p-1 shadow-inner">
            {([1, 3, 12] as DurationMonths[]).map((dur) => {
              const labelKeys: Record<DurationMonths, string> = { 1: "monthly", 3: "quarterly", 12: "yearly" };
              const badgeKeys: Record<DurationMonths, string | null> = { 1: null, 3: "quarterly", 12: "yearly" };
              return (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setSelectedDuration(dur)}
                  className={`relative px-6 py-2.5 text-[10px] font-black font-mono uppercase tracking-widest transition-all duration-300 ${
                    selectedDuration === dur
                      ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                      : "text-zinc-500 hover:text-white"
                  }`}
                >
                  {t(`planSelection.duration.${labelKeys[dur]}`)}
                  {badgeKeys[dur] && (
                    <span className="absolute -top-2 -right-2 text-[8px] font-bold text-bull bg-[var(--color-bull)]/20 border border-[var(--color-bull)]/40 px-1.5 py-0.5 shadow-sm">
                      {t(`planSelection.duration.discount.${badgeKeys[dur]}`)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <PlanCard
            plan={1}
            name={t('planSelection.plans.pro')}
            monthlyPrice={proPrice}
            totalPrice={proTotal}
            durationMonths={selectedDuration}
            color="text-indigo-400"
            borderColor="border-indigo-500/50"
            glow={LEVEL_GLOW[1]}
            selected={selectedPlan === 1}
            onSelect={() => setSelectedPlan(1)}
          />
          <PlanCard
            plan={2}
            name={t('planSelection.plans.flagship')}
            monthlyPrice={flagshipPrice}
            totalPrice={flagshipTotal}
            durationMonths={selectedDuration}
            color="text-[#F5A623]"
            borderColor={LEVEL_BORDER[2]}
            glow={LEVEL_GLOW[2]}
            selected={selectedPlan === 2}
            onSelect={() => setSelectedPlan(2)}
          />
        </div>

        <div className="mt-10 pt-8 border-t border-white/[0.05]">
          <p className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500 mb-4">{t('payment.network')}</p>
          <div className="flex flex-wrap gap-4">
            {NETWORKS.map((net) => (
              <button
                key={net}
                type="button"
                onClick={() => setSelectedNetwork(net)}
                className={`
                  border px-6 py-3 text-[11px] font-black font-mono uppercase tracking-widest transition-all duration-300
                  ${
                    selectedNetwork === net
                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                      : "bg-black text-zinc-600 border-white/[0.1] hover:border-white/[0.3] hover:text-zinc-400"
                  }
                `}
              >
                {net}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreatePayment}
          disabled={creating}
          className="mt-10 w-full border border-indigo-500/40 bg-indigo-600/90 px-8 py-5 text-sm font-black font-mono tracking-[0.2em] uppercase text-white transition-all duration-300 hover:bg-indigo-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] disabled:opacity-40 disabled:hover:bg-indigo-600"
        >
          {creating ? t('payment.creating') : `${t('payment.createButton', { amount: selectedTotal })}`}
        </button>

        {error && (
          <div className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-center">
             <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-400">{error}</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {syncedCurrentPayment && paymentExpiresAt && (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0}}>
             <PaymentDisplay payment={syncedCurrentPayment} expiresAt={paymentExpiresAt} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4">
        <PaymentHistory payments={history} />
      </div>
    </div>
  );
}
