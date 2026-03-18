import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface RankingEntry {
  rank: number;
  anonymous_id: string;
  settled: number;
  wins: number;
  losses: number;
  win_rate: number;      // 服务器端直接计算好的胜率（0~1）
  profit_factor: number;
  avg_pnl: number;
}

export interface RankingsResponse {
  rankings: RankingEntry[];
  total: number;
  my_rank: number | null;
  my_stats: RankingEntry | null;
}

export interface SystemReport {
  total_settled: number;
  total_wins?: number;
  win_rate: number;
  profit_factor: number;
}

export interface ModeAccuracy {
  mode: string;
  settled: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl: number;
}

export interface SystemAccuracyResponse {
  modes: ModeAccuracy[];
}

export interface MyStats {
  anonymous_id: string;
  total_published: number;
  pending: number;
  settled: number;
  wins: number;
  losses: number;
  avg_pnl: number;
  profit_factor: number;
}

export async function fetchRankings(
  period: string = "7d",
  mode: string = "all",
  page: number = 1,
): Promise<RankingsResponse> {
  const params = new URLSearchParams({ period, mode, page: String(page) });
  const res = await authFetch(`${API_BASE}/api/leaderboard/rankings?${params}`);
  return handleApiResponse(res, "排行榜加载失败");
}

export async function fetchSystemReport(
  period: string = "7d",
  mode: string = "all",
): Promise<SystemReport> {
  const params = new URLSearchParams({ period, mode });
  const res = await authFetch(
    `${API_BASE}/api/leaderboard/report?${params}`,
  );
  return handleApiResponse(res, "系统报告加载失败");
}

export async function fetchSystemAccuracy(
  period: string = "7d",
): Promise<SystemAccuracyResponse> {
  const params = new URLSearchParams({ period });
  const res = await authFetch(
    `${API_BASE}/api/leaderboard/system-accuracy?${params}`,
  );
  return handleApiResponse(res, "系统命中率加载失败");
}

export async function fetchMyStats(
  period: string = "7d",
  mode: string = "all",
): Promise<MyStats> {
  const params = new URLSearchParams({ period, mode });
  const res = await authFetch(
    `${API_BASE}/api/leaderboard/me?${params}`,
  );
  return handleApiResponse(res, "个人战绩加载失败");
}

export interface StrategyHistoryItem {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number | null;
  stop_loss: number | null;
  status: string;
  pnl_pct: number | null;
  analysis_mode: string | null;
  created_at: string;
}

export interface StrategyHistoryResponse {
  items: StrategyHistoryItem[];
  total: number;
}

export async function fetchMyHistory(
  period: string = "7d",
  mode: string = "all",
  page: number = 1,
): Promise<StrategyHistoryResponse> {
  const params = new URLSearchParams({ period, mode, page: String(page) });
  const res = await authFetch(
    `${API_BASE}/api/leaderboard/me/history?${params}`,
  );
  return handleApiResponse(res, "策略历史加载失败");
}
