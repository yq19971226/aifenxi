import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export interface DashboardStats {
  total_users: number;
  new_users_today: number;
  new_users_7d: number;
  free_users: number;
  pro_users: number;
  flagship_users: number;
  total_revenue_usd: number;
  revenue_30d_usd: number;
  pending_payments: number;
  total_strategies: number;
  strategies_24h: number;
  total_consensus: number;
  consensus_24h: number;
  total_agent_reports: number;
  agent_reports_24h: number;
  total_alert_rules: number;
  active_alert_rules: number;
  online_ws_total: number;
  online_ws_price: number;
  online_ws_alerts: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await authFetch(`${API}/api/admin/dashboard`);
  return handleApiResponse(res, "获取仪表盘数据失败");
}


export interface LLMCostSummary {
  date: string;
  total_cost_usd: number;
  total_tokens: number;
  total_calls: number;
  by_model: Record<string, number>;
}

export async function fetchLLMCost(): Promise<LLMCostSummary> {
  const res = await authFetch(`${API}/api/admin/dashboard/llm-cost`);
  return handleApiResponse(res, "获取 LLM 成本数据失败");
}

export interface AdminBadges {
  playbookReview: number;
  taskReview: number;
  withdrawals: number;
}

export async function fetchAdminBadges(): Promise<AdminBadges> {
  const res = await authFetch(`${API}/api/admin/dashboard/badges`);
  return handleApiResponse(res, "获取后台徽标计数失败");
}
