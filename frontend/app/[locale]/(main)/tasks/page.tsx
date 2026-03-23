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
  ArrowRight, AlertCircle, ChevronRight
} from "lucide-react";
import PromoCard from "@/components/tasks/PromoCard";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";

type Tab = "today" | "history";

const MODE_LABELS: Record<string, string> = {
  scalping: "超短线",
  intraday: "日内",
  trend: "趋势",
};

const STATUS_KEYS = ["pending", "approved", "rejected"] as const;

function StepContainer({ 
  step, title, isActive, isDone, children, isLast = false
}: { 
  step: number; title: string; isActive: boolean; isDone: boolean; children: React.ReactNode; isLast?: boolean;
}) {
  return (
    <div className={`relative pl-8 md:pl-12 ${isLast ? 'pb-2' : 'pb-14'} transition-all duration-500 ${!isActive && !isDone ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
      {/* Connector Line */}
      {!isLast && <div className="absolute left-[15px] top-8 bottom-[-8px] w-px bg-white/5" />}
      {isActive && !isLast && <div className="absolute left-[15px] top-8 bottom-[-8px] w-px bg-gradient-to-b from-indigo-500/50 to-transparent" />}
      
      {/* Step Node */}
      <div className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded border text-[10px] font-black font-mono z-10 transition-colors duration-500
        ${isActive ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : isDone ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-white/5 border-white/10 text-zinc-400'}`}>
        {isDone ? <CheckCircle2 size={16} /> : step}
      </div>

      {/* Header */}
      <h3 className={`text-[12px] font-black uppercase tracking-[0.2em] font-mono mb-6 transition-colors ${isActive ? 'text-white' : 'text-zinc-500'}`}>
        {title}
      </h3>

      {/* Content */}
      <div className="relative">
        {children}
      </div>
    </div>
  )
}

