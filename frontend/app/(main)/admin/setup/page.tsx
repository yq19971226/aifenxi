"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, ToggleLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/api/auth";

type FeatureState = "active" | "maintenance" | "hidden";

interface FeatureItem {
  key: string;
  configKey: string;
  label: string;
  desc: string;
}

const FEATURES: FeatureItem[] = [
  { key: "playbook", configKey: "playbook_feature_enabled", label: "剧本推演", desc: "/playbook-sim — AI对抗剧本推演系统" },
  { key: "leaderboard", configKey: "leaderboard_feature_enabled", label: "排行榜", desc: "/leaderboard — 策略排行榜" },
  { key: "task", configKey: "task_feature_enabled", label: "任务中心", desc: "/tasks — 推广任务系统" },
  { key: "partner", configKey: "partner_feature_enabled", label: "合伙人", desc: "/partner — 合伙人推荐系统" },
];

const STATE_OPTIONS: { value: FeatureState; label: string; color: string }[] = [
  { value: "active", label: "开启", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  { value: "maintenance", label: "维护中", color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
  { value: "hidden", label: "隐藏", color: "text-zinc-400 bg-zinc-500/15 border-zinc-500/30" },
];

async function fetchFlags(): Promise<Record<string, string>> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
  const res = await authFetch(`${API_BASE}/api/feature-flags`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function updateFlag(configKey: string, value: string): Promise<void> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
  const res = await authFetch(`${API_BASE}/api/admin/configs/${configKey}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, description: `功能开关: ${configKey}`, is_secret: false }),
  });
  if (!res.ok) {
    // If config doesn't exist yet, create it
    const createRes = await authFetch(`${API_BASE}/api/admin/configs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_key: configKey,
        value,
        category: "feature_flags",
        description: `功能开关: ${configKey}`,
        is_secret: false,
      }),
    });
    if (!createRes.ok) throw new Error("Failed to save");
  }
}

export default function AdminSetupPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: flags = {}, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFlags,
  });

  const mutation = useMutation({
    mutationFn: ({ configKey, value }: { configKey: string; value: string }) =>
      updateFlag(configKey, value),
    onMutate: ({ configKey }) => setSaving(configKey),
    onSettled: () => {
      setSaving(null);
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
  });

  function getState(key: string): FeatureState {
    const v = String(flags[key] ?? "active").toLowerCase();
    if (v === "true") return "active";
    if (v === "false") return "hidden";
    if (v === "active" || v === "maintenance" || v === "hidden") return v;
    return "active";
  }

  if (!user || (user.role !== "admin" && user.role !== "operator")) {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-500">无权限访问</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-8 space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Settings size={20} className="text-zinc-400" />
          系统设置
        </h1>
        <p className="mt-1 text-sm text-zinc-500">管理功能开关与系统配置</p>
      </div>

      {/* Feature Toggles */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ToggleLeft size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-200">功能开关</h2>
        </div>
        <p className="text-xs text-zinc-500">
          控制前台功能的可见性。「开启」正常显示，「维护中」显示维护页面，「隐藏」完全不可见。
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-zinc-500 text-sm">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        ) : (
          <div className="space-y-3">
            {FEATURES.map((feat) => {
              const current = getState(feat.key);
              const isSaving = saving === feat.configKey;
              return (
                <div
                  key={feat.key}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200">{feat.label}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{feat.desc}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {STATE_OPTIONS.map((opt) => {
                        const selected = current === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={isSaving}
                            onClick={() => {
                              if (!selected) {
                                mutation.mutate({ configKey: feat.configKey, value: opt.value });
                              }
                            }}
                            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                              selected
                                ? opt.color
                                : "text-zinc-600 bg-transparent border-white/[0.06] hover:text-zinc-400 hover:border-white/[0.1]"
                            } ${isSaving ? "opacity-50 cursor-wait" : ""}`}
                          >
                            {isSaving && selected ? (
                              <Loader2 size={12} className="animate-spin inline mr-1" />
                            ) : null}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
