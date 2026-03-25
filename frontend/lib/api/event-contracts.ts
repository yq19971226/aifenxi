import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface EventPrediction {
  direction: "up" | "down" | null;
  strength: number;
  primary_score: number;
  secondary_score: number;
  signals: string[];
}

export interface EventLiveSignal {
  status: "online" | "offline" | "warming_up";
  message?: string;
  symbol?: string;
  current_price?: number;
  prediction?: EventPrediction;
  updated_at?: string;
}

export interface EventHistoryRecord {
  id: number;
  round_num: number;
  direction: "up" | "down" | null;
  strength: number;
  entry_price: number;
  settle_price: number | null;
  result: "win" | "lose" | null;
  status: "pending" | "skipped" | "settled";
  predict_time: string;
  expire_time: string;
  settled_at: string | null;
  signals: EventPrediction | null;
}

export interface EventHistoryResponse {
  symbol: string;
  total: number;
  page: number;
  page_size: number;
  records: EventHistoryRecord[];
}

export interface EventStatsPeriod {
  total: number;
  wins: number;
  losses: number;
  skipped: number;
  decided: number;
  win_rate: number;
}

export interface EventStatsResponse {
  symbol: string;
  today: EventStatsPeriod;
  "7d": EventStatsPeriod;
  "30d": EventStatsPeriod;
  all_time: EventStatsPeriod;
}

// ── API Calls ────────────────────────────────────────────────

export async function fetchEventLive(): Promise<EventLiveSignal> {
  const res = await authFetch(`${API_BASE}/api/event-contracts/live`);
  return handleApiResponse(res, "获取实时信号失败");
}

export async function fetchEventHistory(
  symbol = "ETHUSDT",
  page = 1,
  pageSize = 20
): Promise<EventHistoryResponse> {
  const res = await authFetch(
    `${API_BASE}/api/event-contracts/history?symbol=${encodeURIComponent(symbol)}&page=${page}&page_size=${pageSize}`
  );
  return handleApiResponse(res, "获取历史记录失败");
}

export async function fetchEventStats(
  symbol = "ETHUSDT"
): Promise<EventStatsResponse> {
  const res = await authFetch(
    `${API_BASE}/api/event-contracts/stats?symbol=${encodeURIComponent(symbol)}`
  );
  return handleApiResponse(res, "获取统计数据失败");
}

// ── Admin API ────────────────────────────────────────────────

export interface EventPredictorStatus {
  running: boolean;
  symbol?: string;
  aggregator_running?: boolean;
  current_metrics?: Record<string, unknown>;
}

export async function fetchPredictorStatus(): Promise<EventPredictorStatus> {
  const res = await authFetch(`${API_BASE}/api/event-contracts/status`);
  return handleApiResponse(res, "获取预测器状态失败");
}

export async function startPredictor(symbol = "ETHUSDT"): Promise<{ status: string; symbol: string }> {
  const res = await authFetch(
    `${API_BASE}/api/event-contracts/start?symbol=${encodeURIComponent(symbol)}`,
    { method: "POST" }
  );
  return handleApiResponse(res, "启动预测器失败");
}

export async function stopPredictor(): Promise<{ status: string }> {
  const res = await authFetch(`${API_BASE}/api/event-contracts/stop`, { method: "POST" });
  return handleApiResponse(res, "停止预测器失败");
}
