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
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";

type StatusFilter = "" | "pending" | "completed" | "rejected";

export default function WithdrawalsPage() {
  const t = useTranslations("admin");
  const { user } = useAuth();
  
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["admin-withdrawals", filter],
    queryFn: () => adminPartnerApi.getWithdrawals(filter || undefined),
    enabled: !!user && user.role === "admin",
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
    pending: { label: t("withdrawals.pending"), color: "text-yellow-400" },
    completed: { label: t("withdrawals.completed"), color: "text-green-400" },
    rejected: { label: t("withdrawals.rejected"), color: "text-red-400" },
  };

  if (!user || user.role !== "admin") return null;

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div className="border-b border-white/[0.05] pb-6">
          <h1 className="text-2xl font-black text-white font-mono tracking-widest uppercase mb-2">{t("withdrawals.title")}</h1>
          <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.3em]">
            {t("withdrawals.subtitle")}
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.05] px-3 py-2">
            <Filter size={14} className="text-zinc-500" />
            <span className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400">{t("withdrawals.status")}</span>
          </div>
          <div className="flex gap-2">
            {(["pending", "completed", "rejected", ""] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`border px-4 py-2 text-[10px] font-black font-mono uppercase tracking-[0.2em] transition-all duration-300 ${
                  filter === f
                    ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                    : "bg-black border-white/[0.05] text-zinc-500 hover:border-white/[0.2] hover:text-white"
                }`}
              >
                {f === "" ? t("withdrawals.all") : STATUS_MAP[f]?.label ?? f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="relative bg-black border border-white/[0.05] py-20 text-center overflow-hidden">
               <span className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em] animate-pulse">{t("withdrawals.loading")}</span>
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="relative bg-black border border-white/[0.05] py-20 text-center overflow-hidden">
               <span className="text-[11px] font-black font-mono text-zinc-500 uppercase tracking-[0.3em]">{t("withdrawals.noRecords")}</span>
            </div>
          ) : (
            withdrawals.map((w: WithdrawalRecord) => {
              const st = STATUS_MAP[w.status] ?? STATUS_MAP.pending;
              return (
                <div
                  key={w.id}
                  className="relative bg-black border border-white/[0.05] p-5 lg:p-6 overflow-hidden transition-all duration-300 hover:border-white/[0.15] hover:bg-white/[0.01]"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${st.color.replace('text-', 'bg-').replace('400', '500/50')}`} />
                  
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-4 mb-4">
                        <span className="text-xl font-black font-mono text-white tracking-widest drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                          ${w.amount.toFixed(2)}
                        </span>
                        <span className={`text-[10px] font-black font-mono uppercase tracking-[0.2em] px-2 py-1 border bg-opacity-10 ${st.color} ${st.color.replace('text-', 'border-').replace('400', '500/30')} ${st.color.replace('text-', 'bg-')}`}>
                          {st.label}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
                        <div>
                          <p className="text-[9px] font-bold font-mono text-zinc-600 uppercase tracking-widest mb-1">{t("withdrawals.userEmail")}</p>
                          <p className="text-[11px] font-mono text-zinc-300 tracking-wider truncate">{w.email}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold font-mono text-zinc-600 uppercase tracking-widest mb-1">{t("withdrawals.withdrawAddress")}</p>
                          <p className="text-[11px] font-mono text-zinc-400 tracking-wider truncate">{w.trc20_address}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold font-mono text-zinc-600 uppercase tracking-widest mb-1">{t("withdrawals.applyTime")}</p>
                          <p className="text-[11px] font-mono text-zinc-400 tracking-wider">{new Date(w.created_at).toLocaleString("zh-CN")}</p>
                        </div>
                        {w.tx_hash && (
                          <div>
                            <p className="text-[9px] font-bold font-mono text-zinc-600 uppercase tracking-widest mb-1">{t("withdrawals.txHash")}</p>
                            <p className="flex items-center gap-2 text-[11px] font-mono text-emerald-400 tracking-wider">
                              <ExternalLink size={10} />
                              <span className="truncate">{w.tx_hash}</span>
                            </p>
                          </div>
                        )}
                        {w.reject_reason && (
                          <div className="sm:col-span-2">
                             <p className="text-[9px] font-bold font-mono text-zinc-600 uppercase tracking-widest mb-1">{t("withdrawals.rejectReason")}</p>
                             <p className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 tracking-wider">{w.reject_reason}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {w.status === "pending" && (
                      <div className="flex sm:flex-col gap-3 shrink-0">
                        <button
                          onClick={() => setApproveId(w.id)}
                          className="flex items-center justify-center gap-2 border border-emerald-500/40 bg-emerald-500/10 px-6 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                        >
                          <CheckCircle2 size={14} /> {t("withdrawals.approve")}
                        </button>
                        <button
                          onClick={() => setRejectId(w.id)}
                          className="flex items-center justify-center gap-2 border border-red-500/40 bg-red-500/10 px-6 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                        >
                          <XCircle size={14} /> {t("withdrawals.reject")}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Approve: enter tx_hash */}
                  {approveId === w.id && (
                    <div className="mt-6 pt-6 border-t border-white/[0.05] flex flex-col sm:flex-row gap-4">
                      <input
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        placeholder={t("withdrawals.enterTxHash")}
                        className="flex-1 border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-[11px] text-white font-mono uppercase tracking-widest placeholder:text-zinc-600 focus:border-emerald-500/60 focus:bg-emerald-500/10 outline-none transition-all"
                      />
                      <button
                        onClick={() => approveMutation.mutate({ id: w.id, tx_hash: txHash })}
                        disabled={!txHash || approveMutation.isPending}
                        className="border border-emerald-500/40 bg-emerald-600/80 px-8 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-white disabled:opacity-40 transition-all hover:bg-emerald-500"
                      >
                        CONFIRM
                      </button>
                      <button
                        onClick={() => { setApproveId(null); setTxHash(""); }}
                        className="border border-white/[0.1] bg-white/[0.02] px-8 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all"
                      >
                        CANCEL
                      </button>
                    </div>
                  )}

                  {/* Reject */}
                  {rejectId === w.id && (
                    <div className="mt-6 pt-6 border-t border-white/[0.05] flex flex-col sm:flex-row gap-4">
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder={t("withdrawals.enterRejectReason")}
                        className="flex-1 border border-red-500/30 bg-red-500/5 px-4 py-3 text-[11px] text-white font-mono uppercase tracking-widest placeholder:text-zinc-600 focus:border-red-500/60 focus:bg-red-500/10 outline-none transition-all"
                      />
                      <button
                        onClick={() => rejectMutation.mutate({ id: w.id, reason: rejectReason })}
                        disabled={!rejectReason || rejectMutation.isPending}
                        className="border border-red-500/40 bg-red-600/80 px-8 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-white disabled:opacity-40 transition-all hover:bg-red-500"
                      >
                        CONFIRM
                      </button>
                      <button
                        onClick={() => { setRejectId(null); setRejectReason(""); }}
                        className="border border-white/[0.1] bg-white/[0.02] px-8 py-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all"
                      >
                        CANCEL
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </PageTransition>
  );
}
