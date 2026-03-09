import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export type DataSourceStatus = "enabled" | "disabled" | "error" | "stale";

export interface ExchangeStatusItem {
  source_id: string;
  name: string;
  enabled: boolean;
  status: DataSourceStatus;
  weight: number;
}

export interface PrimarySourceStatusItem {
  source_id: string;
  name: string;
  domain: string;
  owner: string;
  enabled: boolean;
  status: DataSourceStatus;
  ready_count: number;
  target_count: number;
  detail: string;
}

export interface DataSourceStatusSnapshot {
  combo_enabled: boolean;
  exchanges: ExchangeStatusItem[];
  completeness_score: number;
  primary_sources: PrimarySourceStatusItem[];
  domain_completeness: number;
  missing_domains: string[];
  coinglass_enabled: boolean;
  coinglass_tier: string;
  coingecko_enabled: boolean;
  coingecko_tier: string;
}

export interface OperationResult {
  success: boolean;
  message: string;
  source_id?: string;
  completeness_score?: number;
  errors: string[];
}

export interface HealthStatus {
  source_id: string;
  connected: boolean;
  status: DataSourceStatus;
  last_message_at: string | null;
  message_rate: number;
  reconnect_count: number;
  error_count: number;
  circuit_breaker_state: "closed" | "open" | "half_open";
  checked_at: string;
}

export interface HealthSummary {
  sources: Record<string, HealthStatus>;
  overall_healthy: boolean;
  completeness_score: number;
  checked_at: string;
}

export interface DataSourceDetail {
  source_id: string;
  name: string;
  source_type: string;
  base_url: string;
  channels: string[];
  subscribed_channels: string[];
  auth_method: string;
  status: DataSourceStatus;
  enabled: boolean;
  weight: number;
  health: Record<string, unknown> | null;
}

export interface RateHistoryPoint {
  minute_ts: number;
  rate: number;
}

export interface SourceMetrics {
  source_id: string;
  current_message_rate: number;
  last_message_at: string | null;
  reconnect_count: number;
  error_count: number;
  circuit_breaker_state: string;
  rate_history: RateHistoryPoint[];
}

export interface CollectorSourceInfo {
  source_id: string;
  name: string;
  enabled: boolean;
  source_type: string;
  auth_method: string;
  channels: string[];
}

export interface CollectorGroup {
  group_id: string;
  name: string;
  group_type: string;
  enabled: boolean;
  sources: CollectorSourceInfo[];
}

// ── 公开 API ─────────────────────────────────────────────────

export async function getDataSourceStatus(): Promise<DataSourceStatusSnapshot> {
  const res = await fetch(`${API_BASE}/api/datasources/status`);
  return handleApiResponse(res, "获取数据源状态失败");
}

// ── 管理员 API ───────────────────────────────────────────────

export async function listDataSourceGroups(): Promise<{
  groups: CollectorGroup[];
  completeness_score: number;
}> {
  const res = await authFetch(`${API_BASE}/api/admin/datasources`);
  return handleApiResponse(res, "获取数据源列表失败");
}

export async function getDataSourceHealth(): Promise<HealthSummary> {
  const res = await authFetch(`${API_BASE}/api/admin/datasources/health`);
  return handleApiResponse(res, "获取健康状态失败");
}

export async function getDataSourceDetail(
  sourceId: string
): Promise<DataSourceDetail> {
  const res = await authFetch(
    `${API_BASE}/api/admin/datasources/${encodeURIComponent(sourceId)}`
  );
  return handleApiResponse(res, "获取数据源详情失败");
}

export async function toggleCombo(enabled: boolean): Promise<OperationResult> {
  const res = await authFetch(`${API_BASE}/api/admin/datasources/combo/toggle`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return handleApiResponse(res, "操作失败");
}

export async function toggleExchange(
  sourceId: string,
  enabled: boolean
): Promise<OperationResult> {
  const res = await authFetch(
    `${API_BASE}/api/admin/datasources/combo/exchanges/${encodeURIComponent(sourceId)}/toggle`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }
  );
  return handleApiResponse(res, "操作失败");
}

export async function toggleCoinGlass(
  enabled: boolean
): Promise<OperationResult> {
  const res = await authFetch(
    `${API_BASE}/api/admin/datasources/coinglass/toggle`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }
  );
  return handleApiResponse(res, "操作失败");
}

export async function toggleCoinGecko(
  enabled: boolean
): Promise<OperationResult> {
  const res = await authFetch(
    `${API_BASE}/api/admin/datasources/coingecko/toggle`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }
  );
  return handleApiResponse(res, "操作失败");
}

export async function getCoinGeckoUsage(): Promise<{
  tier: string;
  used: number;
  limit: number;
  remaining: number;
  usage_pct: number;
}> {
  const res = await authFetch(`${API_BASE}/api/coingecko/usage`);
  return handleApiResponse(res, "获取额度失败");
}

export async function updateCoinGeckoTier(
  tier: string
): Promise<{ tier: string; message: string }> {
  const res = await authFetch(`${API_BASE}/api/coingecko/tier`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  return handleApiResponse(res, "切换套餐失败");
}

export async function getSourceMetrics(
  sourceId: string
): Promise<SourceMetrics> {
  const res = await authFetch(
    `${API_BASE}/api/admin/datasources/${encodeURIComponent(sourceId)}/metrics`
  );
  return handleApiResponse(res, "获取指标失败");
}

export async function toggleGroup(
  groupId: string,
  enabled: boolean
): Promise<OperationResult> {
  const res = await authFetch(
    `${API_BASE}/api/admin/datasources/group/${encodeURIComponent(groupId)}/toggle`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }
  );
  return handleApiResponse(res, "操作失败");
}

export async function toggleCollector(
  groupId: string,
  sourceId: string,
  enabled: boolean
): Promise<OperationResult> {
  const res = await authFetch(
    `${API_BASE}/api/admin/datasources/group/${encodeURIComponent(groupId)}/${encodeURIComponent(sourceId)}/toggle`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }
  );
  return handleApiResponse(res, "操作失败");
}

export async function testDatasourceConnection(
  sourceId: string
): Promise<OperationResult> {
  const res = await authFetch(
    `${API_BASE}/api/admin/datasources/${encodeURIComponent(sourceId)}/test`,
    { method: "POST" }
  );
  return handleApiResponse(res, "测试失败");
}

export const datasourcesApi = {
  getDataSourceStatus,
  listDataSourceGroups,
  getDataSourceHealth,
  getDataSourceDetail,
  toggleCombo,
  toggleExchange,
  toggleCoinGlass,
  toggleCoinGecko,
  getCoinGeckoUsage,
  updateCoinGeckoTier,
  toggleGroup,
  toggleCollector,
  getSourceMetrics,
  testDatasourceConnection,
};
