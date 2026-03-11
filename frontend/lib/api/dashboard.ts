import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface SymbolOverview {
  symbol: string;
  display_name: string;
  latest_price: number | null;
  direction: string; // long / short / neutral
  confidence: number;
  alert_level: string; // none / low / medium / high / critical
  dealer_intent: string;
  collusion_detected: boolean;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss: number | null;
  reasoning: string;
  targets: number[];
  risk_reward_ratio: number;
  is_worth_taking: boolean;
  strategy_updated_at: string | null;
}

export interface DashboardOverviewResponse {
  symbols: SymbolOverview[];
  total: number;
  /** 剩余配额（可选，overview 接口未返回时显示 0） */
  credits_remaining?: number;
  /** 近期分析报告（可选，供看板展示） */
  recent_reports?: unknown[];
}

export async function fetchDashboardOverview(): Promise<DashboardOverviewResponse> {
  const res = await authFetch(`${API_BASE}/api/dashboard/overview`);
  return handleApiResponse(res, "请求失败");
}

export interface SignalEvent {
  symbol: string;
  type: string; // direction_change / confidence_drop / confidence_rise / opportunity / risk_alert
  message: string;
  detail: string;
  timestamp: string;
}

export interface DashboardSignalsResponse {
  signals: SignalEvent[];
  total: number;
}

export async function fetchDashboardSignals(limit = 20): Promise<DashboardSignalsResponse> {
  const res = await authFetch(`${API_BASE}/api/dashboard/signals?limit=${limit}`);
  return handleApiResponse(res, "请求失败");
}
