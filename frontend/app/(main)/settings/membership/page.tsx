"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

// ── Constants ────────────────────────────────────────────────

const LEVEL_NAMES: Record<number, string> = { 0: "免费", 1: "专业", 2: "旗舰" };
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

// ── Plan comparison data ─────────────────────────────────────

interface PlanFeature {
  name: string;
  free: string;
  pro: string;
  flagship: string;
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: "实时短线分析", free: "5次/天",    pro: "50次/天",   flagship: "200次/天" },
  { name: "日内博弈分析", free: "免费体验1次", pro: "20次/天",   flagship: "100次/天" },
  { name: "趋势布局分析", free: "锁定",       pro: "锁定",       flagship: "50次/天" },
  { name: "链上数据",     free: "延迟15分钟", pro: "实时",       flagship: "实时" },
  { name: "多智能体共识",   free: "—",          pro: "—",          flagship: "✓" },
  { name: "剧本推演",     free: "—",          pro: "基础",        flagship: "完整" },
  { name: "对抗防御",     free: "—",          pro: "—",          flagship: "✓" },
  { name: "策略回测",     free: "7天",        pro: "30天",       flagship: "180天" },
  { name: "策略推送",     free: "—",          pro: "邮件",        flagship: "邮件+TG" },
  { name: "API 访问",     free: "—",          pro: "—",          flagship: "✓" },
];

// ── Sub-components ───────────────────────────────────────────

interface CurrentStatusCardProps {
  user: UserInfo;
}

function CurrentStatusCard({ user }: CurrentStatusCardProps) {
  const level = user.membership_level;
  const name = LEVEL_NAMES[level] ?? "未知";
  const color = LEVEL_COLORS[level] ?? "text-zinc-400";

  return (
    <div className="card-surface rounded-lg p-6">
      <p className="text-xs uppercase tracking-widest text-zinc-500">当前会员</p>
      <div className="mt-3 flex items-baseline gap-3">
        <span className={`text-2xl font-bold ${color}`}>{name}</span>
        <span className="text-xs text-zinc-500">{user.email}</span>
      </div>
    </div>
  );
}


// ── Plan comparison table ────────────────────────────────────

interface PlanComparisonTableProps {
  plansData: PlansResponse | undefined;
}

function PlanComparisonTable({ plansData }: PlanComparisonTableProps) {
  const features = plansData?.features ?? PLAN_FEATURES;
  const proPrice = plansData?.plans?.find((p) => p.plan === 1)?.price_monthly ?? 99;
  const flagshipPrice = plansData?.plans?.find((p) => p.plan === 2)?.price_monthly ?? 299;

  return (
    <div className="card-surface rounded-lg p-6">
      <p className="text-xs uppercase tracking-widest text-zinc-500">等级权益对比</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">功能</th>
              <th className="pb-3 text-center text-xs font-medium text-zinc-400">免费 <span className="font-mono">$0</span></th>
              <th className="pb-3 text-center text-xs font-medium text-accent">专业 <span className="font-mono">${proPrice}/月</span></th>
              <th className="pb-3 text-center text-xs font-medium text-[#F5A623]">旗舰 <span className="font-mono">${flagshipPrice}/月</span></th>
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

// ── Plan selection card ──────────────────────────────────────

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

const DURATION_LABELS: Record<DurationMonths, string> = {
  1: "月",
  3: "季",
  12: "年",
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
            已选择
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold text-zinc-200">${totalPrice}</span>
        <span className="text-xs text-zinc-500">/{DURATION_LABELS[durationMonths]}</span>
      </div>
      {hasSaving && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-zinc-500 line-through">${monthlyPrice}/月</span>
          <span className="text-xs text-bull bg-[var(--color-bull)]/10 rounded px-1.5 py-0.5">
            省 {Math.round((1 - avgMonthly / monthlyPrice) * 100)}%
          </span>
        </div>
      )}
    </button>
  );
}


// ── Countdown hook ───────────────────────────────────────────

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

// ── Payment QR / address area ────────────────────────────────

interface PaymentDisplayProps {
  payment: PaymentInfo;
  expiresAt: number;
}

function PaymentDisplay({ payment, expiresAt }: PaymentDisplayProps) {
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
      console.error("复制支付地址失败", error);
    }
  }, [payment.pay_address]);

  return (
    <div className="card-surface rounded-lg p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-zinc-500">支付信息</p>
        <div className="flex items-center gap-2">
          {payment.status === "pending" && !isExpired ? (
            <>
              <span className="text-xs text-zinc-500">剩余时间</span>
              <span className="font-mono text-sm font-bold text-[#F5A623]">{countdown}</span>
            </>
          ) : (
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${payment.status === "pending" ? "bg-zinc-400/20 text-zinc-400" : `${statusStyle.bg} ${statusStyle.text}`}`}>
              {payment.status === "pending" ? "已超时" : statusStyle.label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Amount */}
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">支付金额</p>
          <p className="mt-1 font-mono text-lg font-bold text-zinc-200">
            {payment.pay_amount} <span className="text-sm text-zinc-400">{payment.pay_currency?.toUpperCase()}</span>
          </p>
        </div>

        {/* Address */}
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">支付地址</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white/[0.06] px-3 py-2 font-mono text-xs text-zinc-300">
              {payment.pay_address}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded bg-white/[0.08] px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.12] hover:text-zinc-200"
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${payment.status === "completed" ? "bg-[var(--color-bull)]" : payment.status === "failed" ? "bg-[var(--color-bear)]" : payment.status === "expired" || isExpired ? "bg-zinc-400" : "animate-pulse bg-[#F5A623]"}`} />
          <span className={`text-xs ${payment.status === "pending" && isExpired ? "text-zinc-400" : statusStyle.text}`}>{statusMessage}</span>
        </div>
      </div>
    </div>
  );
}


