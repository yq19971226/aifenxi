"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
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
  fetchCreditPacks,
  type PlansResponse,
  type FreeTrialStatus,
  type CreditPack,
} from "@/lib/api/membership";
import type { UserInfo } from "@/lib/api/auth";
import { STATUS_STYLES, getPaymentStatusMessage } from "@/lib/payment-status";

// ── Constants ─────────────────────────────────────────────────

const LEVEL_COLORS: Record<number, string> = {
  0: "text-zinc-500",
  1: "text-[#00E5FF] drop-shadow-[0_0_15px_rgba(0,229,255,0.5)] glow-cyan",
  2: "text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)] glow-amber",
};

const LEVEL_BG: Record<number, string> = {
  0: "from-white/[0.02] to-transparent",
  1: "from-[#00E5FF]/10 to-transparent",
  2: "from-amber-500/10 to-transparent",
};

const LEVEL_BORDER: Record<number, string> = {
  0: "border-white/5",
  1: "border-[#00E5FF]/20",
  2: "border-amber-500/30",
};

const NETWORKS: PaymentNetwork[] = ["TRC-20", "ERC-20", "BEP-20"];
const PAYMENT_TIMEOUT_MS = 15 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function useCountdown(targetMs: number | null): string {
  const [remaining, setRemaining] = useState("");
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (ref.current) clearInterval(ref.current);
    if (!targetMs) { setRemaining(""); return; }
    const tick = () => {
      const diff = targetMs - Date.now();
      if (diff <= 0) { setRemaining("00:00"); if (ref.current) clearInterval(ref.current); return; }
      const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick(); ref.current = setInterval(tick, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [targetMs]);
  return remaining;
}

// ── Feature Cell ─────────────────────────────────────────────

function Cell({ value, tier }: { value: string; tier: "free" | "pro" | "flagship" }) {
  const isCheck = value === "✓";
  const isDash = value === "—";
  const isLocked = value === "锁定";

  if (isCheck) return (
    <span className={`inline-flex items-center justify-center ${tier === "flagship" ? "text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]" : "text-[#00E5FF] drop-shadow-[0_0_10px_rgba(0,229,255,0.8)]"}`}>
      <CheckCircle2 className="w-[18px] h-[18px]" strokeWidth={2.5} />
    </span>
  );
  if (isDash || isLocked) return <span className="text-zinc-600 text-[11px]">—</span>;
  return (
    <span className={`text-[11px] font-bold font-mono ${
      tier === "flagship" ? "text-amber-400" :
      tier === "pro" ? "text-zinc-200" : "text-zinc-500"
    }`}>{value}</span>
  );
}

// ── Account Hero ──────────────────────────────────────────────

function AccountHero({ user, trial }: { user: UserInfo; trial?: FreeTrialStatus }) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const level = user.membership_level;
  const color = LEVEL_COLORS[level] ?? "text-zinc-400";
  const border = LEVEL_BORDER[level] ?? "border-white/5";
  const bg = LEVEL_BG[level] ?? "";
  const levelNames = ["免费", "专业", "旗舰"];
  const name = levelNames[level] ?? "免费";
  const isPremium = level > 0;

  let daysLeft = 0;
  let expiryStr = "";
  if (isPremium && user.membership_expires_at) {
    const exp = new Date(user.membership_expires_at);
    daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86400000);
    expiryStr = exp.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  const [claiming, setClaiming] = useState(false);
  const [claimErr, setClaimErr] = useState<string | null>(null);
  const handleClaim = useCallback(async () => {
    if (claiming || !trial?.enabled || trial?.claimed) return;
    setClaiming(true); setClaimErr(null);
    try {
      await claimFreeTrial();
      queryClient.invalidateQueries({ queryKey: ["freeTrial"] });
      queryClient.invalidateQueries({ queryKey: ["analysis-quota"] });
    } catch (e: unknown) { setClaimErr(e instanceof Error ? e.message : "领取失败"); }
    finally { setClaiming(false); }
  }, [claiming, trial, queryClient]);

  return (
    <div className={`relative rounded-2xl backdrop-blur-xl bg-[#0a0d14]/80 border ${border} overflow-hidden shadow-2xl`}>
      <div className="absolute inset-0 bg-scanline pointer-events-none opacity-50" />
      <div className={`absolute inset-0 bg-gradient-to-br ${bg} pointer-events-none`} />
      <div className="relative p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-mono tracking-[0.25em] text-zinc-400">当前账号</span>
            <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">{user.email}</span>
          </div>
          <div className="flex items-end gap-3 md:gap-4">
            <h2 className={`text-6xl md:text-7xl font-black font-mono tracking-tighter uppercase ${color}`}>
              {name}
            </h2>
            <div className="pb-2 md:pb-3 flex flex-col gap-1.5 md:gap-2">
              {isPremium ? (
                <>
                  <span className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-[4px] border border-current/25 ${color} bg-current/10 w-max`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse shadow-[0_0_8px_currentColor]" />
                    SYSTEM ONLINE
                  </span>
                  {daysLeft > 0 && (
                    <span className={`text-[11px] font-mono ${daysLeft <= 7 ? "text-[#FF1744] animate-pulse glow-red" : daysLeft <= 30 ? "text-amber-400" : "text-zinc-500"} whitespace-nowrap`}>
                      剩余 {daysLeft} 天 · 到期 {expiryStr}
                    </span>
                  )}
                </>
              ) : (
                <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-[4px] border border-zinc-700/50 text-zinc-500 bg-zinc-800/30 w-max">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                  OFFLINE
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Trial */}
        {!isPremium && trial?.enabled && (
          <div className="shrink-0 bg-black/40 border border-indigo-500/20 rounded-xl p-5 md:p-6 min-w-[240px]">
            <p className="text-[11px] font-black font-mono uppercase tracking-[0.2em] text-indigo-400 mb-1.5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]" />
              欢迎体验包
            </p>
            <p className="text-xs text-zinc-500 font-mono mb-5">
              {trial.claimed
                ? trial.remaining > 0 ? `剩余 ${trial.remaining} 次可用` : "体验次数已用完"
                : `注册赠送 ${trial.total} 次日内博弈分析`}
            </p>
            {!trial.claimed ? (
              <button onClick={handleClaim} disabled={claiming}
                className="w-full rounded-md bg-indigo-600/20 border border-indigo-500/30 py-2.5 text-xs font-black font-mono uppercase tracking-[0.15em] text-white hover:bg-indigo-600/35 transition-all shadow-[0_0_15px_rgba(99,102,241,0)] hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] disabled:opacity-50">
                {claiming ? "领取中..." : "立即领取"}
              </button>
            ) : (
              <div className={`text-center py-2.5 rounded-md border text-xs font-black font-mono uppercase tracking-[0.15em] ${trial.remaining > 0 ? "border-emerald-500/25 text-emerald-400 bg-emerald-500/8" : "border-zinc-700 text-zinc-400 bg-zinc-800/50"}`}>
                {trial.remaining > 0 ? `✓ 已领取 · ${trial.remaining} 次剩余` : "已全部用完"}
              </div>
            )}
            {claimErr && <p className="mt-2 text-[11px] text-red-400 font-mono text-center">{claimErr}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Feature Comparison Table ──────────────────────────────────

function FeatureTable({ plansData }: { plansData: PlansResponse | undefined }) {
  const proPrice = plansData?.plans?.find(p => p.plan === 1)?.price_monthly ?? 99;
  const flagPrice = plansData?.plans?.find(p => p.plan === 2)?.price_monthly ?? 299;
  const features = plansData?.features ?? [];

  const SECTION_LABELS: Record<string, string> = {
    "实时短线分析": "分析次数",
    "日内博弈分析": "分析次数",
    "趋势布局分析": "分析次数",
    "链上数据": "数据权限",
    "多智能体共识": "AI 能力",
    "策略推送": "通知",
    "AI 对抗推演": "高级功能",
    "策略回测": "高级功能",
    "积分包充值": "充值",
  };

  const sections: Record<string, typeof features> = {};
  for (const f of features) {
    const sec = SECTION_LABELS[f.name] ?? "其他";
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(f);
  }

  return (
    <div className="rounded-2xl backdrop-blur-lg bg-[#0a0d14]/60 border border-white/[0.04] overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_60px_68px_68px] sm:grid-cols-[1fr_90px_110px_120px] border-b border-white/[0.06] bg-[#0A0D14]/90">
        <div className="px-4 sm:px-6 py-5 text-[11px] font-black font-mono uppercase tracking-[0.25em] text-zinc-500 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="square" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          ACCESS PRIVILEGES [MATRIX]
        </div>
        {/* Free */}
        <div className="py-5 text-center border-l border-white/[0.02]">
          <div className="text-[10px] sm:text-[11px] font-black font-mono uppercase tracking-widest text-zinc-500">免费</div>
          <div className="text-[10px] text-zinc-500 bg-white/[0.02] border border-white/[0.04] inline-block px-2 py-0.5 rounded mt-1.5 font-bold">$0 / M</div>
        </div>
        {/* Pro */}
        <div className="py-5 text-center border-l border-[#00E5FF]/10 bg-[#00E5FF]/[0.02] relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-[#00E5FF]/30" />
          <div className="text-[10px] sm:text-[11px] font-black font-mono uppercase tracking-widest text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]">专业</div>
          <div className="text-[10px] text-[#00E5FF] bg-[#00E5FF]/10 border border-[#00E5FF]/20 inline-block px-2 py-0.5 rounded mt-1.5 font-bold">${proPrice} / M</div>
        </div>
        {/* Flagship */}
        <div className="py-5 text-center border-l border-amber-500/10 bg-amber-500/[0.02] relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-amber-500/40" />
          <div className="text-[10px] sm:text-[11px] font-black font-mono uppercase tracking-widest text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">旗舰</div>
          <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 inline-block px-2 py-0.5 rounded mt-1.5 font-bold">${flagPrice} / M</div>
        </div>
      </div>

      {/* Body */}
      {Object.entries(sections).map(([section, rows], si) => (
        <div key={section}>
          <div className="grid grid-cols-[minmax(0,1fr)_60px_68px_68px] sm:grid-cols-[1fr_90px_110px_120px] bg-black/20">
            <div className="px-4 sm:px-6 py-2.5 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400 col-span-4 border-y border-white/[0.02]">
              {section}
            </div>
          </div>
          {rows.map((f, fi) => (
            <motion.div
              key={f.name}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: (si * rows.length + fi) * 0.03 }}
              className="grid grid-cols-[minmax(0,1fr)_60px_68px_68px] sm:grid-cols-[1fr_90px_110px_120px] border-b border-white/[0.02] group hover:bg-white/[0.015] transition-colors"
            >
              <div className="px-4 sm:px-6 py-4 text-[11px] sm:text-xs text-zinc-400 font-mono tracking-wide group-hover:text-zinc-200 transition-colors uppercase">
                {f.name}
              </div>
              <div className="py-4 flex items-center justify-center border-l border-white/[0.02]">
                <Cell value={f.free} tier="free" />
              </div>
              <div className="py-4 flex items-center justify-center border-l border-[#00E5FF]/[0.07] bg-[#00E5FF]/[0.02]">
                <Cell value={f.pro} tier="pro" />
              </div>
              <div className="py-4 flex items-center justify-center border-l border-amber-500/[0.07] bg-amber-500/[0.02]">
                <Cell value={f.flagship} tier="flagship" />
              </div>
            </motion.div>
          ))}
        </div>
      ))}

      {/* Footer note */}
      <div className="px-6 py-4 border-t border-white/[0.04] bg-black/20 flex items-start gap-2">
        <span className="text-zinc-500 text-[9px] mt-0.5">※</span>
        <p className="text-[9px] font-mono text-zinc-500 leading-relaxed">
          分析次数为每日重置配额，次数不累计。超出配额可购买积分包按量补充。专业/旗舰会员到期后恢复免费等级，历史数据保留。
        </p>
      </div>
    </div>
  );
}

// ── Payment History ───────────────────────────────────────────

function PaymentHistory({ payments }: { payments: PaymentInfo[] }) {
  if (!payments.length) return null;
  const planNames: Record<number, string> = {
    0: "免费", 1: "专业", 2: "旗舰",
    3: "积分包 S", 4: "积分包 M", 5: "积分包 L",
  };
  return (
    <div className="rounded-2xl bg-[#0a0a0a] border border-white/5 overflow-hidden">
      <div className="px-6 py-5 border-b border-white/[0.05] flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="square" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-[9px] font-black font-mono uppercase tracking-[0.25em] text-zinc-400">支付记录</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/[0.04] bg-black/20">
              {["时间", "套餐", "金额", "网络", "状态"].map(h => (
                <th key={h} className="px-6 py-3 text-left text-[8px] font-black text-zinc-500 tracking-[0.2em] uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.slice(0, 10).map(p => {
              const st = STATUS_STYLES[p.status] ?? STATUS_STYLES.pending;
              return (
                <tr key={p.id} className="border-b border-white/[0.02] hover:bg-white/[0.015] transition-colors">
                  <td className="px-6 py-3.5 text-[10px] text-zinc-400">{p.created_at ? formatDate(p.created_at) : "—"}</td>
                  <td className="px-6 py-3.5 text-[10px] text-zinc-300 font-bold uppercase tracking-wider">{planNames[p.plan] ?? `套餐${p.plan}`}</td>
                  <td className="px-6 py-3.5 text-[11px] font-black text-white">${p.amount_usd}</td>
                  <td className="px-6 py-3.5">
                    <span className="text-[9px] text-zinc-400 bg-white/[0.03] border border-white/[0.05] px-1.5 py-0.5 rounded">{p.network ?? "—"}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.15em] rounded-sm border ${st.text} ${st.bg} border-current/25`}>{st.label}</span>
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

// ── Credits Pack Options（动态，从后台 /api/membership/credit-packs 读取）──

// ── Checkout Sidebar ──────────────────────────────────────────

function CheckoutSidebar({
  selectedPlan, setSelectedPlan,
  selectedDuration, setSelectedDuration,
  selectedNetwork, setSelectedNetwork,
  proPrice, flagshipPrice,
  proTotal, flagshipTotal,
  creating, error, handleCreatePayment,
  currentPayment, paymentExpiresAt,
  creditsPacks,
}: any) {
  const [tab, setTab] = useState<"sub" | "credits">("sub");
  const [selectedCredits, setSelectedCredits] = useState<3 | 4 | 5>(3);

  const isFlagship = selectedPlan === 2;
  const selectedTotal = isFlagship ? flagshipTotal : proTotal;
  const planLabel = isFlagship ? "旗舰" : "专业";

  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (!currentPayment?.pay_address) return;
    try { await navigator.clipboard.writeText(currentPayment.pay_address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }, [currentPayment?.pay_address]);

  const DURATION_OPTS = [
    { m: 1 as DurationMonths, label: "月付", badge: null },
    { m: 3 as DurationMonths, label: "季付", badge: "-10%" },
    { m: 12 as DurationMonths, label: "年付", badge: "-30%" },
  ];

  const countdown = useCountdown(paymentExpiresAt);
  const isExpired = countdown === "00:00";
  const st = currentPayment ? (STATUS_STYLES[currentPayment.status] ?? STATUS_STYLES.pending) : null;
  const statusMsg = currentPayment ? getPaymentStatusMessage(currentPayment.status, currentPayment.status_reason, isExpired) : "";

  const accentGlow = isFlagship
    ? "shadow-[0_0_25px_rgba(251,191,36,0.15)]"
    : "shadow-[0_0_25px_rgba(0,229,255,0.15)]";
  const accentBorder = tab === "credits" ? "border-emerald-500/20" : isFlagship ? "border-amber-500/20" : "border-[#00E5FF]/20";

  // 动态积分包：由后台配置驱动，加载期间使用空占位
  const packsToShow: Array<{ plan: 3|4|5; label: string; credits: string; price: number; desc: string }> =
    (creditsPacks ?? []).map((p: CreditPack) => ({
      plan: p.plan as 3 | 4 | 5,
      label: p.label.replace("积分包 ", "") + " 档",
      credits: `${p.credits}次`,
      price: p.price,
      desc: p.description,
    }));
  const selectedPack = packsToShow.find(p => p.plan === selectedCredits) ?? packsToShow[0];

  return (
    <div className={`sticky top-24 rounded-2xl bg-[#0a0d14]/80 backdrop-blur-2xl border ${accentBorder} overflow-hidden ${tab === "credits" ? "shadow-[0_0_25px_rgba(52,211,153,0.12)]" : accentGlow}`}>
      {/* Tab Switch */}
      <div className="p-2 border-b border-white/[0.05]">
        <div className="relative flex p-1 bg-black/40 rounded-lg border border-white/[0.06]">
          {(["sub", "credits"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`relative flex-1 py-3 text-[11px] font-black font-mono uppercase tracking-[0.2em] z-10 transition-colors ${
                tab === t
                  ? t === "credits" ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {t === "sub" ? "订阅套餐" : "积分充值"}
              {tab === t && (
                <motion.div
                  layoutId="checkoutTab"
                  className={`absolute inset-0 rounded-md -z-10 ${t === "credits" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-[#00E5FF]/10 border border-[#00E5FF]/20"}`}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {currentPayment ? (
          // ── Active Payment ──────────────────────────
          <motion.div key="payment" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
              <div>
                <p className="text-[11px] font-black font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">支付信息</p>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                  <span className="text-sm font-black font-mono text-white uppercase tracking-wider">
                    {["免费","专业","旗舰","积分包S","积分包M","积分包L"][currentPayment.plan] ?? `套餐${currentPayment.plan}`}
                  </span>
                </div>
              </div>
              {currentPayment.status === "pending" && !isExpired ? (
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1.5">剩余时间</p>
                  <span className="font-mono text-2xl font-black text-amber-400 tracking-tighter drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]">{countdown}</span>
                </div>
              ) : (
                <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${isExpired && currentPayment.status === "pending" ? "border-zinc-700 text-zinc-500 bg-zinc-800/50" : `${st?.bg} ${st?.text} border-current/25`}`}>
                  {isExpired && currentPayment.status === "pending" ? "已过期" : st?.label}
                </span>
              )}
            </div>

            <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-4">
              <p className="text-[8px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400 mb-2">应付金额</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black font-mono text-white">{currentPayment.pay_amount}</span>
                <span className="text-sm font-bold text-zinc-500">{currentPayment.pay_currency?.toUpperCase()}</span>
              </div>
              <p className="text-[9px] font-mono text-zinc-400 mt-1">网络：<span className="text-zinc-400">{currentPayment.network}</span></p>
            </div>

            {currentPayment.pay_address && (
              <div>
                <p className="text-[8px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400 mb-2">收款地址</p>
                <div className="relative">
                  <p className="font-mono text-[10px] text-indigo-300 break-all leading-relaxed p-4 pr-12 border border-white/[0.08] rounded-lg bg-black/40">{currentPayment.pay_address}</p>
                  <button onClick={handleCopy} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 bg-black rounded border border-white/10 hover:bg-white/10 transition-colors">
                    {copied ? <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      : <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                  </button>
                </div>
              </div>
            )}

            {/* Oxapay 托管支付页面入口 */}
            {currentPayment.payment_url && currentPayment.status === "pending" && !isExpired && (
              <a
                href={currentPayment.payment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] font-black uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:shadow-[0_0_30px_rgba(99,102,241,0.4)]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                打开支付页面
              </a>
            )}

            <div className="p-3.5 rounded-lg border border-white/[0.05] bg-black/30">
              <span className={`text-[9px] font-mono font-bold uppercase tracking-widest flex items-center gap-2 ${currentPayment.status === "pending" && isExpired ? "text-zinc-400" : st?.text}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />{statusMsg}
              </span>
              <p className="mt-1.5 text-[8px] text-zinc-500 font-mono italic">
                {currentPayment.plan >= 3 ? "链上到账后自动发放积分，通常 1-3 个确认块" : "链上到账后自动升级，通常 1-3 个确认块（约 1 分钟）"}
              </p>
            </div>
          </motion.div>
        ) : tab === "sub" ? (
          // ── Subscription Checkout ───────────────────
          <motion.div key="checkout-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-8 flex flex-col gap-6">
            <h3 className="text-[11px] font-black font-mono uppercase tracking-[0.25em] text-zinc-500 border-b border-white/[0.05] pb-4">
              选择套餐 · 数字货币结算
            </h3>

            {/* Plan Toggle */}
            <div>
              <p className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-500 mb-3">套餐</p>
              <div className="grid grid-cols-2 gap-3">
                {[{ plan: 1, label: "专业", price: proPrice }, { plan: 2, label: "旗舰", price: flagshipPrice }].map(p => (
                  <button key={p.plan} onClick={() => setSelectedPlan(p.plan as 1|2)}
                    className={`relative flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-300 ${
                      selectedPlan === p.plan
                        ? p.plan === 2
                          ? "border-amber-500/50 bg-amber-500/10 shadow-[inset_0_0_20px_rgba(251,191,36,0.15)] ring-1 ring-amber-500"
                          : "border-[#00E5FF]/50 bg-[#00E5FF]/10 shadow-[inset_0_0_20px_rgba(0,229,255,0.15)] ring-1 ring-[#00E5FF]"
                        : "border-white/[0.06] bg-[#0A0D14]/80 hover:border-white/15 hover:bg-white/[0.02]"
                    }`}>
                    <span className={`text-[13px] font-black font-mono uppercase tracking-widest ${selectedPlan === p.plan ? (p.plan === 2 ? "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" : "text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]") : "text-zinc-400"}`}>{p.label}</span>
                    <span className={`mt-1.5 text-[11px] font-mono font-bold ${selectedPlan === p.plan ? (p.plan === 2 ? "text-amber-300/80" : "text-[#00E5FF]/80") : "text-zinc-500"}`}>${p.price}/月</span>
                    {selectedPlan === p.plan && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${p.plan === 2 ? "bg-amber-400" : "bg-[#00E5FF]"}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${p.plan === 2 ? "bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.8)]" : "bg-[#00E5FF] shadow-[0_0_8px_rgba(0,229,255,0.8)]"}`}></span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <p className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-500 mb-3">计费周期</p>
              <div className="grid grid-cols-3 gap-3">
                {DURATION_OPTS.map(opt => (
                  <button key={opt.m} onClick={() => setSelectedDuration(opt.m)}
                    className={`relative rounded-xl border py-3.5 flex flex-col items-center gap-1 transition-all ${selectedDuration === opt.m ? "bg-white/[0.08] border-white/30 shadow-[inset_0_2px_10px_rgba(255,255,255,0.05)]" : "bg-black/50 border-white/[0.06] hover:border-white/15"}`}>
                    <span className={`text-[11px] md:text-xs font-black font-mono uppercase tracking-widest ${selectedDuration === opt.m ? "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]" : "text-zinc-500"}`}>{opt.label}</span>
                    {opt.badge && (
                      <span className={`absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-[2px] border text-[9px] font-black rounded-sm whitespace-nowrap ${
                        selectedDuration === opt.m 
                          ? "bg-[#FF1744]/20 border-[#FF1744]/40 text-[#FF1744] shadow-[0_0_10px_rgba(255,23,68,0.4)]"
                          : "bg-[#FF1744]/10 border-[#FF1744]/20 text-[#FF1744]/70"
                      }`}>
                        {opt.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Network */}
            <div>
              <p className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-500 mb-3">支付网络 · USDT Only</p>
              <div className="grid grid-cols-3 gap-3">
                {NETWORKS.map(net => (
                  <button key={net} onClick={() => setSelectedNetwork(net)}
                    className={`rounded-xl border py-3 text-[10px] md:text-[11px] font-bold font-mono tracking-wider transition-all ${selectedNetwork === net ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[inset_0_2px_10px_rgba(16,185,129,0.1)]" : "bg-black/50 border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/15"}`}>
                    {net}
                  </button>
                ))}
              </div>
            </div>

            {/* Total */}
            <div className="pt-6 border-t border-white/[0.05]">
              <div className="flex items-end justify-between mb-6">
                <div>
                  <p className="text-[10px] text-zinc-500 font-black font-mono uppercase tracking-[0.25em] mb-1.5">应付总计</p>
                  <p className="text-[11px] text-zinc-400 font-mono tracking-wide">{planLabel} · {DURATION_OPTS.find(x => x.m === selectedDuration)?.label}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-end gap-1.5">
                    <span className="text-xl md:text-2xl font-bold font-mono text-white mb-1">$</span>
                    <span className="text-5xl md:text-6xl font-black font-mono leading-none tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{selectedTotal}</span>
                  </div>
                  {selectedDuration > 1 && (
                    <span className="text-[10px] text-emerald-400 font-mono font-bold tracking-wider bg-emerald-500/10 px-2.5 py-1 rounded-md mt-2 inline-block shadow-[inset_0_1px_4px_rgba(16,185,129,0.1)]">
                      均 ${(selectedTotal / selectedDuration).toFixed(0)}/月
                    </span>
                  )}
                </div>
              </div>

              <button onClick={() => handleCreatePayment("sub")} disabled={creating}
                className={`btn-primary relative w-full h-14 md:h-16 flex items-center justify-center gap-3 font-mono text-xs md:text-sm font-black uppercase tracking-[0.15em] border ${
                  isFlagship 
                  ? "bg-gradient-to-r from-amber-600 to-amber-400 border-amber-400/50 shadow-[0_0_25px_rgba(251,191,36,0.3)] hover:shadow-[0_0_40px_rgba(251,191,36,0.6)]" 
                  : "bg-gradient-to-r from-[#00E5FF] to-fuchsia-600 border-[#00E5FF]/50 shadow-[0_0_25px_rgba(0,229,255,0.3)] hover:shadow-[0_0_40px_rgba(0,229,255,0.6)]"
                }`}>
                {creating ? (
                  <><span className="animate-spin w-5 h-5 border-[3px] border-white/20 border-t-white rounded-full" /> 终端连线中...</>
                ) : (
                  <>支付 ${selectedTotal} USDT
                    <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1.5 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>

              {error && (
                <div className="mt-3 bg-[#FF1744]/10 border border-[#FF1744]/20 p-3 rounded-lg">
                  <p className="text-[9px] font-mono font-bold text-[#FF1744] text-center">{error}</p>
                </div>
              )}
              <p className="mt-3 text-[8px] font-mono text-zinc-500 text-center leading-relaxed">
                [SECURE CONNECTION ALIVE | NODE VERIFIED] <br/>
                到账后自动发放入库 · 链上智能合约结算不可退 · 到期后权限回收
              </p>
            </div>
          </motion.div>
        ) : (
          // ── Credits Pack Checkout ────────────────────
          <motion.div key="checkout-credits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-8 flex flex-col gap-6">
            <h3 className="text-[11px] font-black font-mono uppercase tracking-[0.25em] text-zinc-500 border-b border-white/[0.05] pb-4">
              积分充值 · 超短线分析次数
            </h3>

            {/* Pack Selection */}
            <div className="flex flex-col gap-3">
              {packsToShow.length === 0 && (
                <div className="flex items-center justify-center py-8 text-xs font-mono text-zinc-500">
                  <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  加载中...
                </div>
              )}
              {packsToShow.map(pack => (
                <button key={pack.plan} onClick={() => setSelectedCredits(pack.plan as 3 | 4 | 5)}
                  className={`relative flex items-center justify-between rounded-xl border p-5 text-left transition-all duration-300 ${
                    selectedCredits === pack.plan
                      ? "border-emerald-500/50 bg-emerald-500/[0.08] shadow-[inset_0_2px_15px_rgba(52,211,153,0.1)] scale-100"
                      : "border-white/[0.06] bg-black/30 hover:border-white/[0.15] scale-[0.98] hover:scale-100"
                  }`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[11px] font-black font-mono uppercase tracking-widest ${
                        selectedCredits === pack.plan ? "text-emerald-400" : "text-zinc-500"
                      }`}>{pack.label}</span>
                      <span className="text-[9px] font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.06] px-1.5 py-[2px] rounded">{pack.desc}</span>
                    </div>
                    <span className={`text-sm tracking-widest font-bold font-mono ${
                      selectedCredits === pack.plan ? "text-emerald-300" : "text-zinc-400"
                    }`}>{pack.credits} 次</span>
                  </div>
                  <div className="text-right pr-2">
                    <div className="flex items-end gap-1">
                      <span className={`text-xl font-bold font-mono mb-0.5 ${
                        selectedCredits === pack.plan ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "text-zinc-400"
                      }`}>$</span>
                      <span className={`text-4xl font-black font-mono leading-none tracking-tighter ${
                        selectedCredits === pack.plan ? "text-white" : "text-zinc-400"
                      }`}>{pack.price}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-400 inline-block mt-1">
                      ≈ ${(pack.price / parseInt(pack.credits)).toFixed(2)}/次
                    </span>
                  </div>
                  {selectedCredits === pack.plan && (
                    <span className="absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                  )}
                </button>
              ))}
            </div>

            {/* Network */}
            <div>
              <p className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-500 mb-3">支付网络 · USDT Only</p>
              <div className="grid grid-cols-3 gap-3">
                {NETWORKS.map(net => (
                  <button key={net} onClick={() => setSelectedNetwork(net)}
                    className={`rounded-xl border py-3 text-[10px] md:text-[11px] font-bold font-mono tracking-wider transition-all ${selectedNetwork === net ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[inset_0_2px_10px_rgba(16,185,129,0.1)]" : "bg-black/50 border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/15"}`}>
                    {net}
                  </button>
                ))}
              </div>
            </div>

            {/* Total */}
            <div className="pt-6 border-t border-white/[0.05]">
              <div className="flex items-end justify-between mb-6">
                <div>
                  <p className="text-[10px] text-zinc-500 font-black font-mono uppercase tracking-[0.25em] mb-1.5">应付总计</p>
                  <p className="text-[11px] text-emerald-500/60 font-mono tracking-wide">{selectedPack?.credits ?? "--"} · 一次性 · 永不过期</p>
                </div>
                <div className="flex items-end gap-1.5">
                  <span className="text-xl md:text-2xl font-bold font-mono text-white mb-1">$</span>
                  <span className="text-5xl md:text-6xl font-black font-mono leading-none tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{selectedPack?.price ?? "--"}</span>
                </div>
              </div>

              <button onClick={() => handleCreatePayment("credits", selectedCredits)} disabled={creating || !selectedPack}
                className="btn-primary relative w-full h-14 md:h-16 flex items-center justify-center gap-3 font-mono text-xs md:text-sm font-black uppercase tracking-[0.15em] border bg-gradient-to-r from-emerald-500 to-emerald-400 border-emerald-400/50 shadow-[0_0_25px_rgba(52,211,153,0.3)] hover:shadow-[0_0_40px_rgba(52,211,153,0.6)]">
                {creating ? (
                  <><span className="animate-spin w-5 h-5 border-[3px] border-white/20 border-t-white rounded-full" /> 终端连线中...</>
                ) : (
                  <>充值 {selectedPack?.credits ?? "--"}
                    <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1.5 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>

              {error && (
                <div className="mt-3 bg-[#FF1744]/10 border border-[#FF1744]/20 p-3 rounded-lg">
                  <p className="text-[9px] font-mono font-bold text-[#FF1744] text-center">{error}</p>
                </div>
              )}
              <p className="mt-3 text-[8px] font-mono text-zinc-500 text-center leading-relaxed">
                [SECURE CONNECTION ALIVE | NODE VERIFIED] <br/>
                到账后立刻执行链上空投积分 · 永久有效 · 数据不可逆回滚
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function MembershipPage() {
  const [selectedPlan, setSelectedPlan] = useState<1 | 2>(1);
  const [selectedDuration, setSelectedDuration] = useState<DurationMonths>(1);
  const [selectedNetwork, setSelectedNetwork] = useState<PaymentNetwork>("TRC-20");
  const [currentPayment, setCurrentPayment] = useState<PaymentInfo | null>(null);
  const [paymentExpiresAt, setPaymentExpiresAt] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const completedRef = useRef(false);

  const { data: user } = useQuery<UserInfo>({ queryKey: ["currentUser"], queryFn: fetchCurrentUser });
  const { data: plansData } = useQuery<PlansResponse>({ queryKey: ["membershipPlans"], queryFn: fetchPlans });
  const { data: trial } = useQuery<FreeTrialStatus>({ queryKey: ["freeTrial"], queryFn: fetchFreeTrialStatus });
  // 动态积分包：后台再配置价格/次数后，前台自动同步
  const { data: creditPacks } = useQuery<CreditPack[]>({
    queryKey: ["creditPacks"],
    queryFn: fetchCreditPacks,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
  const { history, currentPayment: synced } = usePaymentStatusSync(currentPayment);

  useEffect(() => {
    if (!currentPayment || !synced) return;
    if (currentPayment.payment_id === synced.payment_id) setCurrentPayment(synced);
  }, [currentPayment, synced]);

  useEffect(() => {
    if (currentPayment?.status === "completed" && !completedRef.current) {
      completedRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    }
    if (currentPayment?.status !== "completed") completedRef.current = false;
  }, [currentPayment?.status, queryClient]);

  const proPlan = plansData?.plans?.find(p => p.plan === 1);
  const flagPlan = plansData?.plans?.find(p => p.plan === 2);

  const getTotal = (plan: typeof proPlan, dur: DurationMonths) => {
    if (!plan) return 0;
    return dur === 3 ? plan.price_quarterly : dur === 12 ? plan.price_yearly : plan.price_monthly;
  };

  const handleCreatePayment = useCallback(async (
    type: "sub" | "credits" = "sub",
    creditsPlan?: 3 | 4 | 5,
  ) => {
    setCreating(true); setError(null);
    try {
      const plan = type === "credits" ? (creditsPlan ?? 3) : selectedPlan;
      const payment = await createPayment({ plan, network: selectedNetwork, duration_months: selectedDuration });
      setCurrentPayment(payment);
      setPaymentExpiresAt(Date.now() + PAYMENT_TIMEOUT_MS);
      queryClient.invalidateQueries({ queryKey: ["paymentHistory"] });
      // Oxapay 返回托管支付页面，自动打开新标签让用户扫码/转账
      if (payment.payment_url) {
        window.open(payment.payment_url, "_blank", "noopener,noreferrer");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "创建支付失败");
    } finally { setCreating(false); }
  }, [queryClient, selectedPlan, selectedNetwork, selectedDuration]);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto text-white selection:bg-[#00E5FF]/30">
      {/* Header */}
      <div className="mb-8 md:mb-12">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black font-mono tracking-tighter uppercase mb-3 text-white">会员中心</h1>
        <p className="text-[11px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500">账单与订阅 / Billing & Subscriptions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
          {user && <AccountHero user={user} trial={trial} />}
          <FeatureTable plansData={plansData} />
          <PaymentHistory payments={history} />
        </div>

        {/* Right: Checkout */}
        <div className="lg:col-span-5 xl:col-span-4">
          <CheckoutSidebar
            selectedPlan={selectedPlan} setSelectedPlan={setSelectedPlan}
            selectedDuration={selectedDuration} setSelectedDuration={setSelectedDuration}
            selectedNetwork={selectedNetwork} setSelectedNetwork={setSelectedNetwork}
            proPrice={proPlan?.price_monthly ?? 99}
            flagshipPrice={flagPlan?.price_monthly ?? 299}
            proTotal={getTotal(proPlan, selectedDuration)}
            flagshipTotal={getTotal(flagPlan, selectedDuration)}
            creating={creating} error={error}
            handleCreatePayment={handleCreatePayment}
            currentPayment={synced} paymentExpiresAt={paymentExpiresAt}
            creditsPacks={creditPacks}
          />
        </div>
      </div>
    </div>
  );
}
