"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getAdminOrders,
  type AdminOrderInfo,
  type AdminOrderQueryParams,
} from "@/lib/api/admin-orders";
import { AdminOrdersTable } from "@/components/admin/orders/AdminOrdersTable";
import { EmptyOrders } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth-context";

// ── Page size options ────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

// ── Main Page ────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const { user } = useAuth();
  if (!user || (user.role !== "admin" && user.role !== "operator")) return null;
  const isAdmin = user.role === "admin";
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
            <AdminOrdersTable
              isAdmin={isAdmin}
              items={items}
              loading={loading}
              onError={(message) => setError(message)}
              onSynced={fetchOrders}
            />
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
