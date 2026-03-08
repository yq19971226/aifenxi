"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/layout/PageTransition";
import { adminTasksApi, type TaskSubmission, type TaskStats } from "@/lib/api/tasks";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Filter,
} from "lucide-react";

type StatusFilter = "" | "pending" | "approved" | "rejected";

export default function TaskReviewPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: stats } = useQuery({
    queryKey: ["admin-task-stats"],
    queryFn: adminTasksApi.getStats,
  });

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["admin-task-submissions", filter],
    queryFn: () => adminTasksApi.listSubmissions(filter || undefined),
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

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-white">任务审核</h1>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "待审", value: stats.pending, color: "text-yellow-400" },
              { label: "已通过", value: stats.approved, color: "text-green-400" },
              { label: "已驳", value: stats.rejected, color: "text-red-400" },
              { label: "参与用户", value: stats.unique_users, color: "text-blue-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-zinc-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          {(["pending", "approved", "rejected", ""] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-[var(--color-accent)]/20 text-accent"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {f === "" ? "全部" : f === "pending" ? "待审" : f === "approved" ? "已通过" : "已驳"}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="py-12 text-center text-zinc-400">加载中...</div>
        ) : submissions.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">暂无记录</div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s: TaskSubmission) => (
              <div
                key={s.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        {s.template_title}
                      </span>
                      <span className="text-xs text-zinc-500">{s.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <a
                        href={s.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-accent"
                      >
                        <ExternalLink size={12} /> 帖子
                      </a>
                      <a
                        href={s.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-accent"
                      >
                        <ImageIcon size={12} /> 截图
                      </a>
                      <span>需 ≥{s.min_views} 浏览</span>
                      <span>
                        奖励: +{s.reward_amount} {s.reward_mode}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {new Date(s.submitted_at).toLocaleString("zh-CN")}
                    </div>
                  </div>

                  {/* Actions */}
                  {s.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approveMutation.mutate(s.id)}
                        disabled={approveMutation.isPending}
                        className="flex items-center gap-1 rounded-lg bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-600/30"
                      >
                        <CheckCircle2 size={14} /> 通过
                      </button>
                      <button
                        onClick={() => setRejectId(s.id)}
                        className="flex items-center gap-1 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30"
                      >
                        <XCircle size={14} /> 驳回
                      </button>
                    </div>
                  )}
                  {s.status !== "pending" && (
                    <span
                      className={`text-xs font-medium ${
                        s.status === "approved" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {s.status === "approved" ? "已通过" : "已驳"}
                    </span>
                  )}
                </div>

                {/* Reject Dialog */}
                {rejectId === s.id && (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="驳回原因"
                      className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-red-400 focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        rejectMutation.mutate({ id: s.id, reason: rejectReason })
                      }
                      disabled={!rejectReason || rejectMutation.isPending}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      确认驳回
                    </button>
                    <button
                      onClick={() => { setRejectId(null); setRejectReason(""); }}
                      className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
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
