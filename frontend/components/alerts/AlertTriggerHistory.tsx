"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useDateFormatter, useNumberFormatter } from "@/lib/i18n/formatters";
import type { AlertTriggerResponse } from "@/lib/api/alerts";
import { EmptyAlertHistory } from "@/components/ui/EmptyState";

interface AlertTriggerHistoryProps {
  triggers: AlertTriggerResponse[];
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('alerts.history.status');
  const isSent = status === "sent";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
        isSent
          ? "bg-[var(--color-bull)]/15 text-bull"
          : "bg-[var(--color-bear)]/15 text-bear"
      }`}
    >
      {isSent ? t('sent') : t('failed')}
    </span>
  );
}

function TriggerRow({ trigger, index }: { trigger: AlertTriggerResponse; index: number }) {
  const t = useTranslations('alerts');
  const { formatDateTime } = useDateFormatter();
  const { formatNumber } = useNumberFormatter();
  
  const METRIC_LABELS: Record<string, string> = {
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
  
  const metricLabel = METRIC_LABELS[trigger.metric_type] || trigger.metric_type;
  
  // Format triggered value - keep technical symbols unchanged
  const formatTriggeredValue = (value: string | number): string => {
    const numValue = typeof value === "number" ? value : parseFloat(value);
    if (!isNaN(numValue)) {
      return formatNumber(numValue, 2);
    }
    return String(value); // Keep non-numeric values as-is
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors"
    >
      {/* Rule name */}
      <span className="text-sm text-zinc-200 truncate min-w-[100px] max-w-[160px]">
        {trigger.rule_name}
      </span>

      {/* Metric type */}
      <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/[0.06] text-xs text-zinc-400">
        {metricLabel}
      </span>

      {/* Triggered value */}
      <span className="shrink-0 font-mono text-xs text-white">
        {formatTriggeredValue(trigger.triggered_value)}
      </span>

      {/* Channel */}
      <span className="shrink-0 text-xs text-zinc-500">
        {trigger.notify_channel}
      </span>

      {/* Status */}
      <StatusBadge status={trigger.notify_status} />

      {/* Time - pushed to the right */}
      <span className="ml-auto shrink-0 text-xs text-zinc-500 font-mono">
        {formatDateTime(trigger.triggered_at)}
      </span>
    </motion.div>
  );
}

export function AlertTriggerHistory({ triggers }: AlertTriggerHistoryProps) {
  const t = useTranslations('alerts.history');
  
  if (triggers.length === 0) {
    return (
      <div className="card rounded-lg">
        <EmptyAlertHistory />
      </div>
    );
  }

  return (
    <div className="card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <span className="text-sm text-zinc-500 min-w-[100px] max-w-[160px]">
          {t('table.ruleName')}
        </span>
        <span className="text-sm text-zinc-500">{t('table.metric')}</span>
        <span className="text-sm text-zinc-500">{t('table.triggeredValue')}</span>
        <span className="text-sm text-zinc-500">{t('table.channel')}</span>
        <span className="text-sm text-zinc-500">{t('table.status')}</span>
        <span className="ml-auto text-sm text-zinc-500">{t('table.time')}</span>
      </div>

      {/* Scrollable list */}
      <div className="max-h-[400px] overflow-y-auto">
        {triggers.map((trigger, i) => (
          <TriggerRow key={trigger.id} trigger={trigger} index={i} />
        ))}
      </div>
    </div>
  );
}