export default function TasksPage() {
  const t = useTranslations('tasks');
  const { getState } = useFeatureFlags();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("today");
  
  // Step State
  const [selTpl, setSelTpl] = useState("");
  const [step2Done, setStep2Done] = useState(false); // Indicates generation is done
  const [postUrl, setPostUrl] = useState("");
  const [ssUrl, setSsUrl] = useState("");
  const [ssFile, setSsFile] = useState<File | null>(null);
  const [ssPreview, setSsPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const statusMeta = {
    pending: { label: t('status.pending'), color: 'text-amber-400', bg: 'bg-amber-500/[0.12]', icon: Clock },
    approved: { label: t('status.approved'), color: 'text-emerald-400', bg: 'bg-emerald-500/[0.12]', icon: CheckCircle2 },
    rejected: { label: t('status.rejected'), color: 'text-red-400', bg: 'bg-red-500/[0.12]', icon: XCircle },
  } satisfies Record<(typeof STATUS_KEYS)[number], { label: string; color: string; bg: string; icon: typeof Clock }>;

  const { data: home, isLoading, isError } = useQuery({ queryKey: ["task-home"], queryFn: tasksApi.getHome });
  const { data: promo, mutate: genPromo, isPending: promoLoading } = useMutation({ 
    mutationFn: tasksApi.generatePromo,
    onSuccess: () => setStep2Done(true)
  });
  const { data: hist = [] } = useQuery({ queryKey: ["task-history"], queryFn: () => tasksApi.getMySubmissions(), enabled: tab === "history" });
  const submitMut = useMutation({
    mutationFn: tasksApi.submit,
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ["task-home"] }); 
      setPostUrl(""); setSsUrl(""); setSelTpl(""); setStep2Done(false);
      setSsFile(null); setSsPreview(null);
    },
  });
  const uploadMut = useMutation({ mutationFn: tasksApi.uploadProof });

  const handleFileSelect = (file: File) => {
    setSsFile(file);
    setSsPreview(URL.createObjectURL(file));
    setSsUrl(""); // reset previous url
    // auto upload
    uploadMut.mutate(file, {
      onSuccess: (res) => setSsUrl(res.screenshot_url),
    });
  };

  const copyText = (text: string, idx: number) => { 
    navigator.clipboard.writeText(text); 
    setCopied(idx); 
    setTimeout(() => setCopied(null), 2000); 
  };

  if (getState("task") !== "active") return <MaintenancePlaceholder featureName={t('title')} />;

  if (isLoading) return <PageTransition><div className="mx-auto max-w-3xl px-4 py-10 space-y-6">{[1,2,3].map(i => <div key={i} className="h-32 bg-white/[0.02] border border-white/[0.05] animate-pulse relative overflow-hidden"><div className="absolute top-0 right-0 w-4 h-[1px] bg-white/20"/><div className="absolute bottom-0 left-0 w-4 h-[1px] bg-white/20"/></div>)}</div></PageTransition>;

  if (isError) return <PageTransition><div className="mx-auto max-w-3xl px-4 py-20"><div className="border border-white/[0.05] bg-black/40 p-10 text-center relative"><div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white/20"/><div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/20"/><Gift size={32} className="mx-auto text-zinc-500 mb-6 shrink-0" /><p className="text-[11px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em]">{t('error.loadFailed')}</p></div></div></PageTransition>;

  const canSubmit = home?.can_submit ?? false;
  const todaySub = home?.today_submission;
  const templates = home?.templates ?? [];
  const bonus = home?.bonus_credits ?? {};
  
  const inputCls = "w-full bg-white/[0.02] border border-white/[0.1] px-4 py-3.5 text-xs font-mono text-zinc-300 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:bg-indigo-500/10 focus:outline-none transition-all shadow-inner";

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-8 px-4 md:px-8 py-10 text-white min-h-screen">
        
        {/* Header - Mission Control Style */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10 pb-8 border-b border-white/[0.05]">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-black text-white font-mono tracking-widest uppercase mb-2">
              <span className="flex items-center justify-center w-8 h-8 bg-indigo-500/10 border border-indigo-400/30 shadow-[0_0_15px_rgba(99,102,241,0.2)] rounded-sm">
                <Gift size={16} className="text-indigo-400 drop-shadow-[0_0_5px_rgba(99,102,241,0.8)]" />
              </span>
              AXIOM {t('title')}
            </h1>
            <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.2em]">{t('subtitle')}</p>
          </div>
          <div className="flex gap-3">
            {Object.entries(bonus).map(([mode, count]) => (
              <div key={mode} className="relative bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 px-5 py-3 text-center min-w-[80px] hover:border-amber-500/40 transition-colors group overflow-hidden shadow-inner">
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-500/30 group-hover:border-amber-400" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/30 group-hover:border-amber-400" />
                <p className="text-2xl font-black font-mono text-amber-400 tracking-tight leading-none group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(245,158,11,0.8)] transition-all">{count as number}</p>
                <p className="text-[9px] font-bold font-mono text-amber-500/60 uppercase tracking-widest mt-2">{MODE_LABELS[mode] ?? mode}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/[0.05] w-full mt-8 mb-8">
          {(["today", "history"] as Tab[]).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)} className={`relative px-6 py-3 text-[11px] font-bold font-mono uppercase tracking-[0.2em] transition-all ${tab === tabKey ? "text-indigo-400" : "text-zinc-400 hover:text-white"}`}>
              {t(`tabs.${tabKey}`)}
              {tab === tabKey && (
                <motion.div layoutId="taskTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "today" && (
            <motion.div key="today" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              
              {/* Today's Submission Status */}
              {todaySub && (() => { 
                const s = statusMeta[todaySub.status] ?? statusMeta.pending; 
                const I = s.icon; 
                return (
                  <div className="relative bg-black/60 border border-white/[0.05] p-6 lg:p-8 overflow-hidden group shadow-2xl">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bg}`} />
                    <div className="absolute top-0 right-0 w-full h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
                    
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center border border-white/5 ${s.bg} shadow-inner bg-black/50`}><I size={20} className={s.color} /></div>
                        <div>
                          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] font-mono mb-1 ${s.color}`}>{s.label}</p>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{new Date(todaySub.submitted_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-sm text-zinc-300 font-sans font-medium tracking-wide leading-relaxed">{t('today.submitted', { task: todaySub.template_title })}</p>
                    
                    <div className="mt-8 flex flex-wrap gap-4">
                      {todaySub.status === "approved" && (
                        <div className="relative overflow-hidden group/reward border border-emerald-500/20 bg-emerald-500/5 px-6 py-3">
                          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 translate-x-[-100%] group-hover/reward:animate-[shimmer_2s_infinite]" />
                          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] font-mono text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">
                            <Gift size={14}/> {t('today.rewardGranted', { amount: todaySub.reward_amount, mode: todaySub.reward_mode })}
                          </p>
                        </div>
                      )}
                      {todaySub.status === "rejected" && todaySub.reject_reason && (
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] font-mono text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-3 inline-flex items-center gap-2"><XCircle size={14}/>{t('today.rejected', { reason: todaySub.reject_reason })}</p>
                      )}
                    </div>
                  </div>
                ); 
              })()}

              {/* Task Workflow Timeline */}
              {canSubmit && (
                <div className="pt-4">
                  
                  {/* STEP 1: Select Template */}
                  <StepContainer step={1} title={t('today.step1')} isActive={!selTpl} isDone={!!selTpl}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {templates.map((tpl: TaskTemplate) => (
                        <button key={tpl.id} onClick={() => { setSelTpl(tpl.id); setStep2Done(false); }} className={`group relative border p-6 text-left transition-all duration-300 overflow-hidden ${selTpl === tpl.id ? "border-indigo-500 bg-indigo-500/5 shadow-[0_0_30px_rgba(99,102,241,0.1)]" : "border-white/[0.05] bg-black/40 hover:border-indigo-500/30 hover:bg-white/[0.02]"}`}>
                          <div className={`absolute top-0 right-0 p-2 font-mono text-[8px] transition-opacity ${selTpl === tpl.id ? 'opacity-100 text-indigo-400' : 'opacity-20 group-hover:opacity-60'}`}>TPL_{tpl.id.slice(0,4)}</div>
                          {selTpl === tpl.id && <div className="absolute top-4 right-4"><span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full bg-indigo-400 opacity-75"/><span className="relative inline-flex h-2 w-2 bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.8)]"/></span></div>}
                          
                          <div className="flex items-center gap-4 mb-4">
                            <span className={`flex items-center justify-center w-10 h-10 border border-white/[0.05] bg-white/[0.02] text-xl transition-all ${selTpl === tpl.id ? 'grayscale-0 scale-110 border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'grayscale group-hover:grayscale-0'}`}>{tpl.icon || "📱"}</span>
                            <span className={`font-bold font-mono tracking-widest text-xs uppercase ${selTpl === tpl.id ? "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]" : "text-zinc-400 group-hover:text-white"}`}>{tpl.title}</span>
                          </div>
                          
                          <p className="text-xs font-sans text-zinc-400 leading-relaxed mb-6 min-h-[40px]">{tpl.description}</p>
                          
                          <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
                            <span className="text-[10px] font-black font-mono text-emerald-400 uppercase tracking-[0.1em] bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                              +{tpl.reward_amount} {MODE_LABELS[tpl.reward_mode] ?? tpl.reward_mode}
                            </span>
                            <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-[0.2em]">≥{tpl.min_views} 浏览量</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </StepContainer>

                  {/* STEP 2: Generate Content */}
                  <StepContainer step={2} title={t('today.step2')} isActive={!!selTpl && !step2Done} isDone={step2Done}>
                    <div className="bg-black/40 border border-white/[0.05] p-6 lg:p-8">
                      {!step2Done ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <p className="text-sm font-sans text-zinc-400 mb-8 text-center max-w-sm leading-relaxed">{t('today.step2Desc')}</p>
                          <button onClick={() => genPromo()} disabled={promoLoading} className="relative overflow-hidden group flex items-center gap-3 border border-indigo-500/50 bg-indigo-500/10 px-8 py-4 text-[11px] font-black font-mono text-indigo-400 uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white hover:border-indigo-400 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/20 to-indigo-500/0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]" />
                            <Sparkles size={16} className="group-hover:scale-110 transition-transform" />
                            {promoLoading ? t('today.generating') : t('today.generate')}
                          </button>
                        </div>
                      ) : (
                        promo && (
                          <div className="grid lg:grid-cols-[1fr_1fr] gap-8">
                            {/* Promo Image Side */}
                            <div className="space-y-4">
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-mono flex items-center gap-2"><ImageIcon size={12}/>{t('today.promoImage')}</p>
                              <PromoCard data={promo.image_data as any} />
                            </div>
                            
                            {/* Text Copies Side */}
                            <div className="space-y-4">
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-mono mb-6">{t('today.promoCopy')}</p>
                              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {promo.copies.map((c, i) => (
                                  <div key={i} className="relative border border-white/[0.05] bg-white/[0.02] p-5 group transition-colors hover:border-white/[0.2]">
                                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.05]">
                                      <span className="text-[9px] font-black font-mono text-indigo-400 uppercase tracking-[0.3em]">{c.style}</span>
                                      <button onClick={() => copyText(c.text, i)} className="flex items-center gap-1.5 text-[9px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition-colors border border-white/[0.1] px-2.5 py-1 hover:bg-white/5 bg-black/40"><Copy size={10} />{copied === i ? t('today.copied') : t('today.copy')}</button>
                                    </div>
                                    <p className="text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap font-sans font-medium">{c.text}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </StepContainer>

                  {/* STEP 3: Submit PoW */}
                  <StepContainer step={3} title={t('today.step3')} isActive={step2Done} isDone={false} isLast={true}>
                    <div className="bg-black/40 border border-white/[0.05] p-6 lg:p-8">
                       <p className="text-xs text-zinc-400 font-sans mb-8">{t('today.step3Desc')}</p>
                       <div className="space-y-6">
                        <div>
                          <label className="mb-2 flex items-center gap-2 text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-[0.2em]"><ExternalLink size={12} className="text-zinc-500" />{t('today.postUrl')}</label>
                          <input type="url" value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://x.com/your_post_url" className={inputCls} />
                        </div>
                        <div>
                          <label className="mb-2 flex items-center gap-2 text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-[0.2em]"><ImageIcon size={12} className="text-zinc-500" />{t('today.screenshotUrl')}</label>
                          <div
                            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-indigo-500/50', 'bg-indigo-500/5'); }}
                            onDragLeave={e => { e.currentTarget.classList.remove('border-indigo-500/50', 'bg-indigo-500/5'); }}
                            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-indigo-500/50', 'bg-indigo-500/5'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) handleFileSelect(f); }}
                            className="relative border border-dashed border-white/[0.15] bg-white/[0.02] p-6 text-center cursor-pointer hover:border-indigo-500/30 transition-colors"
                            onClick={() => document.getElementById('ss-file-input')?.click()}
                          >
                            <input id="ss-file-input" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                            {ssPreview ? (
                              <div className="space-y-3">
                                <img src={ssPreview} alt="截图预览" className="max-h-40 mx-auto object-contain border border-white/10" />
                                <div className="flex items-center justify-center gap-2">
                                  {uploadMut.isPending && <span className="text-[10px] font-mono text-amber-400 animate-pulse">{t('today.uploadingScreenshot')}</span>}
                                  {ssUrl && <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1"><CheckCircle2 size={10} />{t('today.uploadSuccess')}</span>}
                                  {uploadMut.isError && <span className="text-[10px] font-mono text-red-400">{(uploadMut.error as Error).message}</span>}
                                </div>
                                <p className="text-[9px] font-mono text-zinc-500">{ssFile?.name} · {ssFile ? (ssFile.size / 1024).toFixed(0) : 0}KB</p>
                              </div>
                            ) : (
                              <div className="py-4">
                                <Upload size={24} className="mx-auto text-zinc-500 mb-3" />
                                <p className="text-[11px] font-mono text-zinc-400">{t('today.screenshotPlaceholder')}</p>
                                <p className="text-[9px] font-mono text-zinc-600 mt-1">PNG / JPG / WebP · ≤ 5MB</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <button onClick={() => submitMut.mutate({ template_id: selTpl, post_url: postUrl, screenshot_url: ssUrl })} disabled={!postUrl || !ssUrl || submitMut.isPending}
                          className="flex w-full items-center justify-center gap-3 mt-8 relative overflow-hidden bg-indigo-600 py-4 text-[12px] font-black font-mono uppercase tracking-[0.3em] text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] group">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]" />
                          <Upload size={16} className={submitMut.isPending ? "animate-bounce" : ""} />
                          {submitMut.isPending ? t('today.submitting') : t('today.submit')}
                          <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                        
                        {submitMut.isError && <div className="flex items-center gap-3 border border-red-500/30 bg-red-500/10 px-5 py-4"><AlertCircle size={16} className="text-red-400 shrink-0" /><p className="text-[11px] font-mono text-red-300 tracking-widest uppercase">{(submitMut.error as Error).message}</p></div>}
                        {submitMut.isSuccess && <div className="flex items-center gap-3 border border-emerald-500/30 bg-emerald-500/10 px-5 py-4"><CheckCircle2 size={16} className="text-emerald-400 shrink-0" /><p className="text-[11px] font-mono text-emerald-300 tracking-widest uppercase">{t('today.submitSuccess')}</p></div>}
                      </div>
                    </div>
                  </StepContainer>

                </div>
              )}
            </motion.div>
          )}

          {tab === "history" && (
            <motion.div key="hist" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {hist.length === 0 ? (
                <div className="border border-white/[0.05] bg-black/40 py-24 text-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-8 h-[2px] bg-white/[0.1]" />
                  <div className="absolute bottom-0 left-0 w-8 h-[2px] bg-white/[0.1]" />
                  <History size={32} className="mx-auto text-zinc-500 mb-6 shrink-0" />
                  <p className="text-[11px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em]">{t('history.empty')}</p>
                </div>
              ) : hist.map((s: TaskSubmission, idx: number) => { 
                const st = statusMeta[s.status] ?? statusMeta.pending; 
                const I = st.icon; 
                return (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white/[0.01] border border-white/[0.05] hover:border-white/[0.2] transition-colors p-6 lg:p-8 relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${st.bg} opacity-50 group-hover:opacity-100 transition-opacity`} />
                  <div className="flex items-center gap-6">
                    <div className={`flex h-12 w-12 items-center justify-center border border-white/5 bg-black/50 shadow-inner ${st.bg}`}><I size={20} className={st.color} /></div>
                    <div>
                      <p className="text-sm font-bold text-white tracking-wide font-sans mb-1">{s.template_title}</p>
                      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">{new Date(s.submitted_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-white/[0.05] pt-4 sm:pt-0">
                    <span className={`text-[10px] font-black font-mono uppercase tracking-[0.3em] ${st.color}`}>{st.label}</span>
                    {s.reward_granted && <p className="text-[11px] font-black font-mono tracking-widest text-emerald-400 mt-2 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.2)]">+{s.reward_amount} {MODE_LABELS[s.reward_mode] ?? s.reward_mode}</p>}
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
