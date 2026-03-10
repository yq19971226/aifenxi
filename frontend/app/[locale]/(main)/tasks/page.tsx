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

  if (isLoading) return <PageTransition><div className="mx-auto max-w-3xl px-4 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 skeleton rounded-lg" />)}</div></PageTransition>;

  if (isError) return <PageTransition><div className="mx-auto max-w-3xl px-4 py-8"><div className="card p-8 text-center"><Gift size={28} className="mx-auto text-zinc-700 mb-3" /><p className="text-sm text-zinc-400">{t('error.loadFailed')}</p><p className="text-xs text-zinc-500 mt-1">{t('error.networkError')}</p></div></div></PageTransition>;

  const canSubmit = home?.can_submit ?? false;
  const todaySub = home?.today_submission;
  const templates = home?.templates ?? [];
  const bonus = home?.bonus_credits ?? {};
  const inputCls = "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-700 focus:border-white/[0.16] focus:ring-1 focus:ring-white/[0.06] outline-none transition-all";

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6 px-4 md:px-8 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-lg md:text-xl font-semibold text-white"><Gift size={20} className="text-purple-400" />{t('title')}</h1>
            <p className="mt-1 text-xs md:text-sm text-zinc-500">{t('subtitle')}</p>
          </div>
          <div className="flex gap-2">
            {Object.entries(bonus).map(([mode, count]) => (
              <div key={mode} className="card px-3.5 py-2 text-center min-w-[72px]">
                <p className="text-lg font-bold font-mono text-white leading-none">{count as number}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">{mode}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] p-1 w-fit">
          {(["today", "history"] as Tab[]).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)} className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-all ${tab === tabKey ? "bg-white/[0.08] text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-400"}`}>
              {t(`tabs.${tabKey}`)}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "today" && (
            <motion.div key="today" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              {todaySub && (() => { const s = statusMeta[todaySub.status] ?? statusMeta.pending; const I = s.icon; return (
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><div className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.bg}`}><I size={14} className={s.color} /></div><span className={`text-sm font-medium ${s.color}`}>{s.label}</span></div>
                    <span className="text-xs text-zinc-500">{new Date(todaySub.submitted_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-zinc-300">{t('today.submitted', { task: todaySub.template_title })}</p>
                  {todaySub.status === "approved" && <p className="mt-2 text-sm font-medium text-emerald-400">{t('today.rewardGranted', { amount: todaySub.reward_amount, mode: todaySub.reward_mode })}</p>}
                  {todaySub.status === "rejected" && todaySub.reject_reason && <p className="mt-2 text-sm text-red-400">{t('today.rejected', { reason: todaySub.reject_reason })}</p>}
                </div>
              ); })()}

              {canSubmit && (<>
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/[0.15] text-blue-400 text-xs font-bold">1</span>{t('today.step1')}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {templates.map((t: TaskTemplate) => (
                      <button key={t.id} onClick={() => setSelTpl(t.id)} className={`rounded-lg border p-4 text-left transition-all ${selTpl === t.id ? "border-blue-500/30 bg-blue-500/[0.04]" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                        {selTpl === t.id && <div className="float-right"><CheckCircle2 size={15} className="text-blue-400" /></div>}
                        <div className="flex items-center gap-2.5 mb-2"><span className="text-base">{t.icon || "📱"}</span><span className={`font-medium text-sm ${selTpl === t.id ? "text-white" : "text-zinc-300"}`}>{t.title}</span></div>
                        <p className="text-xs text-zinc-500 leading-relaxed mb-3 min-h-[32px]">{t.description}</p>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-emerald-400 font-medium bg-emerald-500/[0.08] px-2 py-0.5 rounded">+{t.reward_amount} {t.reward_mode}</span>
                          <span className="text-zinc-500">≥{t.min_views} views</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selTpl && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/[0.15] text-purple-400 text-xs font-bold">2</span>{t('today.step2')}</h3>
                      <button onClick={() => genPromo()} disabled={promoLoading} className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.08] disabled:opacity-40 transition-all">
                        <Sparkles size={13} className="text-purple-400" />{promoLoading ? t('today.generating') : t('today.generate')}
                      </button>
                    </div>
                    {promo && <div className="space-y-4">
                      {/* Promo Image Card */}
                      <div>
                        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{t('today.promoImage')}</p>
                        <PromoCard data={promo.image_data as any} />
                      </div>
                      {/* Text Copies */}
                      <div>
                        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{t('today.promoCopy')}</p>
                        <div className="space-y-3">{promo.copies.map((c, i) => (
                          <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-purple-400 uppercase tracking-wider bg-purple-500/[0.08] px-2 py-0.5 rounded">{c.style}</span>
                              <button onClick={() => copyText(c.text, i)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"><Copy size={11} />{copied === i ? t('today.copied') : t('today.copy')}</button>
                            </div>
                            <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">{c.text}</p>
                          </div>
                        ))}</div>
                      </div>
                    </div>}
                  </motion.div>
                )}

                {selTpl && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/[0.15] text-emerald-400 text-xs font-bold">3</span>{t('today.step3')}</h3>
                    <div className="space-y-4">
                      <div><label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-500 uppercase tracking-wider"><ExternalLink size={11} />{t('today.postUrl')}</label><input type="url" value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://x.com/your_post_url" className={inputCls} /></div>
                      <div><label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-500 uppercase tracking-wider"><ImageIcon size={11} />{t('today.screenshotUrl')}</label><input type="url" value={ssUrl} onChange={e => setSsUrl(e.target.value)} placeholder={t('today.screenshotPlaceholder')} className={inputCls} /></div>
                      <button onClick={() => submitMut.mutate({ template_id: selTpl, post_url: postUrl, screenshot_url: ssUrl })} disabled={!postUrl || !ssUrl || submitMut.isPending}
                        className="flex w-full items-center justify-center gap-2 mt-2 rounded-lg bg-gradient-to-r from-zinc-100 to-zinc-300 py-3 text-sm font-medium text-zinc-900 hover:from-white hover:to-zinc-200 disabled:opacity-40 transition-all active:scale-[0.98]">
                        <Upload size={15} />{submitMut.isPending ? t('today.submitting') : t('today.submit')}<ArrowRight size={14} />
                      </button>
                      {submitMut.isError && <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3"><AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" /><p className="text-xs text-red-300">{(submitMut.error as Error).message}</p></div>}
                      {submitMut.isSuccess && <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3"><CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" /><p className="text-xs text-emerald-300">{t('today.submitSuccess')}</p></div>}
                    </div>
                  </motion.div>
                )}
              </>)}
            </motion.div>
          )}

          {tab === "history" && (
            <motion.div key="hist" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
              {hist.length === 0 ? (
                <div className="card py-16 text-center"><History size={28} className="mx-auto text-zinc-700 mb-3" /><p className="text-sm text-zinc-500">{t('history.empty')}</p><p className="text-xs text-zinc-500 mt-1">{t('history.emptyHint')}</p></div>
              ) : hist.map((s: TaskSubmission, idx: number) => { const st = statusMeta[s.status] ?? statusMeta.pending; const I = st.icon; return (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="flex items-center justify-between card px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${st.bg}`}><I size={16} className={st.color} /></div>
                    <div><p className="text-sm text-white">{s.template_title}</p><p className="text-xs text-zinc-500 mt-0.5">{new Date(s.submitted_at).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p></div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                    {s.reward_granted && <p className="text-sm font-mono text-emerald-400 mt-0.5">+{s.reward_amount} {s.reward_mode}</p>}
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
