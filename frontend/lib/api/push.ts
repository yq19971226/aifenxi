import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export type PushChannel = "email" | "telegram" | "websocket";

export interface PushChannelConfig {
  enabled: boolean;
}

export interface PushEventConfig {
  strategy_update: boolean;
  price_alert: boolean;
  playbook_switch: boolean;
  risk_warning: boolean;
  defense_alert: boolean;
  high_confidence_signal: boolean;
  strategy_settlement: boolean;
}

export interface PushSettings {
  channels: Record<PushChannel, PushChannelConfig>;
  events: PushEventConfig;
}

export interface TestPushResult {
  success: boolean;
  message: string;
}

// ── API calls ────────────────────────────────────────────────

export async function fetchPushSettings(): Promise<PushSettings> {
  const res = await authFetch(`${API_BASE}/api/push/settings`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取推送设置失败" }));
    throw new Error(err.detail || "获取推送设置失败");
  }
  return res.json();
}

export async function updatePushSettings(
  settings: PushSettings
): Promise<PushSettings> {
  const res = await authFetch(`${API_BASE}/api/push/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "更新推送设置失败" }));
    throw new Error(err.detail || "更新推送设置失败");
  }
  return res.json();
}

export async function testPush(channel: PushChannel): Promise<TestPushResult> {
  const res = await authFetch(`${API_BASE}/api/push/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "测试推送失败" }));
    throw new Error(err.detail || "测试推送失败");
  }
  return res.json();
}
