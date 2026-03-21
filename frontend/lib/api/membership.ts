import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

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
  return handleApiResponse(res, "获取体验状态失败");
}

export async function claimFreeTrial(): Promise<FreeTrialStatus> {
  const res = await authFetch(`${API_BASE}/api/membership/free-trial/claim`, {
    method: "POST",
  });
  return handleApiResponse(res, "领取体验失败");
}

export async function fetchPlans(): Promise<PlansResponse> {
  const res = await authFetch(`${API_BASE}/api/membership/plans`);
  return handleApiResponse(res, "获取套餐信息失败");
}

// ── 积分包（动态，从后台配置读取）─────────────────────────────

export interface CreditPack {
  plan: number;      // 3=S, 4=M, 5=L
  label: string;     // "积分包 S"
  price: number;     // USD
  credits: number;   // 次数
  mode: string;      // scalping | intraday | trend | all
  description: string;
}

export async function fetchCreditPacks(): Promise<CreditPack[]> {
  // /api/membership/credit-packs 是无需鉴权的公共端点
  const res = await fetch(`${API_BASE}/api/membership/credit-packs`);
  return handleApiResponse(res, "获取积分包信息失败");
}
