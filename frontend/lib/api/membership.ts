import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface PlanDetail {
  plan: number;
  name: string;
  price_monthly: number;
  price_quarterly: number;
  price_yearly: number;
}

export interface PlanFeature {
  name: string;
  free: string;
  pro: string;
  flagship: string;
}

export interface PlansResponse {
  plans: PlanDetail[];
  features: PlanFeature[];
}

// ── API calls ────────────────────────────────────────────────

export interface FreeTrialStatus {
  enabled: boolean;
  total: number;
  claimed: boolean;
  remaining: number;
}

export async function fetchFreeTrialStatus(): Promise<FreeTrialStatus> {
  const res = await authFetch(`${API_BASE}/api/membership/free-trial`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取体验状态失败" }));
    throw new Error(err.detail || "获取体验状态失败");
  }
  return res.json();
}

export async function claimFreeTrial(): Promise<FreeTrialStatus> {
  const res = await authFetch(`${API_BASE}/api/membership/free-trial/claim`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "领取体验失败" }));
    throw new Error(err.detail || "领取体验失败");
  }
  return res.json();
}

export async function fetchPlans(): Promise<PlansResponse> {
  const res = await authFetch(`${API_BASE}/api/membership/plans`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取套餐信息失败" }));
    throw new Error(err.detail || "获取套餐信息失败");
  }
  return res.json();
}
