"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getNotifications,
  type NotificationLogInfo,
  type NotificationLogListResponse,
} from "@/lib/api/admin-notifications";
import { EmptyNotifications } from "@/components/ui/EmptyState";

// ── Constants ────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  email: "邮件",
  telegram: "Telegram",
};

const CHANNEL_STYLE: Record<string, string> = {
  email: "bg-[var(--color-accent)]/15 text-accent",
  telegram: "bg-[var(--color-bull)]/15 text-bull",
};

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Main Page ────────────────────────────────────────────────

export default function AdminNotificationsPage() {
  const [data, setData] = useState<NotificationLogListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getNotifications({
        search: search || undefined,
        channel: channelFilter || undefined,
        status: statusFilter || undefined,
        page,
        page_size: 20,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "查询通知历史失败");
    } finally {
      setLoading(false);
    }
  }, [search, channelFilter, statusFilter, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setPage(1);
      fetchData();
    },
    [fetchData]
  );

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Title */}
      <motion.h1
        className="text-lg font-semibold text-zinc-200"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        通知历史
      </motion.h1>

      {/* ── Filters ──────────────────────────────────────── */}
      <motion.form
        onSubmit={handleSearch}
        className="card-surface rounded-xl p-5 flex flex-wrap items-end gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <label htmlFor="notif-search" className="text-xs text-zinc-400">
            搜索
          </label>
          <input
            id="notif-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="收件人或主题关键词"
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <label htmlFor="channel-filter" className="text-xs text-zinc-400">
            渠道
          </label>
          <select
            id="channel-filter"
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white outline-none focus:border-accent transition-colors"
          >
            <option value="">全部</option>
            <option value="email">邮件</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <label htmlFor="status-filter" className="text-xs text-zinc-400">
            状态
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white outline-none focus:border-accent transition-colors"
          >
            <option value="">全部</option>
            <option value="sent">已发送</option>
            <option value="failed">失败</option>
          </select>
        </div>

        <button
          type="submit"
          className="h-9 px-5 rounded-lg bg-[var(--color-accent)] text-sm font-medium text-white hover:bg-[var(--color-accent)]/80 transition-colors shrink-0"
        >
          搜索
        </button>
      </motion.form>

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
            className="backdrop-blur-md bg-white/[0.04] border border-[var(--color-bear)]/30 rounded-xl p-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-sm text-bear">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Table ────────────────────────────────────────── */}
      {!loading && data && (
        <motion.div
          className="card-surface rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {data.items.length === 0 ? (
            <EmptyNotifications />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
                    <th className="px-5 py-3 font-medium">收件人</th>
                    <th className="px-5 py-3 font-medium">用户邮箱</th>
                    <th className="px-5 py-3 font-medium">渠道</th>
                    <th className="px-5 py-3 font-medium">事件类型</th>
                    <th className="px-5 py-3 font-medium">主题</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((n: NotificationLogInfo) => (
                    <tr
                      key={n.id}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3 text-white max-w-[200px] truncate">
                        {n.recipient}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">
                        {n.user_email || <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CHANNEL_STYLE[n.channel] || "bg-white/[0.06] text-zinc-400"}`}
                        >
                          {CHANNEL_LABEL[n.channel] || n.channel}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-300">{n.event_type}</td>
                      <td className="px-5 py-3 text-zinc-400 max-w-[200px] truncate">
                        {n.subject || <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {n.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bull)]/15 px-2.5 py-0.5 text-xs font-medium text-bull">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-bull)]" />
                            已发送
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bear)]/15 px-2.5 py-0.5 text-xs font-medium text-bear cursor-help"
                            title={n.error_message || ""}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-bear)]" />
                            失败
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 whitespace-nowrap">
                        {formatDate(n.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ─────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3">
              <span className="text-xs text-zinc-500">
                共 {data.total} 条，第 {data.page}/{totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg px-3 py-1 text-xs font-medium bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1] transition-colors disabled:opacity-30"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg px-3 py-1 text-xs font-medium bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1] transition-colors disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
