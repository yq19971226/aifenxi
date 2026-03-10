"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Bell, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/api/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const STATE_OPTIONS = [
  { value: "active", labelKey: "states.active", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  { value: "maintenance", labelKey: "states.maintenance", color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
  { value: "hidden", labelKey: "states.hidden", color: "text-zinc-400 bg-zinc-500/15 border-zinc-500/30" },
] as const;

export default function AdminPushPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("admin.push");

  const fetchFlags = async (): Promise<Record<string, string>> => {
    const res = await authFetch(`${API_BASE}/api/feature-flags`);
    if (!res.ok) throw new Error(t("errors.fetchFailed"));
    return res.json();
  };

  const updateFlag = async (configKey: string, value: string): Promise<void> => {
    const res = await authFetch(`${API_BASE}/api/admin/configs/${configKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, description: t("featureFlagDescription", { configKey }), is_secret: false }),
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
          description: t("featureFlagDescription", { configKey }),
          is_secret: false,
        }),
      });
      if (!createRes.ok) throw new Error(`${t("errors.createFailed")} (${createRes.status})`);
      return;
    }
    throw new Error(`${t("errors.saveFailed")} (${res.status})`);
  };

  const { data: flags = {}, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFlags,
  });

  const mutation = useMutation({
    mutationFn: ({ value }: { value: string }) =>
      updateFlag("push_feature_enabled", value),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
  });

  if (!user || user.role !== "admin") {
    return <div className="p-6"><p className="text-sm text-zinc-500">{t("noPermission")}</p></div>;
  }

  const raw = String(flags["push"] ?? "active").toLowerCase();
  const current = raw === "true" ? "active" : raw === "false" ? "hidden" : (raw as string);
  const isActive = current === "active";

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-8 space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Bell size={20} className="text-zinc-400" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isActive ? (
                  <ToggleRight size={24} className="text-emerald-400" />
                ) : (
                  <ToggleLeft size={24} className="text-zinc-500" />
                )}
                <div>
                  <div className="text-sm font-medium text-zinc-200">{t("toggle.label")}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{t("toggle.hint")}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {STATE_OPTIONS.map((opt) => {
                  const selected = current === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => {
                        if (!selected) mutation.mutate({ value: opt.value });
                      }}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                        selected
                          ? opt.color
                          : "text-zinc-600 bg-transparent border-white/[0.06] hover:text-zinc-400 hover:border-white/[0.1]"
                      } ${mutation.isPending ? "opacity-50 cursor-wait" : ""}`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-200">{t("statusSection.title")}</h2>
            <div className="space-y-2 text-xs text-zinc-500">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span><strong className="text-zinc-300">{t("states.active")}</strong> — {t("statusSection.activeDesc")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span><strong className="text-zinc-300">{t("states.maintenance")}</strong> — {t("statusSection.maintenanceDesc")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-zinc-500" />
                <span><strong className="text-zinc-300">{t("states.hidden")}</strong> — {t("statusSection.hiddenDesc")}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
