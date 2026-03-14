"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getNotifications,
  type NotificationLogInfo,
  type NotificationLogListResponse,
} from "@/lib/api/admin-notifications";
import { EmptyNotifications } from "@/components/ui/EmptyState";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";

// ── Constants ────────────────────────────────────────────────


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
  const { user } = useAuth();
  const t = useTranslations("admin.notifications");
  
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
      setError(err instanceof Error ? err.message : t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Title */}
      <motion.h1
        className="text-lg font-semibold text-zinc-200"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {t("title")}
      </motion.h1>

      {/* ── Filters ──────────────────────────────────────── */}
      <motion.form
        onSubmit={handleSearch}
        className="card-surface rounded-lg p-5 flex flex-wrap items-end gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <label htmlFor="notif-search" className="text-xs text-zinc-400">
            {t("searchLabel")}
          </label>
          <input
            id="notif-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <label htmlFor="channel-filter" className="text-xs text-zinc-400">
            {t("channelLabel")}
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
            <option value="">{t("all")}</option>
            <option value="email">{t("channels.email")}</option>
            <option value="telegram">{t("channels.telegram")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <label htmlFor="status-filter" className="text-xs text-zinc-400">
            {t("statusLabel")}
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
            <option value="">{t("all")}</option>
            <option value="sent">{t("statuses.sent")}</option>
            <option value="failed">{t("statuses.failed")}</option>
          </select>
        </div>

        <button
          type="submit"
          className="h-9 px-5 rounded-lg bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors shrink-0"
        >
          {t("searchButton")}
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
            className="backdrop-blur-md bg-white/[0.04] border border-[var(--color-bear)]/30 rounded-lg p-6 text-center"
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
          className="card-surface rounded-lg overflow-hidden"
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
                    <th className="px-5 py-3 font-medium">{t("table.recipient")}</th>
                    <th className="px-5 py-3 font-medium">{t("table.userEmail")}</th>
                    <th className="px-5 py-3 font-medium">{t("table.channel")}</th>
                    <th className="px-5 py-3 font-medium">{t("table.eventType")}</th>
                    <th className="px-5 py-3 font-medium">{t("table.subject")}</th>
                    <th className="px-5 py-3 font-medium">{t("table.status")}</th>
                    <th className="px-5 py-3 font-medium">{t("table.time")}</th>
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
                          {n.channel === "email" ? t("channels.email") : n.channel === "telegram" ? t("channels.telegram") : n.channel}
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
                            {t("statuses.sent")}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bear)]/15 px-2.5 py-0.5 text-xs font-medium text-bear cursor-help"
                            title={n.error_message || ""}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-bear)]" />
                            {t("statuses.failed")}
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
                {t("pagination.summary", { total: data.total, page: data.page, totalPages })}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg px-3 py-1 text-xs font-medium bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1] transition-colors disabled:opacity-30"
                >
                  {t("pagination.prevPage")}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg px-3 py-1 text-xs font-medium bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1] transition-colors disabled:opacity-30"
                >
                  {t("pagination.nextPage")}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
