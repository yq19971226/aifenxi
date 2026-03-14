"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { tasksApi, type TaskTemplate, type TaskSubmission } from "@/lib/api/tasks";
import {
  Gift, Upload, CheckCircle2, Clock, XCircle, Copy,
  ExternalLink, Sparkles, History, Image as ImageIcon,
  ArrowRight, AlertCircle,
} from "lucide-react";
import PromoCard from "@/components/tasks/PromoCard";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";

type Tab = "today" | "history";

const STATUS_KEYS = ["pending", "approved", "rejected"] as const;

export default function TasksPage() {
  const t = useTranslations('tasks');
  const { getState } = useFeatureFlags();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("today");
  const [selTpl, setSelTpl] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [ssUrl, setSsUrl] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const statusMeta = {
    pending: { label: t('status.pending'), color: 'text-amber-400', bg: 'bg-amber-500/[0.12]', icon: Clock },
    approved: { label: t('status.approved'), color: 'text-emerald-400', bg: 'bg-emerald-500/[0.12]', icon: CheckCircle2 },
    rejected: { label: t('status.rejected'), color: 'text-red-400', bg: 'bg-red-500/[0.12]', icon: XCircle },
  } satisfies Record<(typeof STATUS_KEYS)[number], { label: string; color: string; bg: string; icon: typeof Clock }>;

  const { data: home, isLoading, isError } = useQuery({ queryKey: ["task-home"], queryFn: tasksApi.getHome });
  const { data: promo, mutate: genPromo, isPending: promoLoading } = useMutation({ mutationFn: tasksApi.generatePromo });
  const { data: hist = [] } = useQuery({ queryKey: ["task-history"], queryFn: () => tasksApi.getMySubmissions(), enabled: tab === "history" });
  const submitMut = useMutation({
    mutationFn: tasksApi.submit,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task-home"] }); setPostUrl(""); setSsUrl(""); setSelTpl(""); },
  });

  const copyText = (text: string, idx: number) => { navigator.clipboard.writeText(text); setCopied(idx); setTimeout(() => setCopied(null), 2000); };

  if (getState("task") !== "active") {
    return <MaintenancePlaceholder featureName={t('title')} />;
  }

  if (isLoading) return <PageTransition><div className="mx-auto max-w-3xl px-4 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-28 bg-bg-surface border border-border rounded-xl animate-pulse" />)}</div></PageTransition>;

  if (isError) return <PageTransition><div className="mx-auto max-w-3xl px-4 py-8"><div className="bg-bg-surface border border-border rounded-xl p-8 text-center shadow-inner"><Gift size={32} className="mx-auto text-zinc-600 mb-4 opacity-50" /><p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{t('error.loadFailed')}</p><p className="text-[10px] font-mono font-bold text-zinc-500 mt-2 uppercase tracking-widest">{t('error.networkError')}</p></div></div></PageTransition>;

  const canSubmit = home?.can_submit ?? false;
  const todaySub = home?.today_submission;
  const templates = home?.templates ?? [];
  const bonus = home?.bonus_credits ?? {};
  const inputCls = "w-full rounded-xl border border-border bg-bg-primary/50 px-4 py-3.5 text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all";

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6 px-4 md:px-8 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-black text-white font-mono tracking-tight uppercase">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 shadow-inner">
                <Gift size={16} className="text-indigo-400" />
              </div>
              {t('title')}
            </h1>
            <p className="mt-2 text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{t('subtitle')}</p>
          </div>
          <div className="flex gap-2">
            {Object.entries(bonus).map(([mode, count]) => (
              <div key={mode} className="bg-bg-surface border border-amber-500/20 rounded-xl px-4 py-2.5 text-center min-w-[80px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-amber-500/40 transition-colors">
                <p className="text-xl font-black font-mono text-amber-400 tracking-tight leading-none">{count as number}</p>
                <p className="text-[9px] font-bold font-mono text-amber-500/70 uppercase tracking-widest mt-1.5">{mode}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-1 rounded-xl bg-bg-surface border border-border p-1.5 w-fit shadow-inner">
          {(["today", "history"] as Tab[]).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)} className={`rounded-lg px-6 py-2.5 text-xs font-bold font-mono uppercase tracking-widest transition-all ${tab === tabKey ? "bg-bg-elevated border border-border text-white shadow-sm" : "text-zinc-500 hover:text-zinc-400 hover:bg-bg-primary/50"}`}>
              {t(`tabs.${tabKey}`)}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "today" && (
            <motion.div key="today" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {todaySub && (() => { const s = statusMeta[todaySub.status] ?? statusMeta.pending; const I = s.icon; return (
                <div className="bg-bg-surface border border-border rounded-xl p-5 sm:p-6 shadow-inner relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bg}`} />
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3"><div className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-inner border border-white/5 ${s.bg}`}><I size={16} className={s.color} /></div><span className={`text-[11px] font-bold uppercase tracking-widest font-mono ${s.color}`}>{s.label}</span></div>
                    <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{new Date(todaySub.submitted_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-300">{t('today.submitted', { task: todaySub.template_title })}</p>
                  {todaySub.status === "approved" && <p className="mt-3 text-[11px] font-bold uppercase tracking-widest font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-md inline-block">{t('today.rewardGranted', { amount: todaySub.reward_amount, mode: todaySub.reward_mode })}</p>}
                  {todaySub.status === "rejected" && todaySub.reject_reason && <p className="mt-3 text-[11px] font-bold uppercase tracking-widest font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-md inline-block">{t('today.rejected', { reason: todaySub.reject_reason })}</p>}
                </div>
              ); })()}

              {canSubmit && (<>
                <div className="bg-bg-surface border border-border rounded-xl p-5 sm:p-6 shadow-inner">
                  <h3 className="text-xs font-bold text-white mb-5 flex items-center gap-3 uppercase tracking-widest">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] shadow-inner font-mono">1</span>
                    {t('today.step1')}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {templates.map((t: TaskTemplate) => (
                      <button key={t.id} onClick={() => setSelTpl(t.id)} className={`group relative rounded-xl border p-5 text-left transition-all ${selTpl === t.id ? "border-indigo-500/50 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.05)]" : "border-border bg-bg-primary/30 hover:bg-bg-elevated hover:border-zinc-700"}`}>
                        {selTpl === t.id && <div className="absolute top-4 right-4"><CheckCircle2 size={18} className="text-indigo-400 shadow-sm" /></div>}
                        <div className="flex items-center gap-3 mb-3"><span className="flex items-center justify-center w-8 h-8 rounded-lg bg-bg-surface border border-border text-lg shadow-inner grayscale group-hover:grayscale-0 transition-all">{t.icon || "📱"}</span><span className={`font-bold text-sm tracking-wide ${selTpl === t.id ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>{t.title}</span></div>
                        <p className="text-[11px] text-zinc-500 leading-relaxed mb-4 min-h-[36px]">{t.description}</p>
                        <div className="flex items-center gap-3 pt-3 border-t border-border/50">
                          <span className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded shadow-sm">+{t.reward_amount} {t.reward_mode}</span>
                          <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">≥{t.min_views} VIEWS</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selTpl && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-bg-surface border border-border rounded-xl p-5 sm:p-6 shadow-inner">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <h3 className="text-xs font-bold text-white flex items-center gap-3 uppercase tracking-widest">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] shadow-inner font-mono">2</span>
                        {t('today.step2')}
                      </h3>
                      <button onClick={() => genPromo()} disabled={promoLoading} className="flex items-center gap-2 rounded-lg bg-bg-elevated border border-border px-4 py-2.5 text-[10px] font-bold font-mono text-zinc-300 uppercase tracking-widest hover:bg-bg-primary hover:text-white disabled:opacity-40 transition-all shadow-inner group">
                        <Sparkles size={14} className="text-indigo-400 group-hover:scale-110 transition-transform" />{promoLoading ? t('today.generating') : t('today.generate')}
                      </button>
                    </div>
                    {promo && <div className="space-y-6">
                      {/* Promo Image Card */}
                      <div className="bg-bg-primary/30 border border-border rounded-xl p-4 sm:p-5 shadow-inner">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono mb-4">{t('today.promoImage')}</p>
                        <PromoCard data={promo.image_data as any} />
                      </div>
                      {/* Text Copies */}
                      <div className="bg-bg-primary/30 border border-border rounded-xl p-4 sm:p-5 shadow-inner">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono mb-4">{t('today.promoCopy')}</p>
                        <div className="space-y-4">{promo.copies.map((c, i) => (
                          <div key={i} className="rounded-xl border border-border bg-bg-surface p-5 shadow-inner group transition-colors hover:border-zinc-700">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] font-bold font-mono text-indigo-400 uppercase tracking-widest bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded shadow-sm">{c.style}</span>
                              <button onClick={() => copyText(c.text, i)} className="flex items-center gap-1.5 text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500 hover:text-indigo-400 transition-colors bg-bg-elevated border border-border px-2.5 py-1 rounded shadow-sm"><Copy size={12} />{copied === i ? t('today.copied') : t('today.copy')}</button>
                            </div>
                            <p className="text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap font-mono">{c.text}</p>
                          </div>
                        ))}</div>
                      </div>
                    </div>}
                  </motion.div>
                )}

                {selTpl && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-bg-surface border border-border rounded-xl p-5 sm:p-6 shadow-inner">
                    <h3 className="text-xs font-bold text-white mb-5 flex items-center gap-3 uppercase tracking-widest">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] shadow-inner font-mono">3</span>
                      {t('today.step3')}
                    </h3>
                    <div className="space-y-5">
                      <div>
                        <label className="mb-2 flex items-center gap-2 text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest"><ExternalLink size={12} className="text-zinc-600" />{t('today.postUrl')}</label>
                        <input type="url" value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://x.com/your_post_url" className={inputCls} />
                      </div>
                      <div>
                        <label className="mb-2 flex items-center gap-2 text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest"><ImageIcon size={12} className="text-zinc-600" />{t('today.screenshotUrl')}</label>
                        <input type="url" value={ssUrl} onChange={e => setSsUrl(e.target.value)} placeholder={t('today.screenshotPlaceholder')} className={inputCls} />
                      </div>
                      <button onClick={() => submitMut.mutate({ template_id: selTpl, post_url: postUrl, screenshot_url: ssUrl })} disabled={!postUrl || !ssUrl || submitMut.isPending}
                        className="flex w-full items-center justify-center gap-2 mt-4 rounded-xl bg-indigo-600 py-3.5 text-xs font-bold font-mono uppercase tracking-widest text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all active:scale-[0.98]">
                        <Upload size={14} className={submitMut.isPending ? "animate-bounce" : ""} />{submitMut.isPending ? t('today.submitting') : t('today.submit')}<ArrowRight size={14} />
                      </button>
                      {submitMut.isError && <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 shadow-inner"><AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" /><p className="text-xs font-mono text-red-300 tracking-wide">{(submitMut.error as Error).message}</p></div>}
                      {submitMut.isSuccess && <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 shadow-inner"><CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" /><p className="text-xs font-mono text-emerald-300 tracking-wide">{t('today.submitSuccess')}</p></div>}
                    </div>
                  </motion.div>
                )}
              </>)}
            </motion.div>
          )}

          {tab === "history" && (
            <motion.div key="hist" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              {hist.length === 0 ? (
                <div className="bg-bg-surface border border-border rounded-xl py-16 text-center shadow-inner mt-4"><History size={32} className="mx-auto text-zinc-600 mb-4 opacity-50" /><p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{t('history.empty')}</p><p className="text-[10px] font-mono font-bold text-zinc-500 mt-2 uppercase tracking-widest">{t('history.emptyHint')}</p></div>
              ) : hist.map((s: TaskSubmission, idx: number) => { const st = statusMeta[s.status] ?? statusMeta.pending; const I = st.icon; return (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg-surface border border-border hover:border-zinc-700 transition-colors rounded-xl px-5 py-4 shadow-inner relative overflow-hidden group">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${st.bg} opacity-50 group-hover:opacity-100 transition-opacity`} />
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 shadow-inner ${st.bg}`}><I size={18} className={st.color} /></div>
                    <div>
                      <p className="text-sm font-bold text-zinc-200 tracking-wide">{s.template_title}</p>
                      <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mt-1.5">{new Date(s.submitted_at).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                  <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto border-t sm:border-t-0 border-border/50 pt-3 sm:pt-0">
                    <span className={`text-[10px] font-bold font-mono uppercase tracking-widest ${st.color} bg-white/5 px-2 py-0.5 rounded border border-white/5 shadow-sm`}>{st.label}</span>
                    {s.reward_granted && <p className="text-sm font-black font-mono tracking-tight text-emerald-400 mt-1 sm:mt-1.5">+{s.reward_amount} {s.reward_mode}</p>}
                  </div>
                </motion.div>
              ); })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
