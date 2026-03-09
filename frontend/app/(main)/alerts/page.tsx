"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { AlertRuleForm } from "@/components/alerts/AlertRuleForm";
import { AlertRuleList } from "@/components/alerts/AlertRuleList";
import { AlertTriggerHistory } from "@/components/alerts/AlertTriggerHistory";
import {
  alertsApi,
  type AlertRuleCreate,
  type AlertRuleUpdate,
  type AlertRuleResponse,
} from "@/lib/api/alerts";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";

// 会员等级 → 规则上限
const RULE_LIMITS: Record<number, number> = { 0: 3, 1: 20, 2: 100 };
const LEVEL_LABELS: Record<number, string> = { 0: "免费", 1: "专业", 2: "旗舰" };

type Tab = "rules" | "history";
type FormMode = { type: "create" } | { type: "edit"; rule: AlertRuleResponse };

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("rules");
  const [formMode, setFormMode] = useState<FormMode | null>(null);

  const { user } = useAuth();
  const membershipLevel = effectiveLevel(user);
  const ruleLimit = RULE_LIMITS[membershipLevel] ?? 3;
  const levelLabel = LEVEL_LABELS[membershipLevel] ?? "免费";

  // ── 数据查询 ──────────────────────────────────────────────
  const { data: rules = [] } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: alertsApi.listRules,
  });

  const { data: triggers = [] } = useQuery({
    queryKey: ["alert-triggers"],
    queryFn: () => alertsApi.listTriggers(100),
  });

  const usedCount = rules.length;
  const quotaPct = ruleLimit > 0 ? Math.min((usedCount / ruleLimit) * 100, 100) : 0;

  // ── Mutations ─────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (rule: AlertRuleCreate) => alertsApi.createRule(rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      setFormMode(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: AlertRuleUpdate }) =>
      alertsApi.updateRule(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      setFormMode(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      alertsApi.updateRule(ruleId, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => alertsApi.deleteRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      queryClient.invalidateQueries({ queryKey: ["alert-triggers"] });
    },
  });

  // ── 回调 ──────────────────────────────────────────────────
  const handleFormSubmit = useCallback(
    async (data: AlertRuleCreate | AlertRuleUpdate) => {
      if (formMode?.type === "edit") {
        await updateMutation.mutateAsync({ id: formMode.rule.id, update: data as AlertRuleUpdate });
      } else {
        await createMutation.mutateAsync(data as AlertRuleCreate);
      }
    },
    [formMode, createMutation, updateMutation]
  );

  const handleEdit = useCallback((rule: AlertRuleResponse) => {
    setFormMode({ type: "edit", rule });
    setTab("rules");
  }, []);

  const handleToggle = useCallback(
    (ruleId: string, enabled: boolean) => {
      toggleMutation.mutate({ ruleId, enabled });
    },
    [toggleMutation]
  );

  const handleDelete = useCallback(
    (ruleId: string) => {
      deleteMutation.mutate(ruleId);
    },
    [deleteMutation]
  );

  // ── 渲染 ──────────────────────────────────────────────────
  const isAtLimit = usedCount >= ruleLimit;
  const barColor = isAtLimit ? "bg-red-400" : "bg-emerald-400";

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 p-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.05]">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              <span className="flex h-3 w-3 rounded-full bg-indigo-500 animate-pulse"></span>
              预警管理
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              自定义监控条件，实时接收市场异动通知
            </p>
          </div>
          {tab === "rules" && !formMode && (
            <button
              type="button"
              onClick={() => setFormMode({ type: "create" })}
              disabled={isAtLimit}
              className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + 创建规则
            </button>
          )}
        </div>

        {/* 额度使用条 */}
        <div className="card rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              规则额度（{levelLabel}）
            </span>
            <span className="text-sm font-mono font-medium text-white">
              已使用 {usedCount}/{ruleLimit} 条规则
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${barColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${quotaPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          {isAtLimit && (
            <p className="mt-3 text-sm font-medium text-red-400 flex items-center gap-1.5">
              <span className="flex h-1.5 w-1.5 rounded-full bg-red-400"></span>
              已达当前等级上限，升级会员可创建更多规则
            </p>
          )}
        </div>

        {/* 表单区域 */}
        <AnimatePresence mode="wait">
          {formMode && (
            <AlertRuleForm
              key={formMode.type === "edit" ? `edit-${formMode.rule.id}` : "create"}
              mode={formMode.type}
              initialData={formMode.type === "edit" ? formMode.rule : undefined}
              onSubmit={handleFormSubmit}
              onCancel={() => setFormMode(null)}
            />
          )}
        </AnimatePresence>

        {/* Tab 切换 */}
        <div className="flex items-center gap-1 p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05] w-fit">
          {([
            { key: "rules" as Tab, label: "规则列表" },
            { key: "history" as Tab, label: "触发历史" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                tab === key
                  ? "bg-white/[0.06] text-indigo-400"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <AnimatePresence mode="wait">
          {tab === "rules" ? (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <AlertRuleList
                rules={rules}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <AlertTriggerHistory triggers={triggers} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
