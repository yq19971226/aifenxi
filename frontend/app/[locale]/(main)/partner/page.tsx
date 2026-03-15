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
        <div className="pb-6 border-b border-white/[0.05]">
          <h1 className="flex items-center gap-3 text-2xl font-black text-white font-mono tracking-widest uppercase mb-2">
            <span className="flex items-center justify-center w-8 h-8 bg-blue-500/10 border border-blue-500/30">
              <Users size={16} className="text-blue-400" />
            </span>
            {t('title')}
          </h1>
          <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.2em]">{t('subtitle')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mt-6">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }} className="relative bg-black border border-white/[0.05] p-5 overflow-hidden group">
              <div className={`absolute top-0 right-0 w-8 h-[1px] ${s.bg.includes('blue') ? 'bg-blue-500/50' : s.bg.includes('emerald') ? 'bg-emerald-500/50' : s.bg.includes('yellow') ? 'bg-yellow-500/50' : 'bg-purple-500/50'}`} />
              <div className="flex items-start gap-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 ${s.bg.replace('/[0.08]', '/10')} shadow-[0_0_10px_currentColor] opacity-30 drop-shadow-md`} style={{ color: s.color.replace('text-', 'var(--tw-') }}>
                  <s.icon size={18} className={s.color} />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black font-mono text-zinc-500 uppercase tracking-[0.2em] line-clamp-1 mb-1">{s.label}</p>
                  <p className={`text-xl font-black font-mono tracking-tighter leading-none truncate ${s.color} drop-shadow-[0_0_8px_currentColor]`}>{s.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Referral Link */}
        <div className="relative bg-black border border-indigo-500/20 p-6 sm:p-8 mt-6 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-indigo-500/50" />
          <div className="absolute top-0 right-0 w-8 h-[1px] bg-indigo-500/50" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
            <div className="min-w-0">
              <p className="text-[10px] font-black font-mono text-indigo-400 uppercase tracking-[0.3em] mb-2">{t('overview.referralCode')}</p>
              <p className="text-4xl font-black font-mono text-white tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{d.referral_code}</p>
            </div>
            <button onClick={copyLink} className="shrink-0 flex items-center justify-center gap-2 border border-indigo-500/40 bg-indigo-600/90 px-6 py-4 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-white hover:bg-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all active:scale-[0.98]">
              <Copy size={16} />{linkCopied ? t('overview.linkCopied') : effectiveLink ? t('overview.copyLink') : t('overview.copyCode')}
            </button>
          </div>
          
          {effectiveLink && (
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 border-t border-white/[0.05] pt-6">
               <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] px-4 py-3 flex-1">
                 <LinkIcon size={14} className="text-indigo-400 shrink-0" />
                 <code className="truncate text-[10px] text-zinc-400 font-mono tracking-widest">{effectiveLink}</code>
               </div>
               <div className="flex items-center gap-2 text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500 shrink-0">
                  <Percent size={12} className="text-zinc-600" />
                  {t('overview.commissionRate')}: 
                  <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 ml-1 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                    {(d.commission_rate * 100).toFixed(0)}%
                  </span>
               </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-white/[0.05] relative mt-10">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`pb-4 text-[11px] font-black font-mono uppercase tracking-widest transition-colors relative ${
                tab === item.key ? "text-white" : "text-zinc-500 hover:text-zinc-400"
              }`}
            >
              {item.label}
              {tab === item.key && (
                <motion.div
                  layoutId="partnerTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {tab === "overview" && (
            <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative bg-black border border-yellow-500/20 p-12 text-center overflow-hidden">
               <div className="absolute top-0 right-0 w-8 h-[1px] bg-yellow-500/50" />
               <div className="absolute bottom-0 left-0 w-8 h-[1px] bg-yellow-500/50" />
               <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(234,179,8,0.05)_0%,_transparent_50%)] pointer-events-none" />
              
              <div className="flex h-16 w-16 items-center justify-center border border-yellow-500/30 bg-yellow-500/10 mx-auto mb-8 relative z-10 shadow-[0_0_20px_rgba(234,179,8,0.1)]"><DollarSign size={28} className="text-yellow-400" /></div>
              <p className="text-5xl font-black font-mono text-white tracking-widest mb-4 relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">${d.total_commission.toFixed(2)}</p>
              <p className="text-[10px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em] relative z-10">{t('overview.summaryInvited', { total: d.total_invitations, paid: d.total_paid_referees })}</p>
              
              {d.frozen > 0 && (
                <div className="mt-8 pt-6 border-t border-white/[0.05] relative z-10">
                   <div className="flex items-center justify-center gap-2 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 py-2 px-4 w-fit mx-auto shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                     <Snowflake size={12} />{t('overview.frozen', { amount: d.frozen.toFixed(2) })}
                   </div>
                </div>
              )}
            </motion.div>
          )}

          {tab === "invitations" && (
            <motion.div key="inv" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {invitations.length === 0 ? (
                <div className="relative bg-black border border-white/[0.05] py-20 text-center overflow-hidden">
                   <Users size={32} className="mx-auto text-zinc-700 mb-6" />
                   <p className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em]">{t('invitations.empty')}</p>
                </div>
              ) : (
                <div className="relative bg-black border border-white/[0.05] p-6 lg:p-8 overflow-hidden">
                   <div className="absolute top-0 right-0 w-8 h-[1px] bg-white/[0.2]" />
                   <p className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500 mb-6">邀请记录</p>
                   <div className="overflow-x-auto">
                     <table className="w-full text-sm font-mono">
                       <thead>
                         <tr className="border-b border-white/[0.1]">
                           <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">用户邮箱</th>
                           <th className="pb-4 text-center text-[10px] font-bold text-zinc-600 tracking-widest uppercase">等级</th>
                           <th className="pb-4 text-center text-[10px] font-bold text-zinc-600 tracking-widest uppercase">注册日期</th>
                           <th className="pb-4 text-right text-[10px] font-bold text-zinc-600 tracking-widest uppercase">佣金</th>
                         </tr>
                       </thead>
                       <tbody>
                         {invitations.map((inv: Invitation, idx: number) => (
                           <tr key={inv.user_id} className={`border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors ${idx%2===0?'bg-white/[0.01]':''}`}>
                             <td className="py-4 text-[11px] text-zinc-300 tracking-widest pl-2">{inv.email_masked}</td>
                             <td className="py-4 text-center">
                               <span className={`inline-flex px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] border ${inv.membership_level > 0 ? 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' : 'text-zinc-500 border-zinc-500/30 bg-zinc-500/10'}`}>
                                 {levelLabels[inv.membership_level] ?? levelLabels[0]}
                               </span>
                             </td>
                             <td className="py-4 text-center font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                               {inv.registered_at ? new Date(inv.registered_at).toLocaleDateString() : "—"}
                             </td>
                             <td className="py-4 text-right font-mono text-[11px] font-black tracking-widest pr-2">
                               {inv.total_commission > 0 ? <span className="text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.3)]">+${inv.total_commission.toFixed(2)}</span> : <span className="text-zinc-600">--</span>}
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                </div>
              )}
            </motion.div>
          )}

          {tab === "commissions" && (
            <motion.div key="com" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {commissions.length === 0 ? (
                <div className="relative bg-black border border-white/[0.05] py-20 text-center overflow-hidden">
                   <DollarSign size={32} className="mx-auto text-zinc-700 mb-6" />
                   <p className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em]">{t('commissions.empty')}</p>
                </div>
              ) : (
                <div className="relative bg-black border border-white/[0.05] p-6 lg:p-8 overflow-hidden">
                   <div className="absolute top-0 right-0 w-8 h-[1px] bg-white/[0.2]" />
                   <p className="text-[10px] font-black font-mono uppercase tracking-[0.3em] text-zinc-500 mb-6">佣金记录</p>
                   <div className="overflow-x-auto">
                     <table className="w-full text-sm font-mono">
                       <thead>
                         <tr className="border-b border-white/[0.1]">
                           <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">来源用户</th>
                           <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">详情</th>
                           <th className="pb-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">日期</th>
                           <th className="pb-4 text-right text-[10px] font-bold text-zinc-600 tracking-widest uppercase">奖励</th>
                         </tr>
                       </thead>
                       <tbody>
                         {commissions.map((c: CommissionRecord, idx: number) => (
                           <tr key={c.id} className={`border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors ${idx%2===0?'bg-white/[0.01]':''}`}>
                             <td className="py-4 text-[11px] text-zinc-300 tracking-widest pl-2">{c.referee_email_masked}</td>
                             <td className="py-4">
                               <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">${c.payment_amount_usd.toFixed(2)} × {(c.commission_rate * 100).toFixed(0)}%</p>
                             </td>
                             <td className="py-4 text-left font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                               {new Date(c.created_at).toLocaleDateString()}
                             </td>
                             <td className="py-4 text-right font-mono text-[11px] font-black tracking-widest pr-2 text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.3)]">
                               +${c.commission_amount.toFixed(2)}
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                </div>
              )}
            </motion.div>
          )}

          {tab === "wallet" && (
            <motion.div key="wal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6 mt-6">
              {/* Wallet Binding */}
              <div className="relative bg-black border border-purple-500/20 p-6 sm:p-8 overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-purple-500/50" />
                <div className="absolute top-0 right-0 w-8 h-[1px] bg-purple-500/50" />
                
                <h3 className="text-[10px] font-black text-purple-400 mb-6 flex items-center gap-3 uppercase tracking-[0.3em] relative z-10">
                   {t('wallet.title')}
                </h3>
                
                {wallet?.trc20_address ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 relative z-10 mb-6">
                    <code className="flex-1 truncate border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-[11px] text-zinc-300 font-mono">{wallet.trc20_address}</code>
                    <span className="text-[10px] font-black font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 flex items-center gap-2 uppercase tracking-[0.2em] w-fit shadow-[0_0_10px_rgba(16,185,129,0.1)]"><CheckCircle2 size={12} /> {t('wallet.bound')}</span>
                  </div>
                ) : (
                  <p className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em] mb-4 relative z-10">{t('wallet.unbound')}</p>
                )}
                
                <div className="flex flex-col sm:flex-row gap-4 relative z-10">
                  <input value={trc20Input} onChange={(e) => setTrc20Input(e.target.value)} placeholder={t('wallet.addressPlaceholder')}
                    className="flex-1 border border-white/[0.1] bg-white/[0.02] px-4 py-3 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-purple-500/50 focus:bg-purple-500/5 outline-none transition-all" />
                  <button onClick={() => walletMut.mutate(trc20Input)} disabled={trc20Input.length !== 34 || walletMut.isPending}
                    className="border border-purple-500/40 bg-purple-600/20 px-8 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-purple-300 hover:bg-purple-600/40 hover:text-white disabled:opacity-40 transition-all shadow-[0_0_15px_rgba(168,85,247,0.1)] tabular-nums shrink-0">
                    {walletMut.isPending ? "..." : wallet?.trc20_address ? t('wallet.change') : t('wallet.bind')}
                  </button>
                </div>
                {walletMut.isError && <p className="mt-4 text-[10px] font-black font-mono text-red-400 uppercase tracking-[0.2em] bg-red-500/10 border border-red-500/20 px-4 py-2 inline-block relative z-10 flex items-center gap-2"><XCircle size={12} /> {(walletMut.error as Error).message}</p>}
              </div>

              {/* Withdraw */}
              <button onClick={() => withdrawMut.mutate()} disabled={d.balance <= 0 || withdrawMut.isPending || !wallet?.trc20_address}
                className="flex w-full items-center justify-center gap-3 border border-emerald-500/40 bg-emerald-600/90 py-5 text-[11px] font-black font-mono uppercase tracking-[0.3em] text-white hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] active:scale-[0.98]">
                <ArrowDownToLine size={16} />{withdrawMut.isPending ? t('wallet.withdrawing') : t('wallet.withdrawButton', { amount: d.balance.toFixed(2) })}
              </button>
              
              {withdrawMut.isError && <div className="flex justify-center mt-4"><p className="text-[10px] font-black font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2 inline-flex items-center gap-2 uppercase tracking-[0.2em]"><XCircle size={12} /> {(withdrawMut.error as Error).message}</p></div>}
              {withdrawMut.isSuccess && <div className="flex justify-center mt-4"><p className="text-[10px] font-black font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 inline-flex items-center gap-2 uppercase tracking-[0.2em]"><CheckCircle2 size={12} /> 提现申请已提交</p></div>}

              {/* History */}
              <div className="mt-8 pt-8 border-t border-white/[0.05]">
                <h3 className="text-[10px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em] mb-6 px-1">{t('wallet.history.title')}</h3>
                {withdrawals.length === 0 ? (
                  <div className="relative bg-black border border-white/[0.05] py-16 text-center overflow-hidden"><p className="text-[10px] font-black font-mono text-zinc-600 uppercase tracking-widest">{t('wallet.history.empty')}</p></div>
                ) : (
                  <div className="overflow-x-auto border border-white/[0.05] bg-black">
                     <table className="w-full text-sm font-mono">
                       <thead>
                         <tr className="border-b border-white/[0.05]">
                           <th className="py-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase pl-6">金额</th>
                           <th className="py-4 text-left text-[10px] font-bold text-zinc-600 tracking-widest uppercase">地址</th>
                           <th className="py-4 text-center text-[10px] font-bold text-zinc-600 tracking-widest uppercase">状态</th>
                           <th className="py-4 text-right text-[10px] font-bold text-zinc-600 tracking-widest uppercase pr-6">日期</th>
                         </tr>
                       </thead>
                       <tbody>
                         {withdrawals.map((w: WithdrawalRecord, idx: number) => {
                           const st = withdrawalStatusMap[w.status as keyof typeof withdrawalStatusMap] ?? withdrawalStatusMap.pending;
                           return (
                             <tr key={w.id} className={`border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors ${idx%2===0?'bg-white/[0.01]':''}`}>
                               <td className="py-4 pl-6 text-[12px] font-black text-white tracking-widest drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">${w.amount.toFixed(2)}</td>
                               <td className="py-4 text-[10px] text-zinc-500 max-w-[150px] truncate">{w.trc20_address}</td>
                               <td className="py-4 text-center">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] border ${st.color.replace('text-', 'text-').replace('text-amber-', 'text-yellow-')} ${st.color.replace('text-', 'bg-').replace('text-amber-', 'bg-yellow-').replace('400', '500/10')} border-current/30`}>
                                     {st.label}
                                  </span>
                               </td>
                               <td className="py-4 pr-6 text-right text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{new Date(w.created_at).toLocaleDateString()}</td>
                             </tr>
                           );
                         })}
                       </tbody>
                     </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
