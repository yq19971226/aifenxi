"use client";

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/api/auth";
import type { ShareCardConfig } from "@/components/analysis/ShareCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function fetchShareCardConfig(): Promise<ShareCardConfig> {
  const res = await authFetch(`${API_BASE}/api/share-card-config`);
  if (!res.ok) {
    return { brandLevel: 1, brandName: "AXIOM", domain: "", description: "AI 策略分析平台" };
  }
  const data = await res.json();
  return {
    brandLevel: (data.brand_level ?? 1) as 1 | 2 | 3,
    brandName: data.brand_name ?? "AXIOM",
    domain: data.domain ?? "",
    description: data.description ?? "AI 策略分析平台",
  };
}

export function useShareCardConfig() {
  return useQuery<ShareCardConfig>({
    queryKey: ["share-card-config"],
    queryFn: fetchShareCardConfig,
    staleTime: 300_000,
  });
}
