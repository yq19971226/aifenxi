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

// Level names resolved via t('currentStatus.levels.X')
const LEVEL_NAME_KEYS: Record<number, string> = { 0: "0", 1: "1", 2: "2" };
const LEVEL_COLORS: Record<number, string> = {
  0: "text-zinc-400",
  1: "text-indigo-400",
  2: "text-[#F5A623]",
};

const NETWORKS: PaymentNetwork[] = ["TRC-20", "ERC-20", "BEP-20"];
const PAYMENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

interface PlanFeature {
  name: string;
  free: string;
  pro: string;
  flagship: string;
}

const PLAN_FEATURES: PlanFeature[] = [];

type MembershipTranslator = any; // (key: string, values?: any) => string;

// ==========================================
// UTILS
// ==========================================
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

// ==========================================
// COMPONENTS
// ==========================================

function AccountHeroStrip({ user, t }: { user: UserInfo; t: MembershipTranslator }) {
  const locale = useLocale();
  const level = user.membership_level;
  const name = t(`currentStatus.levels.${level}`);
  const color = LEVEL_COLORS[level] ?? "text-zinc-500";
  const isPremium = level > 0;

  const expiresAt = user.membership_expires_at;
  let expiryInfo: { dateStr: string; daysLeft: number } | null = null;
  if (isPremium && expiresAt) {
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

  // Trial Integration
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  const { data: trial } = useQuery<FreeTrialStatus>({
    queryKey: ["freeTrial"],
    queryFn: fetchFreeTrialStatus,
  });

  const handleClaim = useCallback(async () => {
    if (claiming || !trial?.enabled || trial?.claimed) return;
    setClaiming(true);
    setTrialError(null);
    try {
      await claimFreeTrial();
      queryClient.invalidateQueries({ queryKey: ["freeTrial"] });
      queryClient.invalidateQueries({ queryKey: ["analysis-quota"] });
    } catch (error: unknown) {
      console.error("Claim free trial failed", error);
      setTrialError(error instanceof Error ? error.message : "领取失败");
    } finally {
      setClaiming(false);
    }
  }, [claiming, queryClient, trial?.claimed, trial?.enabled]);

  return (
    <div className="relative w-full rounded-2xl bg-[#0a0a0a] border border-white/5 overflow-hidden group">
      {/* Background Ambience */}
      <div className={`absolute inset-0 opacity-10 blur-3xl transition-opacity duration-1000 ${level === 2 ? 'bg-[#F5A623]/20' : level === 1 ? 'bg-indigo-500/20' : 'bg-transparent'}`} />
      
      <div className="relative p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        
        {/* Left: User Identity */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">{t('currentStatus.title')}</span>
            <span className="text-xs font-mono text-zinc-400 bg-white/[0.03] px-2 py-0.5 rounded-sm border border-white/[0.05]">{user.email}</span>
          </div>
          
          <div className="flex items-end gap-4 mt-2">
            <h2 className={`text-4xl sm:text-5xl font-black font-mono tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] ${color}`}>
              {name}
            </h2>
            {isPremium ? (
              <div className="flex flex-col gap-1 pb-1">
                 <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-[4px] border border-current/30 ${color} bg-current/10 w-max`}>
                   {t('currentStatus.active')}
                 </span>
                 {expiryInfo && (
                   <span className={`text-[10px] font-mono whitespace-nowrap ${expiryInfo.daysLeft <= 7 ? "text-red-400 animate-pulse" : expiryInfo.daysLeft <= 30 ? "text-amber-400" : "text-zinc-500"}`}>
                     {t('currentStatus.daysLeftRaw', { count: expiryInfo.daysLeft })}
                   </span>
                 )}
              </div>
            ) : (
               <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-[4px] border border-zinc-500/30 text-zinc-500 bg-zinc-500/10 mb-1 w-max">
                 {t('currentStatus.inactive')}
               </span>
            )}
          </div>
        </div>

        {/* Right: Trial Card (if applicable and not premium) */}
        {!isPremium && trial?.enabled && (
          <div className="w-full md:w-auto shrink-0 bg-[#111] border border-indigo-500/20 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full pointer-events-none" />
            <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 justify-between">
              <div>
                <p className="text-xs font-black font-mono uppercase tracking-[0.2em] text-white mb-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                  {t('freeTrial.title')}
                </p>
                <p className="text-[10px] text-zinc-400 font-mono tracking-wider max-w-[200px]">
                  {trial.claimed
                    ? trial.remaining > 0
                      ? t('freeTrial.remaining', { count: trial.remaining })
                      : t('freeTrial.exhausted')
                    : t('freeTrial.description', { count: trial.total })}
                </p>
              </div>
              
              <div className="shrink-0 w-full sm:w-auto">
                {!trial.claimed ? (
                  <button
                    onClick={handleClaim}
                    disabled={claiming}
                    className="w-full sm:w-auto relative group overflow-hidden rounded-md border border-indigo-500/40 bg-indigo-600/20 px-6 py-2.5 text-[10px] font-bold font-mono tracking-[0.2em] text-white transition-all hover:bg-indigo-600/40"
                  >
                    <span className="relative z-10">{claiming ? t('freeTrial.claiming') : t('freeTrial.claim')}</span>
                    <div className="absolute inset-0 h-full w-full scale-0 rounded-md transition-all duration-300 group-hover:scale-100 group-hover:bg-indigo-500/30" />
                  </button>
                ) : (
                  <span className={`inline-flex items-center justify-center w-full sm:w-auto rounded-md border px-4 py-2.5 text-[10px] font-black font-mono tracking-[0.2em] uppercase ${trial.remaining > 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 bg-zinc-800/50 text-zinc-500'}`}>
                    {trial.remaining > 0 ? `${trial.remaining} ${t('freeTrial.claimed')}` : t('freeTrial.used')}
                  </span>
                )}
                {trialError && <p className="mt-2 text-[9px] text-red-400 text-center font-mono absolute -bottom-5 left-0 w-full">{trialError}</p>}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}


function PlanComparisonTable({ plansData, t }: { plansData: PlansResponse | undefined; t: MembershipTranslator }) {
  const features = plansData?.features ?? PLAN_FEATURES;
  const proPrice = plansData?.plans?.find((p) => p.plan === 1)?.price_monthly ?? 99;
  const flagshipPrice = plansData?.plans?.find((p) => p.plan === 2)?.price_monthly ?? 299;

  return (
    <div className="rounded-2xl bg-[#0a0a0a] border border-white/5 p-6 lg:p-8 mt-6">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-sm font-black text-white font-mono tracking-widest uppercase flex items-center gap-3">
           <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
           {t('planComparison.title')}
        </h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono whitespace-nowrap">
          <thead>
            <tr>
              <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase border-b border-white/[0.05]">{t('planComparison.feature')}</th>
              <th className="pb-4 text-center text-[10px] font-bold text-zinc-500 tracking-widest uppercase border-b border-white/[0.05]">
                <div className="mb-1">{t('planComparison.free')}</div>
                <div className="text-[9px] text-zinc-700 bg-white/5 inline-block px-2 py-0.5 rounded">$0 / M</div>
              </th>
              <th className="pb-4 text-center text-[10px] font-bold tracking-widest uppercase border-b border-white/[0.05]">
                <div className="mb-1 text-indigo-400">{t('planComparison.pro')}</div>
                <div className="text-[9px] text-indigo-300/70 bg-indigo-500/10 inline-block px-2 py-0.5 rounded border border-indigo-500/20">${proPrice} / M</div>
              </th>
              <th className="pb-4 text-center text-[10px] font-bold tracking-widest uppercase border-b border-white/[0.05]">
                <div className="mb-1 text-[#F5A623]">{t('planComparison.flagship')}</div>
                <div className="text-[9px] text-[#F5A623]/70 bg-[#F5A623]/10 inline-block px-2 py-0.5 rounded border border-[#F5A623]/20">${flagshipPrice} / M</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {features.map((f, i) => (
              <tr key={f.name} className="group transition-colors hover:bg-white/[0.02]">
                <td className={`py-4 text-[11px] text-zinc-400 pl-2 pr-4 uppercase tracking-wider border-b border-white/[0.02] group-hover:text-white ${i === 0 ? 'pt-6' : ''}`}>{f.name}</td>
                <td className={`py-4 text-center text-[10px] text-zinc-600 uppercase border-b border-white/[0.02] ${i === 0 ? 'pt-6' : ''}`}>{f.free}</td>
                <td className={`py-4 text-center text-[10px] text-zinc-300 uppercase border-b border-white/[0.02] ${i === 0 ? 'pt-6' : ''}`}>{f.pro}</td>
                <td className={`py-4 text-center text-[10px] font-bold uppercase border-b border-white/[0.02] text-[#F5A623] drop-shadow-[0_0_5px_rgba(245,166,35,0.2)] ${i === 0 ? 'pt-6' : ''}`}>{f.flagship}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function PaymentHistoryBlock({ payments, t }: { payments: PaymentInfo[]; t: MembershipTranslator }) {
  if (payments.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl bg-[#0a0a0a] border border-white/5 p-6 lg:p-8">
      <h3 className="text-xs font-black text-zinc-500 font-mono tracking-widest uppercase flex items-center gap-3 mb-6">
         <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
         {t('history.title')}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-3 text-left text-[9px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.date')}</th>
              <th className="pb-3 text-left text-[9px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.plan')}</th>
              <th className="pb-3 text-right text-[9px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.amount')}</th>
              <th className="pb-3 pl-6 text-left text-[9px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.network')}</th>
              <th className="pb-3 pl-4 text-left text-[9px] font-bold text-zinc-600 tracking-widest uppercase">{t('history.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.slice(0, 10).map((p, i) => {
              const st = STATUS_STYLES[p.status] ?? STATUS_STYLES.pending;
              return (
                <tr key={p.id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 font-mono text-[10px] text-zinc-500 tracking-widest">
                    {p.created_at ? formatDate(p.created_at).replace(',', '') : "—"}
                  </td>
                  <td className="py-4 text-[10px] text-zinc-300 uppercase tracking-widest font-bold">
                    {t(`currentStatus.levels.${LEVEL_NAME_KEYS[p.plan] ?? p.plan}`)}
                  </td>
                  <td className="py-4 text-right font-mono text-[11px] font-black text-white">
                    ${p.amount_usd}
                  </td>
                  <td className="py-4 pl-6 text-[9px] text-zinc-500 uppercase tracking-widest">
                    <span className="bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/[0.05]">{p.network ?? "—"}</span>
                  </td>
                  <td className="py-4 pl-4">
                    <span className={`inline-flex px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] rounded-sm border ${st.text} ${st.bg} border-current/30`}>
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


function LiveCheckoutSidebar({
  selectedPlan, setSelectedPlan,
  selectedDuration, setSelectedDuration,
  selectedNetwork, setSelectedNetwork,
  proPrice, flagshipPrice,
  proTotal, flagshipTotal,
  creating, error, handleCreatePayment,
  currentPayment, paymentExpiresAt, t
}: any) {
  
  const selectedTotal = selectedPlan === 1 ? proTotal : flagshipTotal;
  const isFlagship = selectedPlan === 2;
  const planName = t(isFlagship ? 'planSelection.plans.flagship' : 'planSelection.plans.pro');

  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (!currentPayment?.pay_address) return;
    try {
      await navigator.clipboard.writeText(currentPayment.pay_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  }, [currentPayment?.pay_address]);

  // Duration Options (Months)
  const DURATION_OPTS = [
    { m: 1 as DurationMonths, label: t('planSelection.duration.monthly'), badge: null },
    { m: 3 as DurationMonths, label: t('planSelection.duration.quarterly'), badge: t('planSelection.duration.discount.quarterly') },
    { m: 12 as DurationMonths, label: t('planSelection.duration.yearly'), badge: t('planSelection.duration.discount.yearly') },
  ];

  const countdown = useCountdown(paymentExpiresAt);
  const isExpired = countdown === "00:00";
  const st = currentPayment ? (STATUS_STYLES[currentPayment.status] ?? STATUS_STYLES.pending) : null;
  const statusMsg = currentPayment ? getPaymentStatusMessage(currentPayment.status, currentPayment.status_reason, isExpired) : "";

  return (
    <div className="sticky top-24 rounded-2xl bg-[#0a0a0a] border border-white/10 p-1 overflow-hidden shadow-2xl z-10">
       
       {/* Ambient Glow for Flagship */}
       {isFlagship && !currentPayment && <div className="absolute inset-x-0 -top-40 h-80 bg-[#F5A623]/20 blur-[100px] pointer-events-none" />}
       {!isFlagship && !currentPayment && <div className="absolute inset-x-0 -top-40 h-80 bg-indigo-500/20 blur-[100px] pointer-events-none" />}

       {/* Active Payment Flow Overrides Checkout Panel if pending */}
       <AnimatePresence mode="wait">
       {currentPayment ? (
         <motion.div 
            key="payment_active"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-black rounded-xl p-6 lg:p-8 flex flex-col gap-6"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
               <div>
                 <p className="text-[10px] font-bold font-mono text-zinc-500 tracking-widest uppercase mb-1">{t('payment.info.title')}</p>
                 <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#F5A623] animate-pulse" />
                    <span className="text-xs font-mono font-bold text-white uppercase">{t(`currentStatus.levels.${currentPayment.plan}`)}</span>
                 </div>
               </div>
               
               {currentPayment.status === "pending" && !isExpired ? (
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold font-mono text-zinc-500 uppercase tracking-widest mb-1">{t('payment.info.timeRemaining')}</span>
                    <span className="font-mono text-xl font-black text-[#F5A623]">{countdown}</span>
                  </div>
               ) : (
                  <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${isExpired && currentPayment.status === 'pending' ? 'border-zinc-500/30 text-zinc-400 bg-zinc-500/10' : `${st?.bg} ${st?.text} border-current/30`}`}>
                     {isExpired && currentPayment.status === 'pending' ? t('payment.info.expired') : st?.label}
                  </span>
               )}
            </div>

            <div className="flex flex-col gap-2 bg-white/[0.02] border border-white/5 rounded-lg p-5">
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-zinc-500">{t('payment.info.amount')}</p>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-4xl font-black text-white">{currentPayment.pay_amount}</span>
                <span className="text-sm font-bold text-zinc-400">{currentPayment.pay_currency?.toUpperCase()}</span>
              </div>
              <p className="text-[10px] font-mono text-zinc-500 tracking-wide mt-1">{t('payment.info.networkLabel')} <span className="text-white ml-1">{currentPayment.network}</span></p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-zinc-500">{t('payment.info.address')}</p>
              <div className="relative group">
                 <div className="absolute inset-0 bg-white/[0.03] rounded-lg -z-10 group-hover:bg-white/[0.05] transition-colors" />
                 <p className="font-mono text-[10px] text-indigo-300 break-all leading-relaxed p-4 pr-16 border border-white/10 rounded-lg">
                    {currentPayment.pay_address}
                 </p>
                 <button 
                   onClick={handleCopy}
                   className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black border border-white/10 rounded hover:bg-white/10 transition-colors"
                 >
                   {copied ? (
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                   ) : (
                      <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                   )}
                 </button>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-white/5 bg-black">
               <span className={`text-[10px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 ${currentPayment.status === "pending" && isExpired ? "text-zinc-500" : st?.text}`}>
                   <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                   {statusMsg}
               </span>
               <p className="mt-2 text-[9px] text-zinc-500 font-mono italic">{t('payment.info.hint')}</p>
            </div>
         </motion.div>
       ) : (
         <motion.div 
            key="checkout_form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative bg-[#0f0f0f] rounded-xl p-5 lg:p-7 flex flex-col gap-6"
          >
            <h3 className="text-xs font-black text-white font-mono tracking-widest uppercase border-b border-white/5 pb-4">{t('planSelection.title')} {t('planSelection.checkout')}</h3>

            {/* Plan Toggle */}
            <div className="flex p-1 bg-black rounded-lg border border-white/10 relative">
               <button 
                 onClick={() => setSelectedPlan(1)}
                 className={`flex-1 relative z-10 py-3 text-xs font-black font-mono tracking-widest uppercase transition-colors rounded-md ${!isFlagship ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
               >
                  {t('planSelection.plans.pro')}
               </button>
               <button 
                 onClick={() => setSelectedPlan(2)}
                 className={`flex-1 relative z-10 py-3 text-xs font-black font-mono tracking-widest uppercase transition-colors rounded-md ${isFlagship ? 'text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
               >
                  {t('planSelection.plans.flagship')}
               </button>
               
               {/* Animated Slider */}
               <div 
                 className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md transition-all duration-500 ease-out-expo ${isFlagship ? 'left-1/2 bg-[#F5A623] shadow-[0_0_15px_rgba(245,166,35,0.4)]' : 'left-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]'}`}
               />
            </div>

            {/* Billing Cycle */}
            <div className="flex flex-col gap-3">
              <span className="text-[9px] font-black text-zinc-500 tracking-widest uppercase font-mono">{t('planSelection.billingCycle')}</span>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTS.map(opt => (
                  <button 
                    key={opt.m}
                    onClick={() => setSelectedDuration(opt.m)}
                    className={`relative rounded-md border py-3 flex flex-col items-center justify-center gap-1 transition-all ${selectedDuration === opt.m ? 'bg-white/10 border-white/30 shadow-inner' : 'bg-black/50 border-white/5 hover:border-white/10 hover:bg-white/5'}`}
                  >
                    <span className={`text-[10px] font-black font-mono uppercase tracking-wider ${selectedDuration === opt.m ? 'text-white' : 'text-zinc-500'}`}>{opt.label}</span>
                    {opt.badge && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-[1px] bg-red-500/20 border border-red-500/30 text-red-400 text-[8px] font-bold rounded-sm whitespace-nowrap">
                        {opt.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Network Protocol */}
            <div className="flex flex-col gap-3">
              <span className="text-[9px] font-black text-zinc-500 tracking-widest uppercase font-mono">{t('payment.network')} • USDT Only</span>
              <div className="grid grid-cols-3 gap-2">
                {NETWORKS.map(net => (
                  <button 
                    key={net}
                    onClick={() => setSelectedNetwork(net)}
                    className={`rounded-md border py-2 text-[10px] font-bold font-mono tracking-wider transition-all ${selectedNetwork === net ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-black/50 border-white/5 text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {net}
                  </button>
                ))}
              </div>
            </div>

            {/* Total / Summary */}
            <div className="mt-4 pt-6 border-t border-white/5 flex flex-col gap-4">
               <div className="flex items-end justify-between">
                 <div className="flex flex-col">
                   <span className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase mb-1">{t('planSelection.totalDue')}</span>
                   <span className="text-zinc-400 text-xs font-mono">{planName} · {DURATION_OPTS.find(x => x.m === selectedDuration)?.label}</span>
                 </div>
                 <div className="text-right">
                   <div className="flex items-end gap-1 text-white pb-0.5">
                     <span className="text-xl font-bold font-mono">$</span>
                     <span className="text-4xl font-black font-mono leading-none tracking-tighter">{selectedTotal}</span>
                   </div>
                   {selectedDuration > 1 && (
                     <span className="text-[10px] text-emerald-400 font-mono tracking-tight bg-emerald-500/10 px-1.5 py-[1px] rounded inline-block mt-1">
                       {t('planSelection.avgMonthly', { amount: (selectedTotal/selectedDuration).toFixed(2) })}
                     </span>
                   )}
                 </div>
               </div>

               <button
                 onClick={handleCreatePayment}
                 disabled={creating}
                 className={`group relative w-full rounded-lg h-14 overflow-hidden mt-2 font-mono text-xs font-black uppercase tracking-[0.2em] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isFlagship ? 'bg-[#F5A623] hover:bg-[#F5A623]/90 text-black shadow-[0_0_20px_rgba(245,166,35,0.2)] hover:shadow-[0_0_30px_rgba(245,166,35,0.4)]' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:shadow-[0_0_30px_rgba(99,102,241,0.4)]'}`}
               >
                 <span className="relative z-10 flex items-center justify-center gap-2">
                   {creating ? (
                     <><span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" /> {t('payment.creating').toUpperCase()}</>
                   ) : (
                     <><span className="whitespace-nowrap">{t('payment.createButton', { amount: selectedTotal }).toUpperCase()} USDT</span> <svg className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${isFlagship ? 'text-black/50' : 'text-white/50'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg></>
                   )}
                 </span>
               </button>
               
               {error && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md animate-in slide-in-from-top-2">
                    <p className="text-[10px] font-mono text-center font-bold text-red-400">{error}</p>
                  </div>
               )}
            </div>
         </motion.div>
       )}
       </AnimatePresence>
    </div>
  );
}

// ==========================================
// MAIN PAGE VIEW
// ==========================================

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
    if (!currentPayment || !syncedCurrentPayment) return;
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
      setError(err instanceof Error ? err.message : "创建支付失败");
    } finally {
      setCreating(false);
    }
  }, [queryClient, selectedPlan, selectedNetwork, selectedDuration]);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto text-white selection:bg-indigo-500/30">
      <div className="mb-10 lg:mb-12">
        <h1 className="text-3xl lg:text-4xl font-black font-mono tracking-widest uppercase mb-3">
           {t('title')}
        </h1>
        <p className="text-[11px] font-bold font-mono text-zinc-500 uppercase tracking-[0.3em]">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* LEFT COLUMN: Data & Tables */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-8">
          {user && <AccountHeroStrip user={user} t={t} />}
          <PlanComparisonTable plansData={plansData} t={t} />
          <PaymentHistoryBlock payments={history} t={t} />
        </div>

        {/* RIGHT COLUMN: Sticky Checkout Terminal */}
        <div className="lg:col-span-5 xl:col-span-4 relative">
          <LiveCheckoutSidebar 
            selectedPlan={selectedPlan} setSelectedPlan={setSelectedPlan}
            selectedDuration={selectedDuration} setSelectedDuration={setSelectedDuration}
            selectedNetwork={selectedNetwork} setSelectedNetwork={setSelectedNetwork}
            proPrice={proPrice} flagshipPrice={flagshipPrice}
            proTotal={proTotal} flagshipTotal={flagshipTotal}
            creating={creating} error={error} handleCreatePayment={handleCreatePayment}
            currentPayment={syncedCurrentPayment} paymentExpiresAt={paymentExpiresAt}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}
