import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface SymbolConfig {
  symbol: string;
  display_name: string;
  collect_interval_sec: number;
  enabled: boolean;
  has_onchain: boolean;
  has_derivatives: boolean;
  error_count: number;
}

export interface SymbolUpdateRequest {
  enabled?: boolean;
  collect_interval_sec?: number;
  has_onchain?: boolean;
  has_derivatives?: boolean;
}

export interface SymbolCreateRequest {
  symbol: string;
  display_name: string;
  collect_interval_sec?: number;
  enabled?: boolean;
  has_onchain?: boolean;
  has_derivatives?: boolean;
}

export interface KlineIntervalProgress {
  interval: string;
  kline_count: number;
  kline_ttl: number;
  kline_age_sec: number | null;
  kline_fresh: boolean;
  indicator: "EXISTS" | "MISSING";
  indicator_ttl: number;
  indicator_age_sec: number | null;
  indicator_fresh: boolean;
  stale_threshold_sec: number;
  linked_ready: boolean;
  missing_kline: boolean;
  missing_indicator: boolean;
  stale_kline: boolean;
  stale_indicator: boolean;
  expired: boolean;
  expired_reasons: string[];
}

export interface SymbolKlineProgress {
  symbol: string;
  latest_price: string | null;
  ready_intervals: number;
  total_intervals: number;
  progress_pct: number;
  intervals: KlineIntervalProgress[];
}

export interface KlineProgressResponse {
  running: boolean;
  scheduler: {
    last_collect_at: string | null;
    rounds_completed: number;
    last_total: number;
    last_failed: number;
    last_elapsed_s: number;
  };
  requested_symbols: string[];
  requested_intervals: string[];
  progress_pct: number;
  ready_slots: number;
  total_slots: number;
  symbols: SymbolKlineProgress[];
}

// ── API calls ────────────────────────────────────────────────

export async function listAllSymbols(): Promise<SymbolConfig[]> {
  const res = await authFetch(`${API_BASE}/api/symbols/admin/all`);
  return handleApiResponse(res, "获取交易对列表失败");
}

export async function addSymbol(data: SymbolCreateRequest): Promise<SymbolConfig> {
  const res = await authFetch(`${API_BASE}/api/symbols/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleApiResponse(res, "添加交易对失败");
}

export async function updateSymbol(
  symbol: string,
  data: SymbolUpdateRequest
): Promise<SymbolConfig> {
  const res = await authFetch(`${API_BASE}/api/symbols/${symbol}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleApiResponse(res, "更新交易对失败");
}

export async function deleteSymbol(symbol: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/symbols/${symbol}`, {
    method: "DELETE",
  });
  await handleApiResponse<void>(res, "删除交易对失败");
}

export async function fetchKlineProgress(
  symbols: string[],
  intervals: string[] = ["5m", "15m", "1h", "4h", "1d", "1w"],
): Promise<KlineProgressResponse> {
  const symbolParam = symbols.join(",");
  const intervalParam = intervals.join(",");
  const url = `${API_BASE}/api/system/kline-progress?symbols=${encodeURIComponent(symbolParam)}&intervals=${encodeURIComponent(intervalParam)}`;

  const res = await authFetch(url);
  return handleApiResponse(res, "获取K线进度失败");
}
