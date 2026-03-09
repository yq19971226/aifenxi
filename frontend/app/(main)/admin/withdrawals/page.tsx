"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/layout/PageTransition";
import { adminPartnerApi, type WithdrawalRecord } from "@/lib/api/partner";
import {
  CheckCircle2,
  XCircle,
  Filter,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type StatusFilter = "" | "pending" | "completed" | "rejected";

export default function WithdrawalsPage() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return null;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["admin-withdrawals", filter],
    queryFn: () => adminPartnerApi.getWithdrawals(filter || undefined),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, tx_hash }: { id: string; tx_hash: string }) =>
      adminPartnerApi.approveWithdrawal(id, tx_hash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      setApproveId(null);
      setTxHash("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminPartnerApi.rejectWithdrawal(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      setRejectId(null);
      setRejectReason("");
    },
  });

  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    pending: { label: "待审", color: "text-yellow-400" },
    completed: { label: "已完", color: "text-green-400" },
    rejected: { label: "已驳", color: "text-red-400" },
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-white">提现审核</h1>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          {(["pending", "completed", "rejected", ""] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-[var(--color-accent)]/20 text-accent"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {f === "" ? "全部" : STATUS_MAP[f]?.label ?? f}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="py-12 text-center text-zinc-400">加载中...</div>
        ) : withdrawals.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">暂无记录</div>
        ) : (
          <div className="space-y-3">
            {withdrawals.map((w: WithdrawalRecord) => {
              const st = STATUS_MAP[w.status] ?? STATUS_MAP.pending;
              return (
                <div
                  key={w.id}
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">
                          ${w.amount.toFixed(2)} USDT
                        </span>
                        <span className={`text-xs ${st.color}`}>{st.label}</span>
                      </div>
                      <div className="space-y-0.5 text-xs text-zinc-400">
                        <p>用户: {w.email}</p>
                        <p className="font-mono truncate">地址: {w.trc20_address}</p>
                        <p>{new Date(w.created_at).toLocaleString("zh-CN")}</p>
                        {w.tx_hash && (
                          <p className="flex items-center gap-1 text-green-400">
                            <ExternalLink size={10} />
                            TX: {w.tx_hash}
                          </p>
                        )}
                        {w.reject_reason && (
                          <p className="text-red-400">原因: {w.reject_reason}</p>
                        )}
                      </div>
                    </div>

                    {w.status === "pending" && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setApproveId(w.id)}
                          className="flex items-center gap-1 rounded-lg bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-600/30"
                        >
                          <CheckCircle2 size={14} /> 通过
                        </button>
                        <button
                          onClick={() => setRejectId(w.id)}
                          className="flex items-center gap-1 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30"
                        >
                          <XCircle size={14} /> 驳回
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Approve: enter tx_hash */}
                  {approveId === w.id && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        placeholder="链上 TX Hash"
                        className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white font-mono placeholder:text-zinc-500 focus:border-green-400 focus:outline-none"
                      />
                      <button
                        onClick={() => approveMutation.mutate({ id: w.id, tx_hash: txHash })}
                        disabled={!txHash || approveMutation.isPending}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        确认通过
                      </button>
                      <button
                        onClick={() => { setApproveId(null); setTxHash(""); }}
                        className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                      >
                        取消
                      </button>
                    </div>
                  )}

                  {/* Reject */}
                  {rejectId === w.id && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="驳回原因"
                        className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-red-400 focus:outline-none"
                      />
                      <button
                        onClick={() => rejectMutation.mutate({ id: w.id, reason: rejectReason })}
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
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
