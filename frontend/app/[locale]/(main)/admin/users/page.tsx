"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import {
  getUsers,
  createUser,
  toggleUserActive,
  updateMembership,
  addCredits,
  type AdminUserInfo,
  type AdminUserListResponse,
} from "@/lib/api/admin-users";
import { EmptyUsers } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth-context";

// ── Constants ────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  operator: "运营",
  user: "用户",
};

const LEVEL_LABEL: Record<number, string> = {
  0: "免费",
  1: "专业",
  2: "旗舰",
};

const LEVEL_STYLE: Record<number, string> = {
  0: "bg-bg-elevated text-zinc-400 border-border",
  1: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  2: "bg-amber-500/10 text-amber-500 border-amber-500/20",
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

// ── Create User Dialog ───────────────────────────────────────

function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [level, setLevel] = useState(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (!email.trim()) {
        setFormError(t("users.enterEmail"));
        return;
      }
      if (password.length < 8) {
        setFormError(t("users.passwordMinLength"));
        return;
      }

      setSubmitting(true);
      try {
        await createUser({
          email: email.trim(),
          password,
          role,
          membership_level: level,
          expires_at:
            level > 0 && expiresAt
              ? new Date(expiresAt).toISOString()
              : null,
        });
        onCreated();
      } catch (err: unknown) {
        setFormError(
          err instanceof Error ? err.message : t("users.createFailed")
        );
      } finally {
        setSubmitting(false);
      }
    },
    [email, password, role, level, expiresAt, onCreated, t]
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        className="card-surface p-6 w-full max-w-md mx-4 shadow-xl border border-border rounded-xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5 border-b border-border/50 pb-4">
          <h2 className="text-[14px] font-bold font-mono tracking-widest uppercase text-zinc-100">{t("users.createUserTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-bg-elevated transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">{t("users.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="input font-mono bg-bg-surface/50"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">密码（至少 8 位）</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input font-mono tracking-widest bg-bg-surface/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">角色</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input font-medium bg-bg-surface/50"
              >
                <option value="user">用户</option>
                <option value="operator">运营</option>
                <option value="admin">管理员</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">会员等级</label>
              <select
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="input font-medium bg-bg-surface/50"
              >
                <option value={0}>免费</option>
                <option value={1}>专业</option>
                <option value={2}>旗舰</option>
              </select>
            </div>
          </div>

          {level > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">到期时间</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="input font-mono text-xs bg-bg-surface/50"
              />
            </div>
          )}

          {formError && (
            <div className="rounded-lg bg-bear/10 border border-bear/20 p-3 text-[11px] font-mono font-bold text-bear">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-5 border-t border-border/50 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary !py-2 !px-5 font-bold font-mono tracking-widest uppercase text-[11px]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary !py-2 !px-5 font-bold font-mono tracking-widest uppercase text-[11px]"
            >
              {submitting ? "创建中..." : "创建用户"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Add Credits Dialog ───────────────────────────────────────

function AddCreditsDialog({
  user: targetUser,
  onClose,
  onSuccess,
}: {
  user: AdminUserInfo;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState("intraday");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("手动充值");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      setSuccessMsg(null);

      const num = parseInt(amount, 10);
      if (!num || num <= 0 || num > 9999) {
        setFormError("请输入 1~9999 的整数");
        return;
      }

      setSubmitting(true);
      try {
        const res = await addCredits(targetUser.id, {
          mode,
          amount: num,
          note: note || "手动充值",
        });
        setSuccessMsg(res.message);
        setAmount("");
        onSuccess();
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : "充值失败");
      } finally {
        setSubmitting(false);
      }
    },
    [targetUser.id, mode, amount, note, onSuccess]
  );

  const MODE_OPTIONS = [
    { value: "scalping", label: "超短线" },
    { value: "intraday", label: "日内博弈" },
    { value: "trend", label: "趋势布局" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        className="card-surface p-6 w-full max-w-md mx-4 shadow-xl border border-border rounded-xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5 border-b border-border/50 pb-4">
          <div>
            <h2 className="text-[14px] font-bold font-mono tracking-widest uppercase text-zinc-100">充值分析次数</h2>
            <p className="text-[11px] font-mono text-zinc-500 mt-1">{targetUser.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-bg-elevated transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">分析模式</label>
            <div className="grid grid-cols-3 gap-2">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`rounded-lg border py-2.5 px-3 text-[11px] font-bold font-mono tracking-wider transition-all ${
                    mode === opt.value
                      ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.15)]"
                      : "bg-bg-surface/50 border-border text-zinc-500 hover:text-zinc-300 hover:border-border/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">充值数量</label>
            <input
              type="number"
              min={1}
              max={9999}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="请输入次数（1~9999）"
              className="input font-mono bg-bg-surface/50"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">备注</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="手动充值"
              className="input font-mono bg-bg-surface/50 text-xs"
            />
          </div>

          {formError && (
            <div className="rounded-lg bg-bear/10 border border-bear/20 p-3 text-[11px] font-mono font-bold text-bear">
              {formError}
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg bg-bull/10 border border-bull/20 p-3 text-[11px] font-mono font-bold text-bull">
              {successMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-5 border-t border-border/50 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary !py-2 !px-5 font-bold font-mono tracking-widest uppercase text-[11px]"
            >
              关闭
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary !py-2 !px-5 font-bold font-mono tracking-widest uppercase text-[11px]"
            >
              {submitting ? "充值中..." : "确认充值"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [page, setPage] = useState(1);

  // action states
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rechargeUser, setRechargeUser] = useState<AdminUserInfo | null>(null);
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

  if (!user || (user.role !== "admin" && user.role !== "operator")) return null;

  return (
    <div className="card-surface m-6 rounded-xl border border-border flex flex-col min-h-[calc(100vh-80px)]">
      {/* Title */}
      <motion.div
        className="flex items-center justify-between p-6 border-b border-border/50"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-zinc-100">用户管理</h1>
          <p className="text-[11px] font-bold font-mono tracking-widest text-zinc-500 uppercase">管理系统内所有用户账号、权限以及订阅层级</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="btn-primary !py-2 !px-4 flex items-center justify-center gap-2 text-[11px]"
          >
            <Plus size={14} />
            <span className="font-bold font-mono tracking-widest uppercase">创建用户</span>
          </button>
        )}
      </motion.div>

      {/* Create User Dialog */}
      {showCreateDialog && (
        <CreateUserDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            setShowCreateDialog(false);
            setPage(1);
            fetchUsers();
          }}
        />
      )}

      {/* Recharge Dialog */}
      {rechargeUser && (
        <AddCreditsDialog
          user={rechargeUser}
          onClose={() => setRechargeUser(null)}
          onSuccess={() => {}}
        />
      )}

      {/* ── Filters ──────────────────────────────────────── */}
      <motion.div
        className="p-6 border-b border-border/50 bg-bg-surface/30"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-5">
           <div className="flex flex-col gap-2 min-w-[220px] flex-1">
            <label htmlFor="user-search" className="text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500">
              搜索邮箱
            </label>
            <input
              id="user-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入邮箱关键字"
              className="input font-mono !py-2"
            />
          </div>

          <div className="flex flex-col gap-2 min-w-[140px]">
            <label htmlFor="role-filter" className="text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500">
              过滤角色
            </label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="input font-medium cursor-pointer !py-2"
            >
              <option value="">全部数据</option>
              <option value="admin">管理员组</option>
              <option value="operator">运营团队</option>
              <option value="user">常规用户</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 min-w-[140px]">
            <label htmlFor="level-filter" className="text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500">
              会员等级
            </label>
            <select
              id="level-filter"
              value={levelFilter}
              onChange={(e) => {
                setLevelFilter(e.target.value);
                setPage(1);
              }}
              className="input font-medium cursor-pointer !py-2"
            >
              <option value="">全部类别</option>
              <option value="0">免费账户</option>
              <option value="1">专业方案</option>
              <option value="2">旗舰方案</option>
            </select>
          </div>

          <button
            type="submit"
            className="btn-primary shrink-0 font-bold font-mono tracking-widest uppercase text-[11px] !py-3 !px-6"
          >
            筛选
          </button>
        </form>
      </motion.div>

      {/* ── Loading ──────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center p-12 flex-1 items-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {/* ── Error ────────────────────────────────────────── */}
      <AnimatePresence>
        {error && !loading && (
          <motion.div
            className="m-6 rounded-xl bg-bear/10 border border-bear/20 p-4 text-xs font-bold font-mono text-bear flex-1 text-center flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── User Table ───────────────────────────────────── */}
      {!loading && data && (
        <motion.div
          className="flex-1 flex flex-col"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {data.items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
               <EmptyUsers />
            </div>
          ) : (
             <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-bg-surface/50 text-left text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500">
                    <th className="px-6 py-4">邮箱账号</th>
                    <th className="px-6 py-4">体系角色</th>
                    <th className="px-6 py-4">会员层级</th>
                    <th className="px-6 py-4">到期时间</th>
                    <th className="px-6 py-4">活跃状态</th>
                    <th className="px-6 py-4">注册时间</th>
                    {isAdmin && <th className="px-6 py-4 text-right">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data.items.map((u) => (
                    <tr
                      key={u.id}
                      className="transition-colors hover:bg-bg-elevated/30 group"
                    >
                      <td className="px-6 py-4 text-zinc-200 font-bold font-mono text-[13px]">{u.email}</td>
                      <td className="px-6 py-4 text-zinc-500 font-mono text-xs font-bold uppercase tracking-widest">
                        {ROLE_LABEL[u.role] || u.role}
                      </td>
                      <td className="px-6 py-4">
                        {editingId === u.id ? (
                          <select
                            value={editLevel}
                            onChange={(e) =>
                              setEditLevel(Number(e.target.value))
                            }
                            className="input !h-8 !py-1 !text-xs min-w-[100px]"
                          >
                            <option value={0}>免费</option>
                            <option value={1}>专业</option>
                            <option value={2}>旗舰</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center justify-center rounded border px-2 py-0.5 text-[10px] font-bold font-mono uppercase tracking-widest ${LEVEL_STYLE[u.membership_level] || LEVEL_STYLE[0]}`}
                          >
                            {LEVEL_LABEL[u.membership_level] || "免费"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-zinc-400 font-mono text-[11px] font-bold tracking-widest">
                        {editingId === u.id ? (
                          <input
                            type="datetime-local"
                            value={editExpires}
                            onChange={(e) => setEditExpires(e.target.value)}
                            className="input !h-8 !py-1 !text-[11px]"
                          />
                        ) : u.expires_at ? (
                          formatDate(u.expires_at)
                        ) : (
                          <span className="text-zinc-600 font-sans">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 rounded bg-bull/10 border border-bull/20 px-2.5 py-1 text-[10px] font-bold font-mono uppercase tracking-widest text-bull">
                            <span className="h-1.5 w-1.5 rounded-full bg-bull shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
                            启用中
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded bg-bear/10 border border-bear/20 px-2.5 py-1 text-[10px] font-bold font-mono uppercase tracking-widest text-bear">
                            <span className="h-1.5 w-1.5 rounded-full bg-bear shadow-[0_0_5px_rgba(244,63,94,0.8)]" />
                            已停用
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-zinc-500 font-mono text-[11px] tracking-widest font-bold">
                        {formatDate(u.created_at)}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {editingId === u.id ? (
                              <>
                                <button
                                  onClick={cancelEdit}
                                  className="btn-secondary !py-1 !px-3 font-mono font-bold tracking-widest uppercase text-[10px]"
                                >
                                  取消
                                </button>
                                <button
                                  onClick={() => handleSaveMembership(u.id)}
                                  disabled={saving}
                                  className="btn-primary !py-1 !px-3 font-mono font-bold tracking-widest uppercase text-[10px]"
                                >
                                  {saving ? "..." : "保存"}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setRechargeUser(u)}
                                  className="btn-secondary !py-1 !px-3 text-amber-400 font-mono font-bold tracking-widest uppercase text-[10px]"
                                >
                                  充值
                                </button>
                                <button
                                  onClick={() => startEdit(u)}
                                  className="btn-secondary !py-1 !px-3 text-indigo-400 font-mono font-bold tracking-widest uppercase text-[10px]"
                                >
                                  配置层级
                                </button>
                                {u.role !== "admin" && (
                                  <button
                                    onClick={() => handleToggle(u)}
                                    disabled={togglingId === u.id}
                                    className={`btn-secondary !py-1 !px-3 font-mono font-bold tracking-widest uppercase text-[10px] ${
                                      u.is_active
                                        ? "text-bear"
                                        : "text-bull"
                                    }`}
                                  >
                                    {togglingId === u.id
                                      ? "..."
                                      : u.is_active
                                        ? "冻结"
                                        : "解封"}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ─────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/50 bg-bg-surface/50 px-6 py-4 mt-auto">
              <span className="text-[11px] font-bold font-mono tracking-widest text-zinc-500 uppercase">
                共 <span className="text-zinc-200">{data.total}</span> 条 <span className="text-zinc-700 mx-1">/</span> 第 <span className="text-zinc-200">{data.page}</span> 页 <span className="text-zinc-700 mx-1">/</span> 共 {totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-secondary !py-1.5 !px-4 text-[11px] font-bold font-mono tracking-widest uppercase"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-secondary !py-1.5 !px-4 text-[11px] font-bold font-mono tracking-widest uppercase"
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
