"use client";

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth";

export type FeatureState = "active" | "maintenance" | "hidden";

export type FeatureFlags = Record<string, FeatureState>;

const FEATURE_FLAG_MAP: Record<string, string> = {
  "/playbook-sim": "playbook",
  "/leaderboard": "leaderboard",
  "/tasks": "task",
  "/partner": "partner",
};

async function fetchFeatureFlags(): Promise<FeatureFlags> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
  const res = await authFetch(`${API_BASE}/api/feature-flags`);
  if (!res.ok) return {};
  const data = await res.json();
  const flags: FeatureFlags = {};
  for (const [key, val] of Object.entries(data)) {
    const v = String(val).toLowerCase();
    // 兼容旧的 true/false
    if (v === "true") flags[key] = "active";
    else if (v === "false") flags[key] = "hidden";
    else if (v === "active" || v === "maintenance" || v === "hidden") flags[key] = v;
    else flags[key] = "active";
  }
  return flags;
}

export function useFeatureFlags() {
  const { data: flags = {}, isLoading } = useQuery<FeatureFlags>({
    queryKey: ["feature-flags"],
    queryFn: fetchFeatureFlags,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  function getState(key: string): FeatureState {
    return flags[key] ?? "active";
  }

  function getStateByPath(path: string): FeatureState {
    const flagKey = FEATURE_FLAG_MAP[path];
    if (!flagKey) return "active";
    return getState(flagKey);
  }

  return { flags, isLoading, getState, getStateByPath };
}
