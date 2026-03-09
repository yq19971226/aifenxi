/** 链上数据 API — 前端调用。 */

import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface OnchainDataPoint {
  time: string;
  value: number | null;
  unit: string;
}

export interface OnchainMetricResponse {
  symbol: string;
  metric: string;
  data: OnchainDataPoint | null;
  source: string;
}

export interface PlanCapabilities {
  plans: {
    "0": { name: string; symbols: string[]; metrics: string[] };
    "1": { name: string; symbols: string[]; metrics: string[] };
    "2": { name: string; symbols: string[]; metrics: string[] };
  };
  user_capabilities: {
    level: number;
    symbols: string[];
    metrics: string[];
  };
}

export async function fetchOnchainCapabilities(): Promise<PlanCapabilities> {
  const res = await authFetch(`${API_BASE}/api/onchain/capabilities`);
  return handleApiResponse(res, "获取能力失败");
}

export async function fetchOnchainData(
  symbol: string,
  metric: string = "price",
  interval: string = "h24"
): Promise<OnchainMetricResponse> {
  const params = new URLSearchParams({ metric, interval });
  const res = await authFetch(`${API_BASE}/api/onchain/${symbol}?${params}`);

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (data.error === "upgrade_required") {
      throw new Error(data.message);
    }
    throw new Error(data.detail || "获取链上数据失败");
  }

  return data;
}