// ── Payment history table ────────────────────────────────────

interface PaymentHistoryProps {
  payments: PaymentInfo[];
}

function PaymentHistory({ payments }: PaymentHistoryProps) {
  if (payments.length === 0) {
    return (
      <div className="card-surface rounded-lg overflow-hidden">
        <EmptyPayments />
      </div>
    );
  }

  return (
    <div className="card-surface rounded-lg p-6">
      <p className="text-xs uppercase tracking-widest text-zinc-500">支付历史</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">日期</th>
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">套餐</th>
              <th className="pb-3 text-right text-xs font-medium text-zinc-500">金额</th>
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">网络</th>
              <th className="pb-3 text-left text-xs font-medium text-zinc-500">状态</th>
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
                    {LEVEL_NAMES[p.plan] ?? `套餐${p.plan}`}
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
      console.error("领取免费体验失败", error);
      setError(error instanceof Error ? error.message : "领取免费体验失败");
    } finally {
      setClaiming(false);
    }
  }, [claiming, queryClient, trial?.claimed, trial?.enabled]);

  if (!trial?.enabled) return null;

  return (
    <div className="card-surface rounded-lg p-6 border border-indigo-500/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{"\u514D\u8D39\u4F53\u9A8C"}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {trial.claimed
              ? trial.remaining > 0
                ? `\u5269\u4F59 ${trial.remaining} \u6B21\u65E5\u5185\u535A\u5F08\u5206\u6790\u4F53\u9A8C`
                : "\u4F53\u9A8C\u6B21\u6570\u5DF2\u7528\u5B8C\uFF0C\u5347\u7EA7\u89E3\u9501\u66F4\u591A"
              : `\u514D\u8D39\u9886\u53D6 ${trial.total} \u6B21\u65E5\u5185\u535A\u5F08\u5206\u6790\u4F53\u9A8C`}
          </p>
        </div>
        {!trial.claimed && (
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {claiming ? "\u9886\u53D6\u4E2D..." : "\u7ACB\u5373\u9886\u53D6"}
          </button>
        )}
        {trial.claimed && trial.remaining > 0 && (
          <span className="rounded bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
            {trial.remaining} {"\u6B21\u53EF\u7528"}
          </span>
        )}
        {trial.claimed && trial.remaining === 0 && (
          <span className="rounded bg-zinc-500/10 px-3 py-1.5 text-xs font-medium text-zinc-500">
            {"\u5DF2\u4F7F\u7528"}
          </span>
        )}
      </div>
      {error && <p className="mt-3 text-xs text-bear">{error}</p>}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}


// ── Main page ────────────────────────────────────────────────

export default function MembershipPage() {
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
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <h1 className="text-xl font-semibold text-zinc-200">会员中心</h1>

      {/* Current status */}
      {user && <CurrentStatusCard user={user} />}

      {/* Free trial */}
      <FreeTrialCard />

      {/* Plan comparison */}
      <PlanComparisonTable plansData={plansData} />

      {/* Plan selection */}
      <div className="card-surface rounded-lg p-6">
        <p className="text-xs uppercase tracking-widest text-zinc-500">选择套餐</p>

        {/* Duration toggle */}
        <div className="mt-4 flex justify-center">
          <div className="inline-flex rounded-lg bg-white/[0.04] border border-white/[0.08] p-1">
            {([1, 3, 12] as DurationMonths[]).map((dur) => {
              const labels: Record<DurationMonths, string> = { 1: "月付", 3: "季付", 12: "年付" };
              const badges: Record<DurationMonths, string | null> = { 1: null, 3: "9折", 12: "7折" };
              const badge = badges[dur];
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
                  {labels[dur]}
                  {badge && (
                    <span className="absolute -top-1.5 -right-1 text-xs font-bold text-bull bg-[var(--color-bull)]/15 rounded px-1">
                      {badge}
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
            name="专业"
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
            name="旗舰"
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

        {/* Network selection */}
        <div className="mt-6">
          <p className="text-xs uppercase tracking-widest text-zinc-500">支付网络</p>
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

        {/* Create payment button */}
        <button
          type="button"
          onClick={handleCreatePayment}
          disabled={creating}
          className="mt-6 w-full rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition-all duration-200 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "创建中…" : `支付 $${selectedTotal}`}
        </button>

        {error && (
          <p className="mt-3 text-xs text-bear">{error}</p>
        )}
      </div>

      {/* Payment display */}
      {syncedCurrentPayment && paymentExpiresAt && (
        <PaymentDisplay payment={syncedCurrentPayment} expiresAt={paymentExpiresAt} />
      )}

      {/* Payment history */}
      <PaymentHistory payments={history} />
    </div>
  );
}
