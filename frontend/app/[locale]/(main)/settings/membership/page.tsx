"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
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
  const color = LEVEL_COLORS[level] ?? "text-zinc-400";

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
    <div className="card-surface rounded-lg p-6">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{t('currentStatus.title')}</p>
      <div className="mt-3 flex items-baseline gap-3">
        <span className={`text-2xl font-bold ${color}`}>{name}</span>
        <span className="text-xs text-zinc-500">{user.email}</span>
      </div>
      {expiryInfo && (
        <div className={`mt-3 flex items-center gap-2 text-sm ${expiryInfo.daysLeft <= 7 ? "text-red-400" : expiryInfo.daysLeft <= 30 ? "text-amber-400" : "text-zinc-400"}`}>
          {expiryInfo.daysLeft <= 7 && (
            <span className="inline-block h-2 w-2 rounded-full bg-red-400 animate-pulse" />
          )}
          <span>{t('currentStatus.expiresAt', { date: expiryInfo.dateStr })}</span>
          <span className="text-xs">{t('currentStatus.daysLeft', { count: expiryInfo.daysLeft })}</span>
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
    <div className="card-surface rounded-lg p-6">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{t('planComparison.title')}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">{t('planComparison.feature')}</th>
              <th className="pb-3 text-center text-xs font-medium text-zinc-400">{t('planComparison.free')} <span className="font-mono">$0</span></th>
              <th className="pb-3 text-center text-xs font-medium text-accent">{t('planComparison.pro')} <span className="font-mono">${proPrice}/{t('planSelection.perMonth')}</span></th>
              <th className="pb-3 text-center text-xs font-medium text-[#F5A623]">{t('planComparison.flagship')} <span className="font-mono">${flagshipPrice}/{t('planSelection.perMonth')}</span></th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.name} className="border-b border-white/[0.04]">
                <td className="py-3 text-xs text-zinc-300">{f.name}</td>
                <td className="py-3 text-center text-xs text-zinc-500">{f.free}</td>
                <td className="py-3 text-center text-xs text-zinc-300">{f.pro}</td>
                <td className="py-3 text-center text-xs text-zinc-200">{f.flagship}</td>
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

function PlanCard({ name, monthlyPrice, totalPrice, durationMonths, color, borderColor, glow, selected, onSelect }: PlanCardProps) {
  const avgMonthly = durationMonths > 1 ? Math.round(totalPrice / durationMonths * 100) / 100 : monthlyPrice;
  const hasSaving = durationMonths > 1 && avgMonthly < monthlyPrice;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full rounded-lg border p-5 text-left transition-all duration-200
        backdrop-blur-md bg-white/[0.04]
        ${selected ? `${borderColor} ${glow}` : "border-white/[0.08]"}
        hover:border-white/[0.16]
      `}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-lg font-semibold ${color}`}>{name}</span>
        {selected && (
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${color} bg-white/[0.08]`}>
            ✓
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold text-zinc-200">${totalPrice}</span>
        <span className="text-xs text-zinc-500">{DURATION_LABEL_KEYS[durationMonths]}</span>
      </div>
      {hasSaving && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-zinc-500 line-through">${monthlyPrice}/mo</span>
          <span className="text-xs text-bull bg-[var(--color-bull)]/10 rounded px-1.5 py-0.5">
            -{Math.round((1 - avgMonthly / monthlyPrice) * 100)}%
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
    <div className="card-surface rounded-lg p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-zinc-500">{t('payment.info.title')}</p>
        <div className="flex items-center gap-2">
          {payment.status === "pending" && !isExpired ? (
            <>
              <span className="text-xs text-zinc-500">{t('payment.info.timeRemaining')}</span>
              <span className="font-mono text-sm font-bold text-[#F5A623]">{countdown}</span>
            </>
          ) : (
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${payment.status === "pending" ? "bg-zinc-400/20 text-zinc-400" : `${statusStyle.bg} ${statusStyle.text}`}`}>
              {payment.status === "pending" ? t('payment.info.expired') : statusStyle.label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">{t('payment.info.amount')}</p>
          <p className="mt-1 font-mono text-lg font-bold text-zinc-200">
            {payment.pay_amount} <span className="text-sm text-zinc-400">{payment.pay_currency?.toUpperCase()}</span>
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">{t('payment.info.address')}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white/[0.06] px-3 py-2 font-mono text-xs text-zinc-300">
              {payment.pay_address}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded bg-white/[0.08] px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.12] hover:text-zinc-200"
            >
              {copied ? t('payment.info.copied') : t('payment.info.copy')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${payment.status === "completed" ? "bg-[var(--color-bull)]" : payment.status === "failed" ? "bg-[var(--color-bear)]" : payment.status === "expired" || isExpired ? "bg-zinc-400" : "animate-pulse bg-[#F5A623]"}`} />
          <span className={`text-xs ${payment.status === "pending" && isExpired ? "text-zinc-400" : statusStyle.text}`}>{statusMessage}</span>
        </div>
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
      <div className="card-surface rounded-lg overflow-hidden">
        <EmptyPayments />
      </div>
    );
  }

  return (
    <div className="card-surface rounded-lg p-6">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{t('history.title')}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">{t('history.columns.date')}</th>
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">{t('history.columns.plan')}</th>
              <th className="pb-3 text-right text-xs font-medium text-zinc-500">{t('history.columns.amount')}</th>
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">{t('history.columns.network')}</th>
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">{t('history.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const st = STATUS_STYLES[p.status] ?? STATUS_STYLES.pending;
              return (
                <tr key={p.id} className="border-b border-white/[0.04]">
                  <td className="py-3 font-mono text-xs text-zinc-400">
                    {p.created_at ? formatDate(p.created_at) : "—"}
                  </td>
                  <td className="py-3 text-xs text-zinc-300">
                    {t(`currentStatus.levels.${LEVEL_NAME_KEYS[p.plan] ?? p.plan}`)}
                  </td>
                  <td className="py-3 text-right font-mono text-xs text-zinc-200">
                    ${p.amount_usd}
                  </td>
                  <td className="py-3 text-xs text-zinc-400">
                    {p.network ?? "—"}
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${st.text} ${st.bg}`}>
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
      setError(error instanceof Error ? error.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }, [claiming, queryClient, trial?.claimed, trial?.enabled]);

  if (!trial?.enabled) return null;

  return (
    <div className="card-surface rounded-lg p-6 border border-indigo-500/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{t('freeTrial.title')}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {trial.claimed
              ? trial.remaining > 0
                ? t('freeTrial.remaining', { count: trial.remaining })
                : t('freeTrial.exhausted')
              : t('freeTrial.description', { count: trial.total })}
          </p>
        </div>
        {!trial.claimed && (
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {claiming ? t('freeTrial.claiming') : t('freeTrial.claim')}
          </button>
        )}
        {trial.claimed && trial.remaining > 0 && (
          <span className="rounded bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
            {trial.remaining} {t('freeTrial.claimed')}
          </span>
        )}
        {trial.claimed && trial.remaining === 0 && (
          <span className="rounded bg-zinc-500/10 px-3 py-1.5 text-xs font-medium text-zinc-500">
            {t('freeTrial.used')}
          </span>
        )}
      </div>
      {error && <p className="mt-3 text-xs text-bear">{error}</p>}
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
      const msg = err instanceof Error ? err.message : "Payment creation failed";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }, [queryClient, selectedPlan, selectedNetwork, selectedDuration]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-zinc-200">{t('title')}</h1>

      {user && <CurrentStatusCard user={user} t={t} />}

      <FreeTrialCard />

      <PlanComparisonTable plansData={plansData} t={t} />

      <div className="card-surface rounded-lg p-6">
        <p className="text-xs uppercase tracking-widest text-zinc-500">{t('planSelection.title')}</p>

        <div className="mt-4 flex justify-center">
          <div className="inline-flex rounded-lg bg-white/[0.04] border border-white/[0.08] p-1">
            {([1, 3, 12] as DurationMonths[]).map((dur) => {
              const labelKeys: Record<DurationMonths, string> = { 1: "monthly", 3: "quarterly", 12: "yearly" };
              const badgeKeys: Record<DurationMonths, string | null> = { 1: null, 3: "quarterly", 12: "yearly" };
              return (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setSelectedDuration(dur)}
                  className={`relative rounded-lg px-5 py-2 text-xs font-medium transition-all duration-200 ${
                    selectedDuration === dur
                      ? "bg-[var(--color-accent)]/20 text-accent"
                      : "text-zinc-400 hover:text-zinc-300"
                  }`}
                >
                  {t(`planSelection.duration.${labelKeys[dur]}`)}
                  {badgeKeys[dur] && (
                    <span className="absolute -top-1.5 -right-1 text-xs font-bold text-bull bg-[var(--color-bull)]/15 rounded px-1">
                      {t(`planSelection.duration.discount.${badgeKeys[dur]}`)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlanCard
            plan={1}
            name={t('planSelection.plans.pro')}
            monthlyPrice={proPrice}
            totalPrice={proTotal}
            durationMonths={selectedDuration}
            color="text-accent"
            borderColor={LEVEL_BORDER[1]}
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

        <div className="mt-6">
          <p className="text-xs uppercase tracking-widest text-zinc-500">{t('payment.network')}</p>
          <div className="mt-2 flex gap-2">
            {NETWORKS.map((net) => (
              <button
                key={net}
                type="button"
                onClick={() => setSelectedNetwork(net)}
                className={`
                  rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200
                  ${
                    selectedNetwork === net
                      ? "bg-[var(--color-accent)]/20 text-accent border border-accent/40"
                      : "bg-white/[0.04] text-zinc-400 border border-white/[0.08] hover:border-white/[0.16]"
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
          className="mt-6 w-full rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition-all duration-200 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? t('payment.creating') : `${t('payment.createButton', { amount: selectedTotal })}`}
        </button>

        {error && (
          <p className="mt-3 text-xs text-bear">{error}</p>
        )}
      </div>

      {syncedCurrentPayment && paymentExpiresAt && (
        <PaymentDisplay payment={syncedCurrentPayment} expiresAt={paymentExpiresAt} />
      )}

      <PaymentHistory payments={history} />
    </div>
  );
}
