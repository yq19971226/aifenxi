import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface SystemConfig {
  id: string;
  config_key: string;
  value: string;
  category: string;
  description: string;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConfigCreate {
  config_key: string;
  value: string;
  category: string;
  description?: string;
  is_secret?: boolean;
}

export interface ConfigUpdate {
  value: string;
  description?: string | null;
  is_secret?: boolean | null;
}

export interface AuditLogEntry {
  id: string;
  admin_user_id: string;
  config_key: string;
  action: string;
  old_value_masked: string | null;
  new_value_masked: string | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  size: number;
}

// ── API calls ────────────────────────────────────────────────

export async function fetchConfigs(
  category?: string
): Promise<SystemConfig[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : "";
  const res = await authFetch(`${API_BASE}/api/admin/configs${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取配置列表失败" }));
    throw new Error(err.detail || "获取配置列表失败");
  }
  return res.json();
}

export async function fetchConfigDetail(
  key: string
): Promise<SystemConfig> {
  const res = await authFetch(
    `${API_BASE}/api/admin/configs/${encodeURIComponent(key)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取配置详情失败" }));
    throw new Error(err.detail || "获取配置详情失败");
  }
  return res.json();
}

export async function createConfig(
  data: ConfigCreate
): Promise<SystemConfig> {
  const res = await authFetch(`${API_BASE}/api/admin/configs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "创建配置失败" }));
    throw new Error(err.detail || "创建配置失败");
  }
  return res.json();
}

export async function updateConfig(
  key: string,
  data: ConfigUpdate
): Promise<SystemConfig> {
  const res = await authFetch(
    `${API_BASE}/api/admin/configs/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "更新配置失败" }));
    throw new Error(err.detail || "更新配置失败");
  }
  return res.json();
}

export async function deleteConfig(key: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/api/admin/configs/${encodeURIComponent(key)}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "删除配置失败" }));
    throw new Error(err.detail || "删除配置失败");
  }
}

export async function fetchAuditLogs(
  page?: number,
  size?: number
): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  if (size !== undefined) params.set("size", String(size));
  const qs = params.toString();
  const res = await authFetch(
    `${API_BASE}/api/admin/configs/audit-log${qs ? `?${qs}` : ""}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取审计日志失败" }));
    throw new Error(err.detail || "获取审计日志失败");
  }
  return res.json();
}

export async function testConnection(
  configKey: string,
  apiKey: string
): Promise<{ success: boolean; message: string; status_code?: number }> {
  const res = await authFetch(`${API_BASE}/api/admin/configs/test-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config_key: configKey,
      api_key: apiKey,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "测试连接失败" }));
    throw new Error(err.detail || "测试连接失败");
  }
  return res.json();
}

export const configsApi = {
  fetchConfigs,
  fetchConfigDetail,
  createConfig,
  updateConfig,
  deleteConfig,
  fetchAuditLogs,
  testConnection,
};
