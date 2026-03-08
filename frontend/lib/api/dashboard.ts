import { authFetch } from "./auth";

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
  risk_reward_ratio: number;
  is_worth_taking: boolean;
}

export interface DashboardOverviewResponse {
  symbols: SymbolOverview[];
  total: number;
}

export async function fetchDashboardOverview(): Promise<DashboardOverviewResponse> {
  const res = await authFetch(`${API_BASE}/api/dashboard/overview`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
