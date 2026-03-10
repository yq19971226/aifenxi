"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import {
  partnerApi,
  type Invitation,
  type CommissionRecord,
  type WithdrawalRecord,
} from "@/lib/api/partner";
import {
  Users, Copy, Wallet, ArrowDownToLine, DollarSign, UserPlus,
  Clock, CheckCircle2, XCircle, Link as LinkIcon, Percent, Snowflake,
} from "lucide-react";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";

type Tab = "overview" | "invitations" | "commissions" | "wallet";

const TAB_KEYS: Tab[] = ["overview", "invitations", "commissions", "wallet"];
const LEVEL_KEYS: Record<number, string> = { 0: "0", 1: "1", 2: "2" };

const WALLET_STATUS_KEYS = ["pending", "completed", "rejected"] as const;

export default function PartnerPage() {
  const t = useTranslations('partner');
  const { getState } = useFeatureFlags();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [trc20Input, setTrc20Input] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const tabs = TAB_KEYS.map((key) => ({ key, label: t(`tabs.${key}`) }));
  const levelLabels: Record<number, string> = {
    0: t("levels.0"),
    1: t("levels.1"),
    2: t("levels.2"),
  };
  const withdrawalStatusMap = {
    pending: { label: t("wallet.history.status.pending"), color: "text-amber-400", icon: Clock },
    completed: { label: t("wallet.history.status.completed"), color: "text-emerald-400", icon: CheckCircle2 },
    rejected: { label: t("wallet.history.status.rejected"), color: "text-red-400", icon: XCircle },
  } satisfies Record<(typeof WALLET_STATUS_KEYS)[number], { label: string; color: string; icon: typeof Clock }>;

  const { data: dashboard, isLoading, isError } = useQuery({ queryKey: ["partner-dashboard"], queryFn: partnerApi.getDashboard });
  const { data: invitations = [] } = useQuery({ queryKey: ["partner-invitations"], queryFn: () => partnerApi.getInvitations(), enabled: tab === "invitations" });
  const { data: commissions = [] } = useQuery({ queryKey: ["partner-commissions"], queryFn: () => partnerApi.getCommissions(), enabled: tab === "commissions" });
  const { data: wallet } = useQuery({ queryKey: ["partner-wallet"], queryFn: partnerApi.getWallet, enabled: tab === "wallet" });
  const { data: withdrawals = [] } = useQuery({ queryKey: ["partner-withdrawals"], queryFn: () => partnerApi.getWithdrawals(), enabled: tab === "wallet" });

  const walletMut = useMutation({
    mutationFn: (addr: string) => partnerApi.upsertWallet(addr),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partner-wallet"] }); setTrc20Input(""); },
  });
  const withdrawMut = useMutation({
    mutationFn: partnerApi.requestWithdrawal,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partner-dashboard"] }); qc.invalidateQueries({ queryKey: ["partner-withdrawals"] }); },
  });

  const effectiveLink = dashboard?.referral_link || (dashboard?.referral_code ? `${typeof window !== "undefined" ? window.location.origin : ""}/login?ref=${dashboard.referral_code}` : "");

  const copyLink = () => {
    if (effectiveLink) navigator.clipboard.writeText(effectiveLink);
    else if (dashboard?.referral_code) navigator.clipboard.writeText(dashboard.referral_code);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (getState("partner") !== "active") {
    return <MaintenancePlaceholder featureName={t('title')} />;
  }

  if (isLoading) {
    return (<PageTransition><div className="mx-auto max-w-4xl px-4 py-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-20 skeleton rounded-lg" />))}</div></PageTransition>);
  }

  if (isError || !dashboard) {
    return (<PageTransition><div className="mx-auto max-w-4xl px-4 py-8"><div className="card p-8 text-center"><Users size={28} className="mx-auto text-zinc-700 mb-3" /><p className="text-sm text-zinc-400">{t('error.loadFailed')}</p><p className="text-xs text-zinc-500 mt-1">&nbsp;</p></div></div></PageTransition>);
  }

  const d = dashboard;
  const stats = [
    { label: t('overview.totalInvitations'), value: d.total_invitations, icon: UserPlus, color: "text-blue-400", bg: "bg-blue-500/[0.08]" },
    { label: t('overview.paidUsers'), value: d.total_paid_referees, icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/[0.08]" },
    { label: t('overview.totalCommission'), value: `$${d.total_commission.toFixed(2)}`, icon: DollarSign, color: "text-yellow-400", bg: "bg-yellow-500/[0.08]" },
    { label: t('overview.availableBalance'), value: `$${d.balance.toFixed(2)}`, icon: Wallet, color: "text-purple-400", bg: "bg-purple-500/[0.08]" },
  ];

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-6 px-4 md:px-8 py-8">
        {/* Header */}
        <div>
          <h1 className="flex items-center gap-2.5 text-lg md:text-xl font-semibold text-white">
            <Users size={20} className="text-blue-400" />{t('title')}
          </h1>
          <p className="mt-1 text-xs md:text-sm text-zinc-500">{t('subtitle')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }} className="card px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg}`}><s.icon size={15} className={s.color} /></div>
                <div>
                  <p className="text-sm md:text-xs text-zinc-500 leading-none">{s.label}</p>
                  <p className={`text-lg md:text-xl font-semibold font-mono mt-0.5 leading-none ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Referral Link */}
        <div className="card p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-zinc-500 uppercase tracking-wider font-medium mb-1.5">{t('overview.referralCode')}</p>
              <p className="text-xl font-mono font-bold text-white tracking-wider">{d.referral_code}</p>
            </div>
            <button onClick={copyLink} className="shrink-0 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-zinc-100 to-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:from-white hover:to-zinc-200 transition-all active:scale-[0.98]">
              <Copy size={14} />{linkCopied ? t('overview.linkCopied') : effectiveLink ? t('overview.copyLink') : t('overview.copyCode')}
            </button>
          </div>
          {effectiveLink && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
              <LinkIcon size={12} className="text-zinc-500 shrink-0" />
              <p className="truncate text-xs text-zinc-500 font-mono">{effectiveLink}</p>
            </div>
          )}
          <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
            <Percent size={11} />{t('overview.commissionRate')}: <span className="text-emerald-400 font-medium">{(d.commission_rate * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] p-1">
          {tabs.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)} className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${tab === item.key ? "bg-white/[0.08] text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-400"}`}>{item.label}</button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {tab === "overview" && (
            <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-yellow-500/[0.08] mx-auto mb-4"><DollarSign size={24} className="text-yellow-400" /></div>
              <p className="text-2xl font-bold font-mono text-white mb-1">${d.total_commission.toFixed(2)}</p>
              <p className="text-sm text-zinc-400">{t('overview.summaryInvited', { total: d.total_invitations, paid: d.total_paid_referees })}</p>
              {d.frozen > 0 && <div className="mt-4 flex items-center justify-center gap-2 text-xs text-yellow-400"><Snowflake size={12} />{t('overview.frozen', { amount: d.frozen.toFixed(2) })}</div>}
            </motion.div>
          )}

          {tab === "invitations" && (
            <motion.div key="inv" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
              {invitations.length === 0 ? (
                <div className="card py-16 text-center"><Users size={28} className="mx-auto text-zinc-700 mb-3" /><p className="text-sm text-zinc-500">{t('invitations.empty')}</p></div>
              ) : invitations.map((inv: Invitation, idx: number) => (
                <motion.div key={inv.user_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="flex items-center justify-between card px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{inv.email_masked}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{inv.registered_at ? new Date(inv.registered_at).toLocaleDateString() : "-"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 bg-white/[0.04] px-2 py-0.5 rounded">{levelLabels[inv.membership_level] ?? levelLabels[0]}</span>
                    {inv.total_commission > 0 && <span className="text-xs font-mono text-emerald-400">+${inv.total_commission.toFixed(2)}</span>}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {tab === "commissions" && (
            <motion.div key="com" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
              {commissions.length === 0 ? (
                <div className="card py-16 text-center"><DollarSign size={28} className="mx-auto text-zinc-700 mb-3" /><p className="text-sm text-zinc-500">{t('commissions.empty')}</p></div>
              ) : commissions.map((c: CommissionRecord, idx: number) => (
                <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="flex items-center justify-between card px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{c.referee_email_masked}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">${c.payment_amount_usd.toFixed(2)} × {(c.commission_rate * 100).toFixed(0)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono text-emerald-400">+${c.commission_amount.toFixed(2)}</p>
                    <p className="text-xs text-zinc-500">{new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {tab === "wallet" && (
            <motion.div key="wal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Wallet Binding */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Wallet size={14} className="text-purple-400" />{t('wallet.title')}
                </h3>
                {wallet?.trc20_address ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-sm text-zinc-300 font-mono">{wallet.trc20_address}</code>
                    <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{t('wallet.bound')}</span>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 mb-2">{t('wallet.unbound')}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <input value={trc20Input} onChange={(e) => setTrc20Input(e.target.value)} placeholder={t('wallet.addressPlaceholder')}
                    className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/[0.16] focus:outline-none transition-all" />
                  <button onClick={() => walletMut.mutate(trc20Input)} disabled={trc20Input.length !== 34 || walletMut.isPending}
                    className="rounded-lg bg-gradient-to-r from-zinc-100 to-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:from-white hover:to-zinc-200 disabled:opacity-40 transition-all">
                    {walletMut.isPending ? "..." : wallet?.trc20_address ? t('wallet.change') : t('wallet.bind')}
                  </button>
                </div>
                {walletMut.isError && <p className="mt-2 text-xs text-red-400">{(walletMut.error as Error).message}</p>}
              </div>

              {/* Withdraw */}
              <button onClick={() => withdrawMut.mutate()} disabled={d.balance <= 0 || withdrawMut.isPending || !wallet?.trc20_address}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors">
                <ArrowDownToLine size={16} />{withdrawMut.isPending ? t('wallet.withdrawing') : t('wallet.withdrawButton', { amount: d.balance.toFixed(2) })}
              </button>
              {withdrawMut.isError && <p className="text-xs text-red-400">{(withdrawMut.error as Error).message}</p>}
              {withdrawMut.isSuccess && <p className="text-xs text-emerald-400">&nbsp;</p>}

              {/* History */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">{t('wallet.history.title')}</h3>
                {withdrawals.length === 0 ? (
                  <div className="card py-10 text-center"><p className="text-sm text-zinc-500">{t('wallet.history.empty')}</p></div>
                ) : withdrawals.map((w: WithdrawalRecord) => {
                  const st = withdrawalStatusMap[w.status as keyof typeof withdrawalStatusMap] ?? withdrawalStatusMap.pending;
                  const Icon = st.icon;
                  return (
                    <div key={w.id} className="flex items-center justify-between card px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Icon size={15} className={st.color} />
                        <div>
                          <p className="text-sm font-mono text-white">${w.amount.toFixed(2)}</p>
                          <p className="text-xs text-zinc-500 truncate max-w-[200px] font-mono">{w.trc20_address}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                        <p className="text-xs text-zinc-500">{new Date(w.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
