"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getUsers,
  toggleUserActive,
  updateMembership,
  type AdminUserInfo,
  type AdminUserListResponse,
} from "@/lib/api/admin-users";
import { EmptyUsers } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth-context";

// ── Constants ────────────────────────────────────────────────

const LEVEL_LABEL: Record<number, string> = {
  0: "免费",
  1: "专业",
  2: "旗舰",
};

const LEVEL_STYLE: Record<number, string> = {
  0: "bg-zinc-500/15 text-zinc-400",
  1: "bg-[var(--color-accent)]/15 text-accent",
  2: "bg-[#F5A623]/15 text-[#F5A623]",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "管理",
  operator: "运营",
  user: "用户",
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

export default function AdminUsersPage() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return null;
  const [data, setData] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [page, setPage] = useState(1);

  // action states
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLevel, setEditLevel] = useState(0);
  const [editExpires, setEditExpires] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUsers({
        search: search || undefined,
        role: roleFilter || undefined,
        membership_level: levelFilter !== "" ? Number(levelFilter) : undefined,
        page,
        page_size: 20,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "查询用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, levelFilter, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setPage(1);
      fetchUsers();
    },
    [fetchUsers]
  );

  const handleToggle = useCallback(
    async (user: AdminUserInfo) => {
      setTogglingId(user.id);
      try {
        await toggleUserActive(user.id, !user.is_active);
        await fetchUsers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "操作失败");
      } finally {
        setTogglingId(null);
      }
    },
    [fetchUsers]
  );

  const startEdit = useCallback((user: AdminUserInfo) => {
    setEditingId(user.id);
    setEditLevel(user.membership_level);
    setEditExpires(
      user.expires_at
        ? new Date(user.expires_at).toISOString().slice(0, 16)
        : ""
    );
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleSaveMembership = useCallback(
    async (userId: string) => {
      setSaving(true);
      try {
        await updateMembership(
          userId,
          editLevel,
          editExpires ? new Date(editExpires).toISOString() : null
        );
        setEditingId(null);
        await fetchUsers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "调整会员等级失败");
      } finally {
        setSaving(false);
      }
    },
    [editLevel, editExpires, fetchUsers]
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
        用户管理
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
          <label htmlFor="user-search" className="text-xs text-zinc-400">
            搜索邮箱
          </label>
          <input
            id="user-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="输入邮箱关键"
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <label htmlFor="role-filter" className="text-xs text-zinc-400">
            角色
          </label>
          <select
            id="role-filter"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white outline-none focus:border-accent transition-colors"
          >
            <option value="">全部</option>
            <option value="admin">管理员</option>
            <option value="operator">运营</option>
            <option value="user">用户</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <label htmlFor="level-filter" className="text-xs text-zinc-400">
            会员等级
          </label>
          <select
            id="level-filter"
            value={levelFilter}
            onChange={(e) => {
              setLevelFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white outline-none focus:border-accent transition-colors"
          >
            <option value="">全部</option>
            <option value="0">免费</option>
            <option value="1">专业</option>
            <option value="2">旗舰</option>
          </select>
        </div>

        <button
          type="submit"
          className="h-9 px-5 rounded-lg bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors shrink-0"
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
            className="backdrop-blur-md bg-white/[0.04] border border-[var(--color-bear)]/30 rounded-lg p-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-sm text-bear">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── User Table ───────────────────────────────────── */}
      {!loading && data && (
        <motion.div
          className="card-surface rounded-lg overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {data.items.length === 0 ? (
            <EmptyUsers />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
                    <th className="px-5 py-3 font-medium">邮箱</th>
                    <th className="px-5 py-3 font-medium">角色</th>
                    <th className="px-5 py-3 font-medium">会员等级</th>
                    <th className="px-5 py-3 font-medium">到期时间</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">注册时间</th>
                    <th className="px-5 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3 text-white">{u.email}</td>
                      <td className="px-5 py-3 text-zinc-300">
                        {ROLE_LABEL[u.role] || u.role}
                      </td>
                      <td className="px-5 py-3">
                        {editingId === u.id ? (
                          <select
                            value={editLevel}
                            onChange={(e) =>
                              setEditLevel(Number(e.target.value))
                            }
                            className="h-7 rounded bg-white/[0.06] border border-white/[0.1] px-2 text-xs text-white outline-none"
                          >
                            <option value={0}>免费</option>
                            <option value={1}>专业</option>
                            <option value={2}>旗舰</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_STYLE[u.membership_level] || LEVEL_STYLE[0]}`}
                          >
                            {LEVEL_LABEL[u.membership_level] || "免费"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">
                        {editingId === u.id ? (
                          <input
                            type="datetime-local"
                            value={editExpires}
                            onChange={(e) => setEditExpires(e.target.value)}
                            className="h-7 rounded bg-white/[0.06] border border-white/[0.1] px-2 text-xs text-white outline-none"
                          />
                        ) : u.expires_at ? (
                          formatDate(u.expires_at)
                        ) : (
                          <span className="text-zinc-500"></span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bull)]/15 px-2.5 py-0.5 text-xs font-medium text-bull">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-bull)]" />
                            启用
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bear)]/15 px-2.5 py-0.5 text-xs font-medium text-bear">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-bear)]" />
                            停用
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === u.id ? (
                            <>
                              <button
                                onClick={() => handleSaveMembership(u.id)}
                                disabled={saving}
                                className="rounded-lg px-3 py-1 text-xs font-medium bg-[var(--color-accent)]/15 text-accent hover:bg-[var(--color-accent)]/25 transition-colors disabled:opacity-50"
                              >
                                {saving ? "保存中" : "保存"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="rounded-lg px-3 py-1 text-xs font-medium bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1] transition-colors"
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(u)}
                                className="rounded-lg px-3 py-1 text-xs font-medium bg-[var(--color-accent)]/15 text-accent hover:bg-[var(--color-accent)]/25 transition-colors"
                              >
                                调整等级
                              </button>
                              {u.role !== "admin" && (
                                <button
                                  onClick={() => handleToggle(u)}
                                  disabled={togglingId === u.id}
                                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                    u.is_active
                                      ? "bg-[var(--color-bear)]/15 text-bear hover:bg-[var(--color-bear)]/25"
                                      : "bg-[var(--color-bull)]/15 text-bull hover:bg-[var(--color-bull)]/25"
                                  }`}
                                >
                                  {togglingId === u.id
                                    ? "处理中"
                                    : u.is_active
                                      ? "停用"
                                      : "启用"}
                                </button>
                              )}
                            </>
                          )}
                        </div>
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
