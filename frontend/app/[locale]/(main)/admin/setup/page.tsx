"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Settings, ToggleLeft, Loader2, AlertTriangle, CheckCircle2, ClipboardList, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/api/auth";
import { fetchAuditLogs, type AuditLogEntry, type AuditLogPage } from "@/lib/api/configs";
import SetupWizard from "@/components/admin/SetupWizard";

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

const ACTION_STYLES: Record<string, { text: string; bg: string }> = {
  create: { text: "text-emerald-400", bg: "bg-emerald-500/10" },
  update: { text: "text-amber-400", bg: "bg-amber-500/10" },
  delete: { text: "text-red-400", bg: "bg-red-500/10" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSetupPage() {
  const t = useTranslations("admin");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  const { data: flags = {}, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFlags,
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

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

  // Batch maintenance logic (merged from maintenance page)
  const maintenanceCount = FEATURES.filter(
    (f) => getState(f.key) === "maintenance"
  ).length;
  const allMaintenance = maintenanceCount === FEATURES.length;

  const handleBatchToggle = async () => {
    setBatchLoading(true);
    const targetState = allMaintenance ? "active" : "maintenance";
    try {
      for (const feat of FEATURES) {
        await updateFlag(
          feat.configKey,
          targetState,
          t("setup.configDescription", { configKey: feat.configKey })
        );
      }
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    } finally {
      setBatchLoading(false);
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Settings size={20} className="text-zinc-400" />
            {t("setup.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{t("setup.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all text-xs font-medium"
        >
          <ClipboardList size={14} />
          {t('setup.wizard.title')}
        </button>
      </div>

      {/* Batch Maintenance Toggle (merged from maintenance page) */}
      <div
        className={`rounded-lg border p-5 transition-colors ${
          maintenanceCount > 0
            ? "border-amber-500/20 bg-amber-500/[0.03]"
            : "border-white/[0.06] bg-white/[0.02]"
        }`}
      >
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
                  ? t("maintenance.globalSwitch.maintenanceCount", {
                      count: maintenanceCount,
                    })
                  : t("maintenance.globalSwitch.allRunning")}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {allMaintenance
                  ? t("maintenance.globalSwitch.restoreHint")
                  : t("maintenance.globalSwitch.maintenanceHint")}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBatchToggle}
            disabled={batchLoading}
            className={`rounded-md border px-4 py-2 text-xs font-medium transition-all ${
              allMaintenance
                ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25"
                : "text-amber-400 bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25"
            } ${batchLoading ? "opacity-50 cursor-wait" : ""}`}
          >
            {batchLoading ? (
              <Loader2 size={12} className="animate-spin inline mr-1" />
            ) : null}
            {allMaintenance
              ? t("maintenance.globalSwitch.restoreAll")
              : t("maintenance.globalSwitch.maintenanceAll")}
          </button>
        </div>
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
                  className={`rounded-lg border p-4 transition-colors ${
                    current === "maintenance"
                      ? "border-amber-500/20 bg-amber-500/[0.03]"
                      : "border-white/[0.06] bg-white/[0.02]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            current === "active"
                              ? "bg-emerald-400"
                              : current === "maintenance"
                              ? "bg-amber-400"
                              : "bg-zinc-500"
                          }`}
                        />
                        <span className="text-sm font-medium text-zinc-200">
                          {t(`setup.features.${feat.key}.label`)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 ml-4">
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

      {/* Audit Logs */}
      <AuditLogSection />

      {/* Setup Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl">
            <SetupWizard onFinish={() => setShowWizard(false)} />
            <button 
              onClick={() => setShowWizard(false)}
              className="mt-4 mx-auto block text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              × 关闭向导
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditLogSection() {
  const t = useTranslations("admin.setup.auditLog");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<AuditLogPage>({
    queryKey: ["configAuditLogs", page],
    queryFn: () => fetchAuditLogs(page, 10),
    enabled: open,
  });

  const totalPages = data ? Math.ceil(data.total / data.size) : 0;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">
            {open ? t("openTitle") : t("title")}
          </h2>
        </div>
        {open ? <ChevronDown size={18} className="text-zinc-500" /> : <ChevronRight size={18} className="text-zinc-500" />}
      </button>

      {open && (
        <div className="border-t border-white/[0.06] p-5">
          {isLoading ? (
            <div className="flex justify-center py-6 text-zinc-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="pb-3 text-left text-xs font-medium text-zinc-400 min-w-32">{t("time")}</th>
                      <th className="pb-3 text-left text-xs font-medium text-zinc-400">{t("action")}</th>
                      <th className="pb-3 text-left text-xs font-medium text-zinc-400 min-w-32">{t("configKey")}</th>
                      <th className="pb-3 text-left text-xs font-medium text-zinc-400">{t("oldValue")}</th>
                      <th className="pb-3 text-left text-xs font-medium text-zinc-400">{t("newValue")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((log: AuditLogEntry) => {
                      const st = ACTION_STYLES[log.action] ?? ACTION_STYLES.update;
                      // 特殊处理 bool/状态 展现形式
                      let oldVal = log.old_value_masked ?? "—";
                      let newVal = log.new_value_masked ?? "—";
                      
                      return (
                        <tr key={log.id} className="border-b border-white/[0.04]">
                          <td className="py-3 font-mono text-xs text-zinc-400">
                            {formatDate(log.created_at)}
                          </td>
                          <td className="py-3">
                            <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${st.text} ${st.bg}`}>
                              {t(`actions.${log.action}`)}
                            </span>
                          </td>
                          <td className="py-3 text-xs font-mono text-zinc-300">
                            {log.config_key}
                          </td>
                          <td className="py-3 font-mono text-xs text-zinc-400">
                            {oldVal === "true" || oldVal === "active" ? "active" : oldVal}
                          </td>
                          <td className="py-3 font-mono text-xs text-emerald-400">
                            {newVal === "true" || newVal === "active" ? "active" : newVal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs text-zinc-400">
                  {t("pagination", { page, total: totalPages, count: data.total })}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded border border-white/[0.08] px-3 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    {t("prev")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded border border-white/[0.08] px-3 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-sm text-zinc-500">
              {t("empty")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
