import { authFetch } from "./auth";

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
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await authFetch(`${API}/api/admin/dashboard`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(body.detail ?? "获取仪表盘数据失败");
  }
  return res.json();
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(body.detail ?? "获取 LLM 成本数据失败");
  }
  return res.json();
}
