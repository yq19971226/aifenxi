"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getAdminOrders,
  type AdminOrderInfo,
  type AdminOrderQueryParams,
} from "@/lib/api/admin-orders";
import { EmptyOrders } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth-context";

// ── Helpers ──────────────────────────────────────────────────

const PLAN_LABEL: Record<number, string> = { 1: "专业", 2: "旗舰" };

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-[var(--color-bull)]/15", text: "text-bull", label: "已完成" },
  pending:   { bg: "bg-amber-400/15",  text: "text-amber-400",  label: "待确认" },
  failed:    { bg: "bg-[var(--color-bear)]/15",  text: "text-bear",  label: "失败" },
  expired:   { bg: "bg-zinc-400/15",   text: "text-zinc-400",   label: "已过期" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ── Page size options ────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

// ── Main Page ────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const { user } = useAuth();
  if (!user || (user.role !== "admin" && user.role !== "operator")) return null;
  // filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // data state
  const [items, setItems] = useState<AdminOrderInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: AdminOrderQueryParams = {
        page,
        page_size: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (planFilter) params.plan = Number(planFilter);

      const data = await getAdminOrders(params);
      setItems(data.items);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "查询订单失败");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planFilter, page, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // reset page when filters change
  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((v: string) => {
    setStatusFilter(v);
    setPage(1);
  }, []);

  const handlePlanChange = useCallback((v: string) => {
    setPlanFilter(v);
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((v: number) => {
    setPageSize(v);
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Title */}
      <motion.h1
        className="text-lg font-semibold text-zinc-200"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        平台订单
      </motion.h1>

      {/* ── Filter Bar ──────────────────────────────────── */}
      <motion.div
        className="card-surface rounded-lg p-4 flex flex-wrap items-end gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        {/* Search */}
        <div className="flex flex-col gap-1.5 min-w-[220px] flex-1">
          <label htmlFor="order-search" className="text-xs text-zinc-400">
            搜索
          </label>
          <input
            id="order-search"
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="邮箱 / 订单ID"
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Status dropdown */}
        <div className="flex flex-col gap-1.5 min-w-[130px]">
          <label htmlFor="order-status" className="text-xs text-zinc-400">
            状态
          </label>
          <select
            id="order-status"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
          >
            <option value="">全部</option>
            <option value="pending">待确认</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
        </div>

        {/* Plan dropdown */}
        <div className="flex flex-col gap-1.5 min-w-[130px]">
          <label htmlFor="order-plan" className="text-xs text-zinc-400">
            套餐类型
          </label>
          <select
            id="order-plan"
            value={planFilter}
            onChange={(e) => handlePlanChange(e.target.value)}
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
          >
            <option value="">全部</option>
            <option value="1">专业</option>
            <option value="2">旗舰</option>
          </select>
        </div>

        {/* Page size */}
        <div className="flex flex-col gap-1.5 min-w-[110px]">
          <label htmlFor="order-pagesize" className="text-xs text-zinc-400">
            每页条数
          </label>
          <select
            id="order-pagesize"
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} 条
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      {/* ── Loading ──────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-12">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      {/* ── Error ────────────────────────────────────────── */}
      <AnimatePresence>
        {error && !loading && (
          <motion.div
            className="backdrop-blur-md bg-white/[0.04] border border-[var(--color-bear)]/30 rounded-lg p-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-sm text-bear">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Orders Table ─────────────────────────────────── */}
      {!loading && !error && (
        <motion.div
          className="card-surface rounded-lg overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {items.length === 0 ? (
            <EmptyOrders />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
                    <th className="px-5 py-3 font-medium">订单ID</th>
                    <th className="px-5 py-3 font-medium">用户邮箱</th>
                    <th className="px-5 py-3 font-medium">套餐</th>
                    <th className="px-5 py-3 font-medium">金额</th>
                    <th className="px-5 py-3 font-medium">支付网络</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((order) => {
                    const st = STATUS_STYLE[order.status] ?? {
                      bg: "bg-zinc-400/15",
                      text: "text-zinc-400",
                      label: order.status,
                    };
                    return (
                      <tr
                        key={order.id}
                        className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-5 py-3 text-zinc-300 font-mono text-xs">
                          {order.payment_id}
                        </td>
                        <td className="px-5 py-3 text-white">
                          {order.user_email}
                        </td>
                        <td className="px-5 py-3 text-zinc-300">
                          {PLAN_LABEL[order.plan] ?? `Plan ${order.plan}`}
                        </td>
                        <td className="px-5 py-3 text-white font-medium">
                          {formatUSD(order.amount_usd)}
                        </td>
                        <td className="px-5 py-3 text-zinc-400">
                          {order.network ?? "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${st.text.replace("text-", "bg-")}`}
                            />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-zinc-400">
                          {formatDate(order.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Pagination ───────────────────────────────────── */}
      {!loading && !error && total > 0 && (
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <span className="text-xs text-zinc-500">
            共 {total} 条 · 第 {page} 页 / 共 {totalPages} 页
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-8 px-3 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs text-zinc-300 hover:bg-white/[0.1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              上一页
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-8 px-3 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs text-zinc-300 hover:bg-white/[0.1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              下一页
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
