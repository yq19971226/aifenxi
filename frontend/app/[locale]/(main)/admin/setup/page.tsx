"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Settings, ToggleLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/api/auth";

type FeatureState = "active" | "maintenance" | "hidden";

interface FeatureItem {
  key: "playbook" | "leaderboard" | "task" | "partner" | "push" | "alerts" | "online_count";
  configKey: string;
}

const FEATURES: FeatureItem[] = [
  { key: "playbook", configKey: "playbook_feature_enabled" },
  { key: "leaderboard", configKey: "leaderboard_feature_enabled" },
  { key: "task", configKey: "task_feature_enabled" },
  { key: "partner", configKey: "partner_feature_enabled" },
  { key: "push", configKey: "push_feature_enabled" },
  { key: "alerts", configKey: "alerts_feature_enabled" },
  { key: "online_count", configKey: "online_count_feature_enabled" },
];

const STATE_OPTIONS: { value: FeatureState; color: string }[] = [
  { value: "active", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  { value: "maintenance", color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
  { value: "hidden", color: "text-zinc-400 bg-zinc-500/15 border-zinc-500/30" },
];

async function fetchFlags(): Promise<Record<string, string>> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
  const res = await authFetch(`${API_BASE}/api/feature-flags`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function updateFlag(
  configKey: string,
  value: string,
  description: string
): Promise<void> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
  const res = await authFetch(`${API_BASE}/api/admin/configs/${configKey}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, description, is_secret: false }),
  });
  if (res.ok) return;
  if (res.status === 404) {
    const createRes = await authFetch(`${API_BASE}/api/admin/configs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_key: configKey,
        value,
        category: "feature_flags",
        description,
        is_secret: false,
      }),
    });
    if (!createRes.ok) throw new Error(`CREATE_FAILED:${createRes.status}`);
    return;
  }
  throw new Error(`SAVE_FAILED:${res.status}`);
}

export default function AdminSetupPage() {
  const t = useTranslations("admin");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: flags = {}, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFlags,
  });

  const [saveError, setSaveError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({
      configKey,
      value,
      description,
    }: {
      configKey: string;
      value: string;
      description: string;
    }) => updateFlag(configKey, value, description),
    onMutate: ({ configKey }) => {
      setSaving(configKey);
      setSaveError(null);
    },
    onError: (err: Error) => setSaveError(err.message),
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

  function renderSaveError() {
    if (!saveError) return null;
    const [code, statusStr] = saveError.includes(":")
      ? saveError.split(":")
      : [saveError, undefined];
    const status = statusStr ? parseInt(statusStr, 10) : undefined;
    if (code === "CREATE_FAILED")
      return t("setup.errors.createFailed", { status: status ?? 0 });
    if (code === "SAVE_FAILED")
      return t("setup.errors.saveFailed", { status: status ?? 0 });
    return saveError;
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-500">{t("permissionDenied")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-8 space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Settings size={20} className="text-zinc-400" />
          {t("setup.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{t("setup.subtitle")}</p>
      </div>

      {/* Feature Toggles */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ToggleLeft size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-200">
            {t("setup.featureToggles")}
          </h2>
        </div>
        <p className="text-xs text-zinc-500">
          {t("setup.featureTogglesHint")}
        </p>

        {saveError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
            {renderSaveError()}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-zinc-500 text-sm">
            <Loader2 size={16} className="animate-spin" />
            {t("setup.loading")}
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
                      <div className="text-sm font-medium text-zinc-200">
                        {t(`setup.features.${feat.key}.label`)}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {t(`setup.features.${feat.key}.desc`)}
                      </div>
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
                                mutation.mutate({
                                  configKey: feat.configKey,
                                  value: opt.value,
                                  description: t("setup.configDescription", {
                                    configKey: feat.configKey,
                                  }),
                                });
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
                            {t(`setup.states.${opt.value}`)}
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
