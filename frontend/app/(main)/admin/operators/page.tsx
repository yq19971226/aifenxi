"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getOperators,
  createOperator,
  activateOperator,
  deactivateOperator,
  type OperatorInfo,
} from "@/lib/api/operators";
import { EmptyOperators } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth-context";

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

export default function OperatorsPage() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return null;
  const [operators, setOperators] = useState<OperatorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // toggling state — track which operator id is being toggled
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchOperators = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOperators();
      setOperators(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "获取运营员列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (password.length < 8) {
        setFormError("密码长度至少 8 位");
        return;
      }

      setCreating(true);
      try {
        await createOperator({ email: email.trim(), password });
        setEmail("");
        setPassword("");
        await fetchOperators();
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : "创建运营员失败");
      } finally {
        setCreating(false);
      }
    },
    [email, password, fetchOperators],
  );

  const handleToggle = useCallback(
    async (op: OperatorInfo) => {
      setTogglingId(op.id);
      try {
        if (op.is_active) {
          await deactivateOperator(op.id);
        } else {
          await activateOperator(op.id);
        }
        await fetchOperators();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "操作失败");
      } finally {
        setTogglingId(null);
      }
    },
    [fetchOperators],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Title */}
      <motion.h1
        className="text-lg font-semibold text-zinc-200"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        运营员管理
      </motion.h1>

      {/* ── Create Form ─────────────────────────────────── */}
      <motion.form
        onSubmit={handleCreate}
        className="card-surface rounded-lg p-5 flex flex-wrap items-end gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <label htmlFor="op-email" className="text-xs text-zinc-400">
            邮箱
          </label>
          <input
            id="op-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operator@example.com"
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-[180px] flex-1">
          <label htmlFor="op-password" className="text-xs text-zinc-400">
            初始密码（至少 8 位）
          </label>
          <input
            id="op-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-accent transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={creating}
          className="h-9 px-5 rounded-lg bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 transition-colors shrink-0"
        >
          {creating ? "创建中…" : "创建运营员"}
        </button>

        <AnimatePresence>
          {formError && (
            <motion.p
              className="w-full text-xs text-bear"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {formError}
            </motion.p>
          )}
        </AnimatePresence>
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

      {/* ── Operator List ────────────────────────────────── */}
      {!loading && !error && (
        <motion.div
          className="card-surface rounded-lg overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {operators.length === 0 ? (
            <EmptyOperators />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
                  <th className="px-5 py-3 font-medium">邮箱</th>
                  <th className="px-5 py-3 font-medium">创建时间</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((op) => (
                  <tr
                    key={op.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3 text-white">{op.email}</td>
                    <td className="px-5 py-3 text-zinc-400">
                      {formatDate(op.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      {op.is_active ? (
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
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleToggle(op)}
                        disabled={togglingId === op.id}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          op.is_active
                            ? "bg-[var(--color-bear)]/15 text-bear hover:bg-[var(--color-bear)]/25"
                            : "bg-[var(--color-bull)]/15 text-bull hover:bg-[var(--color-bull)]/25"
                        }`}
                      >
                        {togglingId === op.id
                          ? "处理中…"
                          : op.is_active
                            ? "停用"
                            : "启用"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>
      )}
    </div>
  );
}
