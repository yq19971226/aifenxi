import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface PerformanceStats {
  total_strategies: number;
  settled_count: number;
  win_rate: number;
  avg_profit_pct: number;
  avg_loss_pct: number;
  profit_loss_ratio: number;
  sharpe_ratio: number;
  by_agent: Record<string, number>;
}

export interface SnapshotCheckpoint {
  snapshot_id: string;
  checkpoint_hours: number;
  actual_price: number;
  recorded_at: string;
}

export interface SnapshotDetail {
  snapshot: {
    id: string;
    strategy_id: string;
    symbol: string;
    direction: string;
    entry_low: number;
    entry_high: number;
    stop_loss: number;
    targets: number[];
    confidence: number;
    price_at_generation: number;
    status: string;
    settlement_price: number | null;
    settlement_time: string | null;
    pnl_pct: number | null;
    created_at: string;
  };
  checkpoints: SnapshotCheckpoint[];
}

export interface TrendDataPoint {
  date: string;
  win_rate: number;
  cumulative_pnl: number;
}

// ── API calls ────────────────────────────────────────────────

export async function getStats(
  symbol?: string,
  days: number = 30,
  direction?: string
): Promise<PerformanceStats> {
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol);
  params.set("days", String(days));
  if (direction) params.set("direction", direction);

  const res = await authFetch(
    `${API_BASE}/api/performance/stats?${params.toString()}`
  );
  return handleApiResponse(res, "获取绩效统计失败");
}

export async function getSnapshotDetail(
  snapshotId: string
): Promise<SnapshotDetail> {
  const res = await authFetch(
    `${API_BASE}/api/performance/snapshots/${encodeURIComponent(snapshotId)}`
  );
  return handleApiResponse(res, "获取快照详情失败");
}

export async function getTrend(
  days: number = 30
): Promise<TrendDataPoint[]> {
  const res = await authFetch(
    `${API_BASE}/api/performance/trend?days=${days}`
  );
  return handleApiResponse(res, "获取趋势数据失败");
}

export const performanceApi = {
  getStats,
  getSnapshotDetail,
  getTrend,
};
