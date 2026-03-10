"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Wrench, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/api/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface FeatureItem {
  key: string;
  configKey: string;
}

const FEATURES: FeatureItem[] = [
  { key: "playbook", configKey: "playbook_feature_enabled" },
  { key: "leaderboard", configKey: "leaderboard_feature_enabled" },
  { key: "task", configKey: "task_feature_enabled" },
  { key: "partner", configKey: "partner_feature_enabled" },
  { key: "push", configKey: "push_feature_enabled" },
  { key: "alerts", configKey: "alerts_feature_enabled" },
];

async function fetchFlags(): Promise<Record<string, string>> {
  const res = await authFetch(`${API_BASE}/api/feature-flags`);
  if (!res.ok) throw new Error("fetchFailed");
  return res.json();
}

async function updateFlag(configKey: string, value: string, description: string): Promise<void> {
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
    if (!createRes.ok) throw new Error("createFailed");
    return;
  }
  throw new Error("saveFailed");
}

function normalizeState(v: string): string {
  const low = String(v).toLowerCase();
  if (low === "true") return "active";
  if (low === "false") return "hidden";
  if (low === "active" || low === "maintenance" || low === "hidden") return low;
  return "active";
}

export default function AdminMaintenancePage() {
  const t = useTranslations("admin");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: flags = {}, isLoading, isError, error } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFlags,
  });

  const mutation = useMutation({
    mutationFn: ({ configKey, value, description }: { configKey: string; value: string; description: string }) =>
      updateFlag(configKey, value, description),
    onMutate: ({ configKey }) => setSaving(configKey),
    onSettled: () => {
      setSaving(null);
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
  });

  if (!user || user.role !== "admin") {
    return <div className="p-6"><p className="text-sm text-zinc-500">{t("permissionDenied")}</p></div>;
  }

  const maintenanceCount = FEATURES.filter((f) => normalizeState(flags[f.key] ?? "active") === "maintenance").length;
  const allMaintenance = maintenanceCount === FEATURES.length;

  const getErrorMessage = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return ["fetchFailed", "createFailed", "saveFailed"].includes(msg) ? t(`maintenance.errors.${msg}`) : msg;
  };

  const handleBatchToggle = async () => {
    const targetState = allMaintenance ? "active" : "maintenance";
    for (const feat of FEATURES) {
      await updateFlag(feat.configKey, targetState, t("maintenance.configDescription", { configKey: feat.configKey }));
    }
    queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-8 space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Wrench size={20} className="text-zinc-400" />
          {t("maintenance.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t("maintenance.subtitle")}
        </p>
      </div>

      {/* Global maintenance switch */}
      <div className={`card p-5 border ${maintenanceCount > 0 ? "border-amber-500/20" : "border-white/[0.06]"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {maintenanceCount > 0 ? (
              <AlertTriangle size={18} className="text-amber-400" />
            ) : (
              <CheckCircle2 size={18} className="text-emerald-400" />
            )}
            <div>
              <div className="text-sm font-medium text-zinc-200">
                {maintenanceCount > 0
                  ? t("maintenance.globalSwitch.maintenanceCount", { count: maintenanceCount })
                  : t("maintenance.globalSwitch.allRunning")}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {allMaintenance ? t("maintenance.globalSwitch.restoreHint") : t("maintenance.globalSwitch.maintenanceHint")}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBatchToggle}
            className={`rounded-md border px-4 py-2 text-xs font-medium transition-all ${
              allMaintenance
                ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25"
                : "text-amber-400 bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25"
            }`}
          >
            {allMaintenance ? t("maintenance.globalSwitch.restoreAll") : t("maintenance.globalSwitch.maintenanceAll")}
          </button>
        </div>
      </div>

      {/* Per-feature maintenance status */}
      {isError ? (
        <div className="flex items-center gap-2 py-8 justify-center text-amber-400 text-sm">
          <AlertTriangle size={16} />
          {getErrorMessage(error)}
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" />
          {t("maintenance.loading")}
        </div>
      ) : (
        <div className="space-y-3">
          {mutation.isError && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
              <AlertTriangle size={16} />
              {getErrorMessage(mutation.error)}
            </div>
          )}
          {FEATURES.map((feat) => {
            const state = normalizeState(flags[feat.key] ?? "active");
            const isMaint = state === "maintenance";
            const isSaving = saving === feat.configKey;
            return (
              <div
                key={feat.key}
                className={`rounded-lg border p-4 transition-colors ${
                  isMaint
                    ? "border-amber-500/20 bg-amber-500/[0.03]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${
                        state === "active" ? "bg-emerald-400" : state === "maintenance" ? "bg-amber-400" : "bg-zinc-500"
                      }`} />
                      <span className="text-sm font-medium text-zinc-200">{t(`maintenance.features.${feat.key}`)}</span>
                      <span className="text-xs text-zinc-500">{t(`maintenance.paths.${feat.key}`)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      const next = isMaint ? "active" : "maintenance";
                      mutation.mutate({
                        configKey: feat.configKey,
                        value: next,
                        description: t("maintenance.configDescription", { configKey: feat.configKey }),
                      });
                    }}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                      isMaint
                        ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25"
                        : "text-amber-400 bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25"
                    } ${isSaving ? "opacity-50 cursor-wait" : ""}`}
                  >
                    {isSaving ? (
                      <Loader2 size={12} className="animate-spin inline mr-1" />
                    ) : null}
                    {isMaint ? t("maintenance.restore") : t("maintenance.maintenance")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
