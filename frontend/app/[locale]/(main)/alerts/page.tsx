"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";

// 会员等级 → 规则上限
const RULE_LIMITS: Record<number, number> = { 0: 3, 1: 20, 2: 100 };
const LEVEL_KEYS: Record<number, string> = { 0: "free", 1: "pro", 2: "flagship" };

type Tab = "rules" | "history";
type FormMode = { type: "create" } | { type: "edit"; rule: AlertRuleResponse };

export default function AlertsPage() {
  const t = useTranslations('alerts');
  const { getState } = useFeatureFlags();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("rules");
  const [formMode, setFormMode] = useState<FormMode | null>(null);

  const { user } = useAuth();
  const membershipLevel = effectiveLevel(user);
  const ruleLimit = RULE_LIMITS[membershipLevel] ?? 3;
  const levelKey = LEVEL_KEYS[membershipLevel] ?? "free";
  const levelLabel = t(`levels.${levelKey}`);

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

  const isAtLimit = usedCount >= ruleLimit;
  const barColor = isAtLimit ? "bg-red-400" : "bg-emerald-400";

  if (getState("alerts") !== "active") {
    return <MaintenancePlaceholder featureName={t('title')} />;
  }

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <span className="flex h-3 w-3 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.5)]"></span>
              {t('title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium text-zinc-400">
              {t('subtitle')}
            </p>
          </div>
          {tab === "rules" && !formMode && (
            <button
              type="button"
              onClick={() => setFormMode({ type: "create" })}
              disabled={isAtLimit}
              className="btn-primary text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('createButton')}
            </button>
          )}
        </div>

        <div className="bg-bg-surface border border-border shadow-inner rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold font-mono uppercase tracking-widest text-zinc-400">
              {t('quota.label', { level: levelLabel })}
            </span>
            <span className="text-sm font-mono font-bold text-white tracking-tight">
              {t('quota.used', { used: usedCount, limit: ruleLimit })}
            </span>
          </div>
          <div className="h-2 rounded-full bg-bg-elevated border border-border overflow-hidden shadow-inner">
            <motion.div
              className={`h-full rounded-full ${barColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${quotaPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          {isAtLimit && (
            <p className="mt-4 text-[10px] font-bold font-mono uppercase tracking-widest text-red-400 flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"></span>
              {t('quota.limitReached')}
            </p>
          )}
        </div>

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

        <div className="flex items-center gap-1 p-1.5 rounded-xl bg-bg-surface shadow-inner border border-border w-fit">
          {([
            { key: "rules" as Tab, tabKey: "rules" },
            { key: "history" as Tab, tabKey: "history" },
          ]).map(({ key, tabKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-6 py-2 rounded-lg text-sm font-bold tracking-wide transition-all duration-300 ${
                tab === key
                  ? "bg-bg-elevated text-indigo-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-bg-elevated/50"
              }`}
            >
              {t(`tabs.${tabKey}`)}
            </button>
          ))}
        </div>

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
