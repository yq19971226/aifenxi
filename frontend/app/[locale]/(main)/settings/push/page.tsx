"use client";

import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";
import {
  fetchPushSettings,
  updatePushSettings,
  testPush,
  type PushSettings,
  type PushChannel,
} from "@/lib/api/push";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { useAuth } from "@/lib/auth-context";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// ── Constants ────────────────────────────────────────────────

interface ChannelMeta {
  key: PushChannel;
  label: string;
  description: string;
  icon: string;
}

const USER_CHANNEL_KEYS: PushChannel[] = ["email"];
const ADMIN_CHANNEL_KEYS: PushChannel[] = ["email", "telegram"];
const CHANNEL_ICONS: Record<PushChannel, string> = { email: "✉", telegram: "📨", websocket: "" };

interface EventMeta {
  key: keyof PushSettings["events"];
  label: string;
  description: string;
}

const EVENT_KEYS: (keyof PushSettings["events"])[] = [
  "strategy_update", "price_alert", "playbook_switch",
  "risk_warning", "defense_alert", "high_confidence_signal", "strategy_settlement",
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
  const t = useTranslations('settings.push');
  const queryClient = useQueryClient();
  const { getState } = useFeatureFlags();
  const { user } = useAuth();
  const pushFeatureState = getState("push");
  const isAdmin = user?.role === "admin";
  const channelKeys = isAdmin ? ADMIN_CHANNEL_KEYS : USER_CHANNEL_KEYS;

  const { data: settings, isLoading } = useQuery({
    queryKey: ["pushSettings"],
    queryFn: fetchPushSettings,
    enabled: pushFeatureState === "active",
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

  if (pushFeatureState !== "active") {
    return <MaintenancePlaceholder featureName={t('title')} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-1 max-w-md">
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
        <h1 className="text-xl font-semibold text-zinc-200">{t('title')}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t('subtitle')}
        </p>
      </div>

      {/* Channels */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">{t('channels.title')}</h2>
        <div className="grid gap-4 sm:grid-cols-1 max-w-md">
          {channelKeys.map((chKey) => {
            const cfg = current.channels[chKey];
            const isTesting = testingChannel === chKey;
            return (
              <div
                key={chKey}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CHANNEL_ICONS[chKey]}</span>
                    <span className="text-sm font-medium text-zinc-200">
                      {t(`channels.${chKey}.label`)}
                    </span>
                  </div>
                  <ToggleSwitch
                    enabled={cfg.enabled}
                    onToggle={() => toggleChannel(chKey)}
                    disabled={mutation.isPending}
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-500">{t(`channels.${chKey}.description`)}</p>
                {cfg.enabled && (
                  <button
                    onClick={() => handleTest(chKey)}
                    disabled={isTesting}
                    className="mt-3 w-full rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {isTesting ? t('channels.testButtonSending') : t('channels.testButton')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Events */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">{t('events.title')}</h2>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06]">
          {EVENT_KEYS.map((evKey) => {
            const enabled = current.events[evKey];
            return (
              <div
                key={evKey}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{t(`events.${evKey}.label`)}</p>
                  <p className="text-sm text-zinc-500">{t(`events.${evKey}.description`)}</p>
                </div>
                <ToggleSwitch
                  enabled={enabled}
                  onToggle={() => toggleEvent(evKey)}
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
          {t('status.saving')}
        </div>
      )}
      {mutation.isError && (
        <p className="text-xs text-bear">
          {t('status.saveFailed')}: {(mutation.error as Error).message}
        </p>
      )}
      {testMutation.isSuccess && (
        <p className="text-xs text-bull">
          {t('status.testSent')}
        </p>
      )}
      {testMutation.isError && (
        <p className="text-xs text-bear">
          {t('status.testFailed')}: {(testMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
