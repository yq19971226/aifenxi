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

  if (isLoading) return <PageTransition><div className="mx-auto max-w-3xl px-4 py-10 space-y-6">{[1,2,3].map(i => <div key={i} className="h-32 bg-white/[0.02] border border-white/[0.05] animate-pulse relative overflow-hidden"><div className="absolute top-0 right-0 w-4 h-[1px] bg-white/20"/><div className="absolute bottom-0 left-0 w-4 h-[1px] bg-white/20"/></div>)}</div></PageTransition>;

  if (isError) return <PageTransition><div className="mx-auto max-w-3xl px-4 py-20"><div className="border border-white/[0.05] bg-black/40 p-10 text-center relative"><div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white/20"/><div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/20"/><Gift size={32} className="mx-auto text-zinc-700 mb-6 shrink-0" /><p className="text-[11px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em]">{t('error.loadFailed')}</p><p className="text-[10px] font-mono text-zinc-600 mt-4 uppercase tracking-[0.2em]">{t('error.networkError')}</p></div></div></PageTransition>;

  const canSubmit = home?.can_submit ?? false;
  const todaySub = home?.today_submission;
  const templates = home?.templates ?? [];
  const bonus = home?.bonus_credits ?? {};
  const inputCls = "w-full rounded-none border-b border-white/[0.1] bg-white/[0.01] px-4 py-3.5 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:bg-indigo-500/5 focus:outline-none transition-all";

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-8 px-4 md:px-8 py-10 text-white min-h-screen">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10 pb-6 border-b border-white/[0.05]">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-black text-white font-mono tracking-widest uppercase mb-2">
              <span className="flex items-center justify-center w-8 h-8 bg-indigo-500/10 border border-indigo-500/30">
                <Gift size={16} className="text-indigo-400" />
              </span>
              SYS.TASKS_
            </h1>
            <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.2em]">{t('subtitle')}</p>
          </div>
          <div className="flex gap-3">
            {Object.entries(bonus).map(([mode, count]) => (
              <div key={mode} className="relative bg-black/40 border border-amber-500/20 px-5 py-3 text-center min-w-[80px] hover:border-amber-500/50 transition-colors group overflow-hidden">
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-500/30 group-hover:border-amber-500" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/30 group-hover:border-amber-500" />
                <p className="text-xl font-black font-mono text-amber-400 tracking-tight leading-none group-hover:drop-shadow-[0_0_10px_rgba(245,158,11,0.5)] transition-all">{count as number}</p>
                <p className="text-[9px] font-bold font-mono text-amber-500/60 uppercase tracking-widest mt-2">{mode}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-b border-white/[0.05] w-full mt-8 mb-8">
          {(["today", "history"] as Tab[]).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)} className={`relative px-6 py-3 text-[11px] font-bold font-mono uppercase tracking-[0.2em] transition-all ${tab === tabKey ? "text-indigo-400" : "text-zinc-600 hover:text-white"}`}>
              {t(`tabs.${tabKey}`)}
              {tab === tabKey && (
                <motion.div layoutId="taskTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "today" && (
            <motion.div key="today" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {todaySub && (() => { const s = statusMeta[todaySub.status] ?? statusMeta.pending; const I = s.icon; return (
                <div className="relative bg-black/60 border border-white/[0.05] p-6 overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bg}`} />
                  <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center border border-white/5 ${s.bg}`}><I size={18} className={s.color} /></div>
                      <span className={`text-xs font-bold uppercase tracking-[0.2em] font-mono ${s.color}`}>{s.label}</span>
                    </div>
                    <span className="text-[10px] font-bold font-mono text-zinc-600 uppercase tracking-widest">{new Date(todaySub.submitted_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-300 font-mono tracking-wide">{t('today.submitted', { task: todaySub.template_title })}</p>
                  
                  <div className="mt-6 flex flex-wrap gap-3">
                    {todaySub.status === "approved" && <p className="text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 inline-flex items-center gap-2"><CheckCircle2 size={12}/>{t('today.rewardGranted', { amount: todaySub.reward_amount, mode: todaySub.reward_mode })}</p>}
                    {todaySub.status === "rejected" && todaySub.reject_reason && <p className="text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-2 inline-flex items-center gap-2"><XCircle size={12}/>{t('today.rejected', { reason: todaySub.reject_reason })}</p>}
                  </div>
                </div>
              ); })()}

              {canSubmit && (<>
                <div className="relative bg-black border border-white/[0.05] p-6 lg:p-8">
                  <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20" />
                  <h3 className="text-[11px] font-black text-white mb-6 flex items-center gap-4 uppercase tracking-[0.3em] font-mono">
                    <span className="flex h-6 w-6 items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-[10px]">1</span>
                    {t('today.step1')}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {templates.map((t: TaskTemplate) => (
                      <button key={t.id} onClick={() => setSelTpl(t.id)} className={`group relative border p-6 text-left transition-all duration-300 overflow-hidden ${selTpl === t.id ? "border-indigo-500 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.1)]" : "border-white/[0.05] bg-white/[0.01] hover:border-white/[0.2] hover:bg-white/[0.03]"}`}>
                        <div className={`absolute top-0 right-0 p-2 font-mono text-[8px] transition-opacity ${selTpl === t.id ? 'opacity-100 text-indigo-400' : 'opacity-20 group-hover:opacity-100 group-hover:text-zinc-400'}`}>TPL_{t.id.slice(0,4)}</div>
                        {selTpl === t.id && <div className="absolute top-4 right-4"><span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full bg-indigo-400 opacity-75"/><span className="relative inline-flex h-2 w-2 bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.8)]"/></span></div>}
                        <div className="flex items-center gap-4 mb-4"><span className="flex items-center justify-center w-10 h-10 border border-white/[0.1] bg-white/[0.02] text-xl grayscale group-hover:grayscale-0 transition-all">{t.icon || "📱"}</span><span className={`font-bold font-mono tracking-widest text-xs uppercase ${selTpl === t.id ? "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]" : "text-zinc-400 group-hover:text-white"}`}>{t.title}</span></div>
                        <p className="text-[10px] font-mono text-zinc-500 leading-[1.8] mb-6 min-h-[44px] uppercase tracking-wide">{t.description}</p>
                        <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
                          <span className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-widest bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-1">+{t.reward_amount} {t.reward_mode}</span>
                          <span className="text-[9px] font-bold font-mono text-zinc-600 uppercase tracking-[0.2em]">≥{t.min_views} VIEWS</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selTpl && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="relative bg-black border border-white/[0.05] p-6 lg:p-8 mt-6">
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20" />
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/20" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
                      <h3 className="text-[11px] font-black text-white flex items-center gap-4 uppercase tracking-[0.3em] font-mono">
                        <span className="flex h-6 w-6 items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-[10px]">2</span>
                        {t('today.step2')}
                      </h3>
                      <button onClick={() => genPromo()} disabled={promoLoading} className="flex items-center gap-3 border border-indigo-500/40 bg-indigo-500/10 px-6 py-3 text-[10px] font-bold font-mono text-indigo-400 uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white disabled:opacity-40 transition-all group shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                        <Sparkles size={14} className="group-hover:scale-110 transition-transform" />{promoLoading ? t('today.generating') : t('today.generate')}
                      </button>
                    </div>
                    {promo && <div className="space-y-8">
                      {/* Promo Image Card */}
                      <div className="bg-black/40 border border-white/[0.05] p-6 relative">
                        <div className="absolute -left-[1px] top-4 w-[2px] h-8 bg-indigo-500/50" />
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-mono mb-6">{t('today.promoImage')}</p>
                        <PromoCard data={promo.image_data as any} />
                      </div>
                      {/* Text Copies */}
                      <div className="bg-black/40 border border-white/[0.05] p-6 relative">
                        <div className="absolute -left-[1px] top-4 w-[2px] h-8 bg-emerald-500/50" />
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-mono mb-6">{t('today.promoCopy')}</p>
                        <div className="space-y-6">{promo.copies.map((c, i) => (
                          <div key={i} className="relative border border-white/[0.05] bg-white/[0.01] p-6 group transition-colors hover:border-white/[0.2]">
                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/[0.05]">
                              <span className="text-[9px] font-black font-mono text-indigo-400 uppercase tracking-[0.3em] border border-indigo-500/20 px-3 py-1 bg-indigo-500/5">{c.style}</span>
                              <button onClick={() => copyText(c.text, i)} className="flex items-center gap-2 text-[10px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors border border-white/[0.1] px-3 py-1.5 hover:bg-white/5"><Copy size={12} />{copied === i ? t('today.copied') : t('today.copy')}</button>
                            </div>
                            <p className="text-[11px] leading-[2.2] text-zinc-400 whitespace-pre-wrap font-mono tracking-wide">{c.text}</p>
                          </div>
                        ))}</div>
                      </div>
                    </div>}
                  </motion.div>
                )}

                {selTpl && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="relative bg-black border border-white/[0.05] p-6 lg:p-8 mt-6">
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20" />
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/20" />
                    <h3 className="text-[11px] font-black text-white mb-8 flex items-center gap-4 uppercase tracking-[0.3em] font-mono">
                      <span className="flex h-6 w-6 items-center justify-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px]">3</span>
                      {t('today.step3')}
                    </h3>
                    <div className="space-y-8">
                      <div>
                        <label className="mb-3 flex items-center gap-3 text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-[0.2em]"><ExternalLink size={14} className="text-zinc-600" />{t('today.postUrl')}</label>
                        <input type="url" value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://x.com/your_post_url" className={inputCls} />
                      </div>
                      <div>
                        <label className="mb-3 flex items-center gap-3 text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-[0.2em]"><ImageIcon size={14} className="text-zinc-600" />{t('today.screenshotUrl')}</label>
                        <input type="url" value={ssUrl} onChange={e => setSsUrl(e.target.value)} placeholder={t('today.screenshotPlaceholder')} className={inputCls} />
                      </div>
                      <button onClick={() => submitMut.mutate({ template_id: selTpl, post_url: postUrl, screenshot_url: ssUrl })} disabled={!postUrl || !ssUrl || submitMut.isPending}
                        className="flex w-full items-center justify-center gap-3 mt-6 bg-indigo-600 py-4 text-[11px] font-black font-mono uppercase tracking-[0.3em] text-white hover:bg-indigo-500 disabled:opacity-30 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                        <Upload size={16} className={submitMut.isPending ? "animate-bounce" : ""} />{submitMut.isPending ? t('today.submitting') : t('today.submit')}<ArrowRight size={16} />
                      </button>
                      
                      {submitMut.isError && <div className="flex items-center gap-3 border border-red-500/30 bg-red-500/10 px-5 py-4"><AlertCircle size={16} className="text-red-400 shrink-0" /><p className="text-[11px] font-mono text-red-300 tracking-widest uppercase">{(submitMut.error as Error).message}</p></div>}
                      {submitMut.isSuccess && <div className="flex items-center gap-3 border border-emerald-500/30 bg-emerald-500/10 px-5 py-4"><CheckCircle2 size={16} className="text-emerald-400 shrink-0" /><p className="text-[11px] font-mono text-emerald-300 tracking-widest uppercase">{t('today.submitSuccess')}</p></div>}
                    </div>
                  </motion.div>
                )}
              </>)}
            </motion.div>
          )}

          {tab === "history" && (
            <motion.div key="hist" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {hist.length === 0 ? (
                <div className="border border-white/[0.05] bg-black/40 py-20 text-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-8 h-[2px] bg-white/[0.1]" />
                  <div className="absolute bottom-0 left-0 w-8 h-[2px] bg-white/[0.1]" />
                  <History size={32} className="mx-auto text-zinc-700 mb-6 shrink-0" />
                  <p className="text-[11px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em]">{t('history.empty')}</p>
                </div>
              ) : hist.map((s: TaskSubmission, idx: number) => { const st = statusMeta[s.status] ?? statusMeta.pending; const I = st.icon; return (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white/[0.01] border border-white/[0.05] hover:border-white/[0.2] transition-colors p-6 relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${st.bg} opacity-50 group-hover:opacity-100 transition-opacity`} />
                  <div className="flex items-center gap-6">
                    <div className={`flex h-12 w-12 items-center justify-center border border-white/5 bg-black/50 ${st.bg}`}><I size={20} className={st.color} /></div>
                    <div>
                      <p className="text-[11px] font-bold text-white tracking-widest uppercase font-mono mb-2">{s.template_title}</p>
                      <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.2em]">{new Date(s.submitted_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-white/[0.05] pt-4 sm:pt-0">
                    <span className={`text-[9px] font-black font-mono uppercase tracking-[0.3em] ${st.color}`}>{st.label}</span>
                    {s.reward_granted && <p className="text-[11px] font-black font-mono tracking-widest text-emerald-400 mt-2 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20">+{s.reward_amount} {s.reward_mode}</p>}
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
