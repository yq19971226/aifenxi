"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useDateFormatter } from "@/lib/i18n/formatters";
import type { AlertRuleResponse, ConditionExpression, Condition, MetricType, Operator } from "@/lib/api/alerts";
import { EmptyAlertRules } from "@/components/ui/EmptyState";

interface AlertRuleListProps {
  rules: AlertRuleResponse[];
  onEdit: (rule: AlertRuleResponse) => void;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onDelete: (ruleId: string) => void;
}

function useAlertTranslations() {
  const t = useTranslations('alerts');
  
  const METRIC_LABELS: Record<MetricType, string> = {
    price: t('metrics.price'),
    rsi: t('metrics.rsi'),
    macd: t('metrics.macd'),
    ema: t('metrics.ema'),
    bb_upper: t('metrics.bb_upper'),
    bb_lower: t('metrics.bb_lower'),
    exchange_netflow: t('metrics.exchange_netflow'),
    whale_change_24h: t('metrics.whale_change_24h'),
    fear_greed_index: t('metrics.fear_greed_index'),
    mvrv: t('metrics.mvrv'),
    funding_rate: t('metrics.funding_rate'),
  };

  const OPERATOR_LABELS: Record<Operator, string> = {
    gt: t('operatorsShort.gt'),
    lt: t('operatorsShort.lt'),
    gte: t('operatorsShort.gte'),
    lte: t('operatorsShort.lte'),
    cross_above: t('operatorsShort.cross_above'),
    cross_below: t('operatorsShort.cross_below'),
  };

  const CHANNEL_LABELS: Record<string, string> = {
    websocket: t('channels.websocketShort'),
    telegram: t('channels.telegramShort'),
    email: t('channels.emailShort'),
  };
  
  const formatCondition = (cond: Condition): string => {
    const metric = METRIC_LABELS[cond.metric] || cond.metric;
    const op = OPERATOR_LABELS[cond.operator] || cond.operator;
    return `${metric} ${op} ${cond.threshold}`;
  };

  const summarizeExpression = (expr: ConditionExpression): string => {
    const parts = expr.conditions.map(formatCondition);
    const joiner = expr.logic === "and" ? ` ${t('logic.andShort')} ` : ` ${t('logic.orShort')} `;
    let summary = parts.join(joiner);
    if (expr.sub_groups.length > 0) {
      const subSummaries = expr.sub_groups.map((sg) => `(${summarizeExpression(sg)})`);
      summary = [summary, ...subSummaries].join(joiner);
    }
    return summary;
  };
  
  return { METRIC_LABELS, OPERATOR_LABELS, CHANNEL_LABELS, formatCondition, summarizeExpression, t };
}

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-[var(--color-accent)]" : "bg-white/[0.1]"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          enabled ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function DeleteConfirmDialog({
  ruleName,
  onConfirm,
  onCancel,
}: {
  ruleName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('alerts.delete');
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="card rounded-lg p-6 max-w-sm w-full mx-4 space-y-4"
      >
        <p className="text-sm text-zinc-200">
          {t('confirmMessage', { name: ruleName })}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {t('cancelButton')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-lg bg-[var(--color-bear)] text-white text-sm font-medium hover:bg-[var(--color-bear)]/80 transition-colors"
          >
            {t('confirmButton')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RuleCard({
  rule,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: AlertRuleResponse;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { CHANNEL_LABELS, summarizeExpression, t } = useAlertTranslations();
  const { formatDateTime } = useDateFormatter();
  const conditionSummary = summarizeExpression(rule.expression);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`card rounded-lg p-4 transition-opacity ${
        rule.enabled ? "" : "opacity-50"
      }`}
    >
      {/* Header: name + symbol + toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-white truncate">{rule.name}</span>
          <span className="shrink-0 px-2 py-0.5 rounded bg-[var(--color-accent)]/15 text-accent text-xs font-mono">
            {rule.symbol}
          </span>
        </div>
        <ToggleSwitch enabled={rule.enabled} onToggle={onToggle} />
      </div>

      {/* Condition summary */}
      <p className="mt-2 text-xs text-zinc-400 leading-relaxed line-clamp-2">
        {conditionSummary}
      </p>

      {/* Footer: channels, last triggered, actions */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Notify channels */}
          <div className="flex items-center gap-1">
            {rule.notify_channels.map((ch) => (
              <span
                key={ch}
                className="px-1.5 py-0.5 rounded bg-white/[0.06] text-xs text-zinc-500"
              >
                {CHANNEL_LABELS[ch] || ch}
              </span>
            ))}
          </div>
          {/* Last triggered */}
          <span className="text-xs text-zinc-500">
            {rule.last_triggered_at
              ? `${t('list.lastTriggered')}: ${formatDateTime(rule.last_triggered_at)}`
              : t('list.neverTriggered')}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-accent hover:bg-[var(--color-accent)]/10 transition-colors"
            aria-label={`${t('actions.edit')} ${rule.name}`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M10.08 1.92a1.5 1.5 0 0 1 2.12 2.12L5.13 11.1l-2.83.71.71-2.83L10.08 1.92Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-bear hover:bg-[var(--color-bear)]/10 transition-colors"
            aria-label={`${t('actions.delete')} ${rule.name}`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 3.5h10M5 3.5V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M11 3.5l-.5 8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11.5L3 3.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function AlertRuleList({ rules, onEdit, onToggle, onDelete }: AlertRuleListProps) {
  const [deleteTarget, setDeleteTarget] = useState<AlertRuleResponse | null>(null);

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      onDelete(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDelete]);

  if (rules.length === 0) {
    return (
      <div className="card rounded-lg">
        <EmptyAlertRules />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => onEdit(rule)}
              onToggle={() => onToggle(rule.id, !rule.enabled)}
              onDelete={() => setDeleteTarget(rule)}
            />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmDialog
            ruleName={deleteTarget.name}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
