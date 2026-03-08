"use client";

import { motion } from "framer-motion";
import type { AlertTriggerResponse } from "@/lib/api/alerts";
import { EmptyAlertHistory } from "@/components/ui/EmptyState";

interface AlertTriggerHistoryProps {
  triggers: AlertTriggerResponse[];
}

const METRIC_LABELS: Record<string, string> = {
  price: "价格",
  rsi: "RSI",
  macd: "MACD",
  ema: "EMA",
  bb_upper: "布林带上轨",
  bb_lower: "布林带下轨",
  exchange_netflow: "交易所净流入",
  whale_change_24h: "巨鲸持仓变化",
  fear_greed_index: "恐慌贪婪指数",
  mvrv: "MVRV",
  funding_rate: "资金费率",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const isSent = status === "sent";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
        isSent
          ? "bg-[var(--color-bull)]/15 text-bull"
          : "bg-[var(--color-bear)]/15 text-bear"
      }`}
    >
      {isSent ? "已发送" : "失败"}
    </span>
  );
}

function TriggerRow({ trigger, index }: { trigger: AlertTriggerResponse; index: number }) {
  const metricLabel = METRIC_LABELS[trigger.metric_type] || trigger.metric_type;

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
        {trigger.triggered_value}
      </span>

      {/* Channel */}
      <span className="shrink-0 text-xs text-zinc-500">
        {trigger.notify_channel}
      </span>

      {/* Status */}
      <StatusBadge status={trigger.notify_status} />

      {/* Time ?pushed to the right */}
      <span className="ml-auto shrink-0 text-xs text-zinc-500 font-mono">
        {formatTime(trigger.triggered_at)}
      </span>
    </motion.div>
  );
}

export function AlertTriggerHistory({ triggers }: AlertTriggerHistoryProps) {
  if (triggers.length === 0) {
    return (
      <div className="card rounded-xl">
        <EmptyAlertHistory />
      </div>
    );
  }

  return (
    <div className="card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <span className="text-sm text-zinc-500 min-w-[100px] max-w-[160px]">
          规则名称
        </span>
        <span className="text-sm text-zinc-500">指标</span>
        <span className="text-sm text-zinc-500">触发值</span>
        <span className="text-sm text-zinc-500">渠道</span>
        <span className="text-sm text-zinc-500">状态</span>
        <span className="ml-auto text-sm text-zinc-500">时间</span>
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
