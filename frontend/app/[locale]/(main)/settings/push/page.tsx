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
  "strategy_update", "price_alert",
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
      className={`relative inline-flex h-4 w-10 items-center justify-between border transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 ${
        enabled ? "bg-indigo-500/20 border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]" : "bg-black border-zinc-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      style={{
         clipPath: 'polygon(10% 0, 100% 0, 100% 90%, 90% 100%, 0 100%, 0 10%)'
      }}
    >
      <span
        className={`inline-block h-3 w-3 transform bg-white transition-transform duration-300 ${
          enabled ? "translate-x-[24px] shadow-[0_0_8px_rgba(255,255,255,0.8)]" : "translate-x-[2px] opacity-40"
        }`}
        style={{
           clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)'
        }}
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
    <div className="flex flex-col gap-10 p-6 max-w-4xl mx-auto min-h-screen">
      {/* Header */}
      <div className="border-b border-white/[0.05] pb-6">
        <h1 className="text-2xl font-black text-white font-mono tracking-widest uppercase mb-2">{t('title')}</h1>
        <p className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-[0.3em]">
          {t('subtitle')}
        </p>
      </div>

      {/* Channels */}
      <section>
        <h2 className="mb-6 text-[11px] font-black text-zinc-600 font-mono uppercase tracking-[0.3em] pl-1 relative">
           <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3 bg-indigo-500"></span>
           <span className="ml-3">{t('channels.title')}</span>
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {channelKeys.map((chKey) => {
            const cfg = current.channels[chKey];
            const isTesting = testingChannel === chKey;
            return (
              <div
                key={chKey}
                className="relative bg-black border border-white/[0.05] p-5 lg:p-6 overflow-hidden transition-all duration-300 hover:border-white/[0.15] hover:bg-white/[0.02]"
              >
                <div className={`absolute top-0 right-0 w-8 h-[1px] ${cfg.enabled ? 'bg-indigo-500/50' : 'bg-white/[0.2]'}`} />
                <div className={`absolute bottom-0 left-0 w-8 h-[1px] ${cfg.enabled ? 'bg-indigo-500/50' : 'bg-white/[0.2]'}`} />
                
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center justify-center w-8 h-8 ${cfg.enabled ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-400' : 'bg-white/[0.02] border border-white/[0.05] text-zinc-500'} transition-colors`}>{CHANNEL_ICONS[chKey] || <span className="font-mono text-xs font-black tracking-widest uppercase">WS</span>}</span>
                    <span className={`text-[11px] font-black font-mono tracking-[0.2em] uppercase ${cfg.enabled ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]' : 'text-zinc-400'} transition-colors`}>
                      {t(`channels.${chKey}.label`)}
                    </span>
                  </div>
                  <ToggleSwitch
                    enabled={cfg.enabled}
                    onToggle={() => toggleChannel(chKey)}
                    disabled={mutation.isPending}
                  />
                </div>
                <p className="text-[10px] font-mono text-zinc-500 leading-relaxed uppercase tracking-widest">{t(`channels.${chKey}.description`)}</p>
                {cfg.enabled && (
                  <button
                    onClick={() => handleTest(chKey)}
                    disabled={isTesting}
                    className="mt-6 w-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-[9px] font-black font-mono uppercase tracking-[0.3em] text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all duration-300 disabled:opacity-40 disabled:hover:bg-indigo-500/10 disabled:hover:text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)] active:scale-[0.98]"
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
         <h2 className="mb-6 text-[11px] font-black text-zinc-600 font-mono uppercase tracking-[0.3em] pl-1 relative">
           <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3 bg-zinc-400"></span>
           <span className="ml-3">{t('events.title')}</span>
        </h2>
        <div className="bg-black border border-white/[0.05]">
          {EVENT_KEYS.map((evKey, idx) => {
            const enabled = current.events[evKey];
            return (
              <div
                key={evKey}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 transition-colors hover:bg-white/[0.02] ${idx !== EVENT_KEYS.length - 1 ? 'border-b border-white/[0.05]' : ''}`}
              >
                <div className="mb-4 sm:mb-0 pr-4">
                  <p className={`text-[11px] font-black font-mono uppercase tracking-[0.2em] mb-1.5 transition-colors ${enabled ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]' : 'text-zinc-400'}`}>{t(`events.${evKey}.label`)}</p>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest max-w-xl">{t(`events.${evKey}.description`)}</p>
                </div>
                <div className="shrink-0">
                   <ToggleSwitch
                     enabled={enabled}
                     onToggle={() => toggleEvent(evKey)}
                     disabled={mutation.isPending}
                   />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Status */}
      <div className="flex flex-col gap-2 relative mt-4">
        {mutation.isPending && (
          <div className="flex items-center gap-3 text-[10px] font-black font-mono uppercase tracking-[0.2em] text-zinc-500 bg-white/[0.02] border border-white/[0.05] px-4 py-2 w-fit">
            <span className="h-2 w-2 animate-ping rounded-full bg-zinc-400" />
            {t('status.saving')}
          </div>
        )}
        {mutation.isError && (
          <p className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-red-500 bg-red-500/10 border border-red-500/20 px-4 py-2 w-fit">
            {t('status.saveFailed')}: {(mutation.error as Error).message}
          </p>
        )}
        {testMutation.isSuccess && (
          <p className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 w-fit">
            {t('status.testSent')}
          </p>
        )}
        {testMutation.isError && (
          <p className="text-[10px] font-black font-mono uppercase tracking-[0.2em] text-red-500 bg-red-500/10 border border-red-500/20 px-4 py-2 w-fit">
            {t('status.testFailed')}: {(testMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
