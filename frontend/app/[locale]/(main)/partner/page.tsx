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
    return (<PageTransition><div className="mx-auto max-w-4xl px-4 py-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-28 bg-bg-surface border border-border rounded-xl animate-pulse" />))}</div></PageTransition>);
  }

  if (isError || !dashboard) {
    return (<PageTransition><div className="mx-auto max-w-4xl px-4 py-8"><div className="bg-bg-surface border border-border rounded-xl p-8 text-center shadow-inner"><Users size={32} className="mx-auto text-zinc-600 mb-4 opacity-50" /><p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{t('error.loadFailed')}</p><p className="text-[10px] font-mono font-bold text-zinc-500 mt-2 uppercase tracking-widest">&nbsp;</p></div></div></PageTransition>);
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
          <h1 className="flex items-center gap-2.5 text-xl font-black text-white font-mono tracking-tight uppercase">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 shadow-inner">
              <Users size={16} className="text-blue-400" />
            </div>
            {t('title')}
          </h1>
          <p className="mt-2 text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{t('subtitle')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }} className="bg-bg-surface border border-border hover:border-zinc-700 transition-colors rounded-xl px-5 py-4 shadow-inner">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-inner border border-white/5 ${s.bg}`}><s.icon size={18} className={s.color} /></div>
                <div>
                  <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest line-clamp-1">{s.label}</p>
                  <p className={`text-xl font-black font-mono tracking-tight mt-1 leading-none ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Referral Link */}
        <div className="bg-[#09090b] border border-border rounded-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#09090b] to-[#09090b]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-indigo-400/80 uppercase tracking-widest font-mono mb-2">{t('overview.referralCode')}</p>
              <p className="text-4xl font-black font-mono text-white tracking-widest drop-shadow-md">{d.referral_code}</p>
            </div>
            <button onClick={copyLink} className="shrink-0 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-xs font-bold font-mono uppercase tracking-widest text-white hover:bg-indigo-500 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2),_0_5px_15px_rgba(99,102,241,0.2)] active:scale-[0.98]">
              <Copy size={16} />{linkCopied ? t('overview.linkCopied') : effectiveLink ? t('overview.copyLink') : t('overview.copyCode')}
            </button>
          </div>
          {effectiveLink && (
            <div className="mt-6 flex items-center gap-3 rounded-lg bg-black/40 border border-white/5 px-4 py-3 backdrop-blur-sm">
              <LinkIcon size={14} className="text-indigo-400 shrink-0" />
              <p className="truncate text-[11px] text-zinc-400 font-mono tracking-wider">{effectiveLink}</p>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500">
            <Percent size={12} className="text-zinc-600" />{t('overview.commissionRate')}: <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded ml-1">{(d.commission_rate * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-bg-surface border border-border p-1.5 shadow-inner overflow-x-auto min-w-full sm:min-w-fit">
          {tabs.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)} className={`flex-1 min-w-[100px] py-2.5 text-xs font-bold font-mono uppercase tracking-widest rounded-lg transition-all duration-200 ${tab === item.key ? "bg-bg-elevated border border-border text-white shadow-sm" : "text-zinc-500 hover:text-zinc-400 hover:bg-bg-primary/50"}`}>{item.label}</button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {tab === "overview" && (
            <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-bg-surface border border-border rounded-xl p-10 text-center shadow-inner relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(234,179,8,0.05)_0%,_transparent_70%)] pointer-events-none" />
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-500/10 border border-yellow-500/20 shadow-inner mx-auto mb-6 relative z-10"><DollarSign size={28} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" /></div>
              <p className="text-4xl font-black font-mono text-white tracking-tight mb-2 relative z-10">${d.total_commission.toFixed(2)}</p>
              <p className="text-xs font-bold font-mono text-zinc-400 uppercase tracking-widest relative z-10">{t('overview.summaryInvited', { total: d.total_invitations, paid: d.total_paid_referees })}</p>
              {d.frozen > 0 && <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-bold font-mono uppercase tracking-widest text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 py-1.5 px-3 rounded-md w-fit mx-auto relative z-10"><Snowflake size={12} />{t('overview.frozen', { amount: d.frozen.toFixed(2) })}</div>}
            </motion.div>
          )}

          {tab === "invitations" && (
            <motion.div key="inv" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              {invitations.length === 0 ? (
                <div className="bg-bg-surface border border-border rounded-xl py-16 text-center shadow-inner"><Users size={32} className="mx-auto text-zinc-600 mb-4 opacity-50" /><p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{t('invitations.empty')}</p></div>
              ) : invitations.map((inv: Invitation, idx: number) => (
                <motion.div key={inv.user_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="flex items-center justify-between bg-bg-surface border border-border hover:border-zinc-700 transition-colors rounded-xl px-5 py-4 shadow-inner">
                  <div>
                    <p className="text-sm font-bold text-zinc-200 font-mono tracking-wide">{inv.email_masked}</p>
                    <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest mt-1.5">{inv.registered_at ? new Date(inv.registered_at).toLocaleDateString() : "-"}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-400 bg-bg-elevated border border-border px-2.5 py-1 rounded shadow-sm">{levelLabels[inv.membership_level] ?? levelLabels[0]}</span>
                    {inv.total_commission > 0 && <span className="text-sm font-black font-mono tracking-tight text-emerald-400">+${inv.total_commission.toFixed(2)}</span>}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {tab === "commissions" && (
            <motion.div key="com" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              {commissions.length === 0 ? (
                <div className="bg-bg-surface border border-border rounded-xl py-16 text-center shadow-inner"><DollarSign size={32} className="mx-auto text-zinc-600 mb-4 opacity-50" /><p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{t('commissions.empty')}</p></div>
              ) : commissions.map((c: CommissionRecord, idx: number) => (
                <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="flex items-center justify-between bg-bg-surface border border-border hover:border-zinc-700 transition-colors rounded-xl px-5 py-4 shadow-inner">
                  <div>
                    <p className="text-sm font-bold text-zinc-200 font-mono tracking-wide">{c.referee_email_masked}</p>
                    <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest mt-1.5">${c.payment_amount_usd.toFixed(2)} × {(c.commission_rate * 100).toFixed(0)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-black font-mono tracking-tight text-emerald-400">+${c.commission_amount.toFixed(2)}</p>
                    <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest mt-1">{new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {tab === "wallet" && (
            <motion.div key="wal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              {/* Wallet Binding */}
              <div className="bg-bg-surface border border-border rounded-xl p-6 sm:p-8 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-purple-500/5 to-transparent pointer-events-none" />
                <h3 className="text-xs font-bold text-white mb-6 flex items-center gap-3 uppercase tracking-widest relative z-10">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-inner"><Wallet size={16} /></span>
                  {t('wallet.title')}
                </h3>
                {wallet?.trc20_address ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 relative z-10">
                    <code className="flex-1 truncate rounded-xl bg-bg-primary/50 border border-border px-4 py-3.5 text-sm text-zinc-300 font-mono shadow-inner">{wallet.trc20_address}</code>
                    <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded flex items-center gap-1.5 uppercase tracking-widest w-fit"><CheckCircle2 size={12} /> {t('wallet.bound')}</span>
                  </div>
                ) : (
                  <p className="text-[11px] font-bold font-mono text-zinc-500 uppercase tracking-widest mb-3 relative z-10">{t('wallet.unbound')}</p>
                )}
                <div className="mt-4 flex flex-col sm:flex-row gap-3 relative z-10">
                  <input value={trc20Input} onChange={(e) => setTrc20Input(e.target.value)} placeholder={t('wallet.addressPlaceholder')}
                    className="flex-1 rounded-xl border border-border bg-bg-primary/50 px-4 py-3.5 text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 outline-none transition-all shadow-inner" />
                  <button onClick={() => walletMut.mutate(trc20Input)} disabled={trc20Input.length !== 34 || walletMut.isPending}
                    className="rounded-xl bg-bg-elevated border border-border px-6 py-3.5 text-[11px] font-bold font-mono uppercase tracking-widest text-zinc-300 hover:bg-bg-primary hover:text-white disabled:opacity-40 transition-all shadow-inner tabular-nums min-w-[120px]">
                    {walletMut.isPending ? "..." : wallet?.trc20_address ? t('wallet.change') : t('wallet.bind')}
                  </button>
                </div>
                {walletMut.isError && <p className="mt-3 text-[10px] font-bold font-mono text-red-400 uppercase tracking-widest bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-md inline-block relative z-10 flex items-center gap-1.5"><XCircle size={12} /> {(walletMut.error as Error).message}</p>}
              </div>

              {/* Withdraw */}
              <button onClick={() => withdrawMut.mutate()} disabled={d.balance <= 0 || withdrawMut.isPending || !wallet?.trc20_address}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-[11px] font-bold font-mono uppercase tracking-widest text-white hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98]">
                <ArrowDownToLine size={16} />{withdrawMut.isPending ? t('wallet.withdrawing') : t('wallet.withdrawButton', { amount: d.balance.toFixed(2) })}
              </button>
              {withdrawMut.isError && <div className="flex justify-center"><p className="text-[10px] font-bold font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 uppercase tracking-widest"><XCircle size={12} /> {(withdrawMut.error as Error).message}</p></div>}
              {withdrawMut.isSuccess && <div className="flex justify-center"><p className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 uppercase tracking-widest"><CheckCircle2 size={12} /> Withdrawal Requested</p></div>}

              {/* History */}
              <div className="space-y-4 pt-4 border-t border-border/50">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest px-1">{t('wallet.history.title')}</h3>
                {withdrawals.length === 0 ? (
                  <div className="bg-bg-surface border border-border rounded-xl py-12 text-center shadow-inner"><p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{t('wallet.history.empty')}</p></div>
                ) : withdrawals.map((w: WithdrawalRecord) => {
                  const st = withdrawalStatusMap[w.status as keyof typeof withdrawalStatusMap] ?? withdrawalStatusMap.pending;
                  const Icon = st.icon;
                  return (
                    <div key={w.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg-surface border border-border hover:border-zinc-700 transition-colors rounded-xl px-5 py-4 shadow-inner">
                      <div className="flex items-center gap-3.5">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-inner border border-white/5 bg-opacity-20 ${st.color.replace('text-', 'bg-')}`}><Icon size={14} className={st.color} /></div>
                        <div className="min-w-0">
                          <p className="text-base font-black font-mono tracking-tight text-white">${w.amount.toFixed(2)}</p>
                          <p className="text-[10px] font-mono text-zinc-500 truncate max-w-[200px] mt-0.5">{w.trc20_address}</p>
                        </div>
                      </div>
                      <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-border/50 pt-3 sm:pt-0">
                        <span className={`text-[9px] font-bold font-mono uppercase tracking-widest ${st.color} bg-white/5 px-2 py-0.5 rounded border border-white/5 shadow-sm`}>{st.label}</span>
                        <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest mt-1 sm:mt-1.5">{new Date(w.created_at).toLocaleDateString()}</p>
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
