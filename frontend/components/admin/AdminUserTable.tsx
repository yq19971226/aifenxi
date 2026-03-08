"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Ban,
  CheckCircle2,
  Crown,
  Star,
  User,
  MoreHorizontal,
} from "lucide-react";
import {
  getUsers,
  toggleUserActive,
  updateMembership,
  type AdminUserInfo,
  type AdminUserListResponse,
} from "@/lib/api/admin-users";

/* ── Constants ── */

const LEVEL_LABEL: Record<number, string> = { 0: "免费", 1: "专业", 2: "旗舰" };

const LEVEL_ICON: Record<number, React.ReactNode> = {
  0: <User size={10} />,
  1: <Star size={10} />,
  2: <Crown size={10} />,
};

const LEVEL_COLOR: Record<number, string> = {
  0: "text-zinc-500",
  1: "text-amber-400",
  2: "text-violet-400",
};

/* ── Props ── */

export interface AdminUserTableProps {
  className?: string;
}

/* ── Component ── */

export function AdminUserTable({ className = "" }: AdminUserTableProps) {
  const [data, setData] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsers({ search, page, page_size: pageSize });
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleActive = async (userId: string, active: boolean) => {
    try {
      await toggleUserActive(userId, !active);
      load();
    } catch {
      /* ignore */
    }
  };

  const handleLevelChange = async (userId: string, newLevel: number) => {
    try {
      await updateMembership(userId, newLevel, null);
      load();
    } catch {
      /* ignore */
    }
  };

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className={`card ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <h3 className="text-sm font-medium text-zinc-200">用户管理</h3>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="搜索邮箱..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input pl-8 !w-48 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-5 py-2.5 text-left text-sm font-medium text-zinc-500">邮箱</th>
              <th className="px-5 py-2.5 text-left text-sm font-medium text-zinc-500">会员等级</th>
              <th className="px-5 py-2.5 text-left text-sm font-medium text-zinc-500">状态</th>
              <th className="px-5 py-2.5 text-left text-sm font-medium text-zinc-500">注册时间</th>
              <th className="px-5 py-2.5 text-right text-sm font-medium text-zinc-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {loading
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, c) => (
                      <td key={c} className="px-5 py-3">
                        <div className="h-3 w-3/4 skeleton rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              : users.length === 0
              ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-zinc-500">
                    暂无用户
                  </td>
                </tr>
              )
              : users.map((u: AdminUserInfo) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Email */}
                    <td className="px-5 py-3">
                      <span className="text-xs font-mono text-zinc-300">{u.email}</span>
                    </td>

                    {/* Level */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={LEVEL_COLOR[u.membership_level] ?? "text-zinc-500"}>
                          {LEVEL_ICON[u.membership_level] ?? <User size={10} />}
                        </span>
                        <select
                          value={u.membership_level}
                          onChange={(e) => handleLevelChange(u.id, Number(e.target.value))}
                          className="bg-transparent text-sm text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors outline-none"
                        >
                          {Object.entries(LEVEL_LABEL).map(([val, label]) => (
                            <option key={val} value={val} className="bg-zinc-900">
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-sm ${
                          u.is_active ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            u.is_active ? "bg-emerald-500" : "bg-red-500"
                          }`}
                        />
                        {u.is_active ? "正常" : "封禁"}
                      </span>
                    </td>

                    {/* Created at */}
                    <td className="px-5 py-3 text-sm text-zinc-500">
                      {new Date(u.created_at).toLocaleDateString("zh-CN")}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleToggleActive(u.id, u.is_active)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors ${
                          u.is_active
                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        }`}
                      >
                        {u.is_active ? (
                          <>
                            <Ban size={11} /> 封禁
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={11} /> 解封
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > pageSize && (
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <span className="text-sm text-zinc-500">
            {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} / {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.04] text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-sm text-zinc-500">
              {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.04] text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
