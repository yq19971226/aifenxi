"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/layout/PageTransition";
import { adminTasksApi, type TaskSubmission } from "@/lib/api/tasks";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Image as ImageIcon,
  Filter,
  Clock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";

type StatusFilter = "" | "pending" | "approved" | "rejected";

export default function TaskReviewPage() {
  const t = useTranslations("admin");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: stats } = useQuery({
    queryKey: ["admin-task-stats"],
    queryFn: adminTasksApi.getStats,
    enabled: !!user && user.role === "admin",
  });

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["admin-task-submissions", filter],
    queryFn: () => adminTasksApi.listSubmissions(filter || undefined),
    enabled: !!user && user.role === "admin",
  });

  const approveMutation = useMutation({
    mutationFn: adminTasksApi.approveSubmission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-task-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-task-stats"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminTasksApi.rejectSubmission(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-task-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-task-stats"] });
      setRejectId(null);
      setRejectReason("");
    },
  });

  if (!user || user.role !== "admin") return null;

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div className="flex items-end justify-between border-b border-white/[0.05] pb-6">
          <div>
            <h1 className="text-2xl font-black text-white font-mono tracking-widest uppercase mb-2">{t("taskReview.title")}</h1>
            <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.3em]">
              {t("taskReview.subtitle")}
            </p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: t("taskReview.pending"), value: stats.pending, color: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/5" },
              { label: t("taskReview.approved"), value: stats.approved, color: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/5"},
              { label: t("taskReview.rejected"), value: stats.rejected, color: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/5" },
              { label: t("taskReview.participants"), value: stats.unique_users, color: "text-indigo-400", border: "border-indigo-500/30", bg: "bg-indigo-500/5" },
            ].map((s) => (
              <div key={s.label} className={`border ${s.border} ${s.bg} p-6 flex flex-col items-center justify-center shadow-inner relative overflow-hidden group`}>
                <div className="absolute top-0 right-0 w-8 h-[1px] bg-white/[0.2]" />
                <div className="absolute bottom-0 left-0 w-8 h-[1px] bg-white/[0.2]" />
                <div className={`text-3xl font-black font-mono tracking-tighter ${s.color} drop-shadow-sm`}>{s.value}</div>
                <div className="text-[9px] font-bold font-mono text-zinc-500 tracking-[0.2em] uppercase mt-2 group-hover:text-zinc-400 transition-colors">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] pb-6">
          <Filter size={14} className="text-zinc-500 mr-2" />
          {(["pending", "approved", "rejected", ""] as StatusFilter[]).map((f) => {
            const isActive = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`border px-4 py-2 text-[10px] font-black font-mono tracking-widest uppercase transition-all duration-300 ${
                  isActive
                    ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                    : "border-white/[0.1] bg-black/40 text-zinc-500 hover:border-white/[0.2] hover:bg-white/[0.05] hover:text-zinc-300"
                }`}
              >
                {f === "" ? t("taskReview.all") : f === "pending" ? t("taskReview.pending") : f === "approved" ? t("taskReview.approved") : t("taskReview.rejected")}
              </button>
            );
          })}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="relative bg-black border border-white/[0.05] py-20 text-center overflow-hidden">
             <span className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em] animate-pulse">加载中...</span>
          </div>
        ) : submissions.length === 0 ? (
          <div className="relative bg-black border border-white/[0.05] py-20 text-center overflow-hidden">
             <span className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em]">暂无记录</span>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((s: TaskSubmission) => (
              <div
                key={s.id}
                className="relative bg-black border border-white/[0.05] p-5 lg:p-6 transition-colors hover:border-white/[0.1] hover:bg-white/[0.01]"
              >
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-indigo-500/20" />
                
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className="text-sm font-black text-white font-mono tracking-widest uppercase">
                        {s.template_title}
                      </span>
                      <span className="border border-white/[0.1] bg-white/[0.05] px-2 py-0.5 text-[9px] font-bold font-mono tracking-widest text-zinc-400">
                        {s.email}
                      </span>
                      {s.status !== "pending" && (
                        <span
                          className={`border px-2 py-0.5 text-[9px] font-bold font-mono tracking-widest uppercase ${
                            s.status === "approved" 
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" 
                              : "border-red-500/30 bg-red-500/10 text-red-400"
                          }`}
                        >
                          {s.status === "approved" ? t("taskReview.approved") : t("taskReview.rejected")}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-bold font-mono tracking-widest text-zinc-500 uppercase mt-4">
                      <a
                        href={s.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors"
                      >
                        <ExternalLink size={12} className="opacity-70" /> {t("taskReview.viewPost")}
                      </a>
                      <a
                        href={s.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors"
                      >
                        <ImageIcon size={12} className="opacity-70" /> {t("taskReview.viewScreenshot")}
                      </a>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1 h-3 bg-zinc-600 block"></span>
                        {t("taskReview.minViews")}: <span className="text-zinc-300">≥{s.min_views}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1 h-3 bg-emerald-500/50 block"></span>
                        {t("taskReview.reward")}: <span className="text-emerald-400">+{s.reward_amount} {s.reward_mode}</span>
                      </span>
                    </div>
                    
                    <div className="mt-4 text-[9px] font-mono tracking-widest text-zinc-400 uppercase flex items-center gap-2">
                      <Clock size={10} /> {t("taskReview.submittedAt")}: {new Date(s.submitted_at).toLocaleString("zh-CN")}
                    </div>
                  </div>

                  {/* Actions */}
                  {s.status === "pending" && (
                    <div className="flex gap-3 shrink-0 mt-4 lg:mt-0">
                      <button
                        onClick={() => approveMutation.mutate(s.id)}
                        disabled={approveMutation.isPending}
                        className="flex items-center gap-2 border border-emerald-500/40 bg-emerald-600/10 px-6 py-2.5 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-40"
                      >
                        <CheckCircle2 size={14} /> {t("taskReview.approve")}
                      </button>
                      <button
                        onClick={() => setRejectId(s.id)}
                        className="flex items-center gap-2 border border-red-500/40 bg-red-600/10 px-6 py-2.5 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-red-400 hover:bg-red-500 hover:text-white transition-all"
                      >
                        <XCircle size={14} /> {t("taskReview.reject")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Reject Dialog */}
                {rejectId === s.id && (
                  <div className="mt-6 pt-6 border-t border-white/[0.05] flex flex-col sm:flex-row gap-4">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={t("taskReview.enterRejectReason")}
                      className="flex-1 border border-red-500/30 bg-red-500/5 px-4 py-3 text-[11px] text-white font-mono uppercase tracking-widest placeholder:text-zinc-400 focus:border-red-500/60 focus:bg-red-500/10 outline-none transition-all"
                    />
                    <button
                      onClick={() =>
                        rejectMutation.mutate({ id: s.id, reason: rejectReason })
                      }
                      disabled={!rejectReason || rejectMutation.isPending}
                      className="border border-red-500/40 bg-red-600/80 px-8 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-white disabled:opacity-40 transition-all hover:bg-red-500"
                    >
                      确认驳回
                    </button>
                    <button
                      onClick={() => { setRejectId(null); setRejectReason(""); }}
                      className="border border-white/[0.1] bg-white/[0.02] px-8 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
