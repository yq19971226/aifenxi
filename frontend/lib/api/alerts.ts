import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Enums ────────────────────────────────────────────────────

export type MetricType =
  | "price"
  | "rsi"
  | "macd"
  | "ema"
  | "bb_upper"
  | "bb_lower"
  | "exchange_netflow"
  | "whale_change_24h"
  | "fear_greed_index"
  | "mvrv"
  | "funding_rate";

export type Operator =
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "cross_above"
  | "cross_below";

export type LogicGroup = "and" | "or";

// ── Types ────────────────────────────────────────────────────

export interface Condition {
  metric: MetricType;
  operator: Operator;
  threshold: number;
}

export interface ConditionExpression {
  logic: LogicGroup;
  conditions: Condition[];
  sub_groups: ConditionExpression[];
}

export interface AlertRuleCreate {
  name: string;
  symbol: string;
  expression: ConditionExpression;
  notify_channels: string[];
}

export interface AlertRuleUpdate {
  name?: string;
  expression?: ConditionExpression;
  enabled?: boolean;
  notify_channels?: string[];
}

export interface AlertRuleResponse {
  id: string;
  name: string;
  symbol: string;
  expression: ConditionExpression;
  enabled: boolean;
  notify_channels: string[];
  last_triggered_at: string | null;
  created_at: string;
}

export interface AlertTriggerResponse {
  id: string;
  rule_id: string;
  rule_name: string;
  triggered_value: number;
  metric_type: string;
  notify_channel: string;
  notify_status: string;
  triggered_at: string;
}

// ── API calls ────────────────────────────────────────────────

export async function createRule(
  rule: AlertRuleCreate
): Promise<AlertRuleResponse> {
  const res = await authFetch(`${API_BASE}/api/alerts/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  return handleApiResponse(res, "创建预警规则失败");
}

export async function listRules(): Promise<AlertRuleResponse[]> {
  const res = await authFetch(`${API_BASE}/api/alerts/rules`);
  return handleApiResponse(res, "获取预警规则失败");
}

export async function updateRule(
  ruleId: string,
  update: AlertRuleUpdate
): Promise<AlertRuleResponse> {
  const res = await authFetch(`${API_BASE}/api/alerts/rules/${ruleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  return handleApiResponse(res, "更新预警规则失败");
}

export async function deleteRule(ruleId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/alerts/rules/${ruleId}`, {
    method: "DELETE",
  });
  await handleApiResponse<void>(res, "删除预警规则失败");
}

export async function listTriggers(
  limit: number = 100
): Promise<AlertTriggerResponse[]> {
  const res = await authFetch(`${API_BASE}/api/alerts/triggers?limit=${limit}`);
  return handleApiResponse(res, "获取触发历史失败");
}

export const alertsApi = {
  createRule,
  listRules,
  updateRule,
  deleteRule,
  listTriggers,
};
