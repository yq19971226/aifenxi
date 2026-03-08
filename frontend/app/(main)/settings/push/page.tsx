"use client";

import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchPushSettings,
  updatePushSettings,
  testPush,
  type PushSettings,
  type PushChannel,
} from "@/lib/api/push";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// ── Constants ────────────────────────────────────────────────

interface ChannelMeta {
  key: PushChannel;
  label: string;
  description: string;
  icon: string;
}

const CHANNELS: ChannelMeta[] = [
  { key: "email", label: "邮件推送", description: "通过 SendGrid 发送策略邮件", icon: "✉" },
  { key: "telegram", label: "Telegram", description: "通过 Bot 推送到 TG 群组", icon: "📨" },
  { key: "websocket", label: "WebSocket", description: "浏览器实时弹窗通知", icon: "" },
];

interface EventMeta {
  key: keyof PushSettings["events"];
  label: string;
  description: string;
}

const EVENTS: EventMeta[] = [
  { key: "strategy_update", label: "策略更新", description: "新策略生成或方向变化时通知" },
  { key: "price_alert", label: "价格预警", description: "触及关键支撑/阻力位时通知" },
  { key: "playbook_switch", label: "剧本切换", description: "庄家操盘剧本发生变化时通知" },
  { key: "risk_warning", label: "风险预警", description: "链上异常信号触发时通知" },
  { key: "defense_alert", label: "防御预警", description: "庄家AI推演/合谋检测触发中等以上警报时通知" },
  { key: "high_confidence_signal", label: "高置信信号", description: "分析置信度超过70%时推送信号方向" },
  { key: "strategy_settlement", label: "策略结算", description: "策略触达止损/目标/超时结算时通知" },
];

const DEFAULT_SETTINGS: PushSettings = {
  channels: {
    email: { enabled: false },
    telegram: { enabled: false },
    websocket: { enabled: true },
  },
  events: {
    strategy_update: true,
    price_alert: true,
    playbook_switch: false,
    risk_warning: true,
    defense_alert: true,
    high_confidence_signal: true,
    strategy_settlement: true,
  },
};

// ── Toggle Switch ────────────────────────────────────────────

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function ToggleSwitch({ enabled, onToggle, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
        enabled ? "bg-[var(--color-accent)]" : "bg-white/[0.12]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

// ── Page ────────────────────────────────────────────────────

export default function PushSettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["pushSettings"],
    queryFn: fetchPushSettings,
  });

  const current = settings ?? DEFAULT_SETTINGS;

  const mutation = useMutation({
    mutationFn: updatePushSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["pushSettings"], data);
    },
  });

  const testMutation = useMutation({
    mutationFn: testPush,
  });

  const [testingChannel, setTestingChannel] = useState<PushChannel | null>(null);

  const toggleChannel = useCallback(
    (channel: PushChannel) => {
      const updated: PushSettings = {
        ...current,
        channels: {
          ...current.channels,
          [channel]: { ...current.channels[channel], enabled: !current.channels[channel].enabled },
        },
      };
      mutation.mutate(updated);
    },
    [current, mutation]
  );

  const toggleEvent = useCallback(
    (eventKey: keyof PushSettings["events"]) => {
      const updated: PushSettings = {
        ...current,
        events: {
          ...current.events,
          [eventKey]: !current.events[eventKey],
        },
      };
      mutation.mutate(updated);
    },
    [current, mutation]
  );

  const handleTest = useCallback(
    async (channel: PushChannel) => {
      setTestingChannel(channel);
      try {
        await testMutation.mutateAsync(channel);
      } finally {
        setTestingChannel(null);
      }
    },
    [testMutation]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-200">推送设置</h1>
        <p className="mt-1 text-sm text-zinc-500">
          管理推送渠道和事件订阅，自定义你的通知偏好
        </p>
      </div>

      {/* Channels */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">推送渠道</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {CHANNELS.map((ch) => {
            const cfg = current.channels[ch.key];
            const isTesting = testingChannel === ch.key;
            return (
              <div
                key={ch.key}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{ch.icon}</span>
                    <span className="text-sm font-medium text-zinc-200">
                      {ch.label}
                    </span>
                  </div>
                  <ToggleSwitch
                    enabled={cfg.enabled}
                    onToggle={() => toggleChannel(ch.key)}
                    disabled={mutation.isPending}
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-500">{ch.description}</p>
                {cfg.enabled && (
                  <button
                    onClick={() => handleTest(ch.key)}
                    disabled={isTesting}
                    className="mt-3 w-full rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {isTesting ? "发送中..." : "发送测试消息"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Events */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">事件订阅</h2>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06]">
          {EVENTS.map((ev) => {
            const enabled = current.events[ev.key];
            return (
              <div
                key={ev.key}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{ev.label}</p>
                  <p className="text-sm text-zinc-500">{ev.description}</p>
                </div>
                <ToggleSwitch
                  enabled={enabled}
                  onToggle={() => toggleEvent(ev.key)}
                  disabled={mutation.isPending}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Status */}
      {mutation.isPending && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent" />
          保存中...
        </div>
      )}
      {mutation.isError && (
        <p className="text-xs text-bear">
          保存失败: {(mutation.error as Error).message}
        </p>
      )}
      {testMutation.isSuccess && (
        <p className="text-xs text-bull">
          测试消息已发送
        </p>
      )}
      {testMutation.isError && (
        <p className="text-xs text-bear">
          测试失败: {(testMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
