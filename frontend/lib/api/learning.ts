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

export interface TrendPoint {
  date: string;
  win_rate: number;
  cumulative_pnl: number;
}

export interface ModeWinRate {
  mode: string;
  total: number;
  wins: number;
  win_rate: number;
}

export interface ChangelogMarker {
  id: string;
  param_type: string;
  param_key: string;
  old_value: string;
  new_value: string;
  changed_by: string;
  changed_at: string | null;
  note: string;
}

/** @deprecated Playbook feature removed — backend always returns []. */
export interface PlaybookWinRate {
  playbook_name: string;
  market_structure_type?: string | null;
  total: number;
  completed: number;
  avg_accuracy: number;
}

/** @deprecated Playbook feature removed — backend always returns []. */
export interface StructureWinRate {
  market_structure_type?: string | null;
  total: number;
  completed: number;
  playbook_count: number;
  avg_accuracy: number;
}

export interface PerformanceReview {
  stats: PerformanceStats;
  trend: TrendPoint[];
  signal_distribution: { long: number; short: number };
  mode_win_rates: ModeWinRate[];
  changelog_markers: ChangelogMarker[];
  playbook_win_rates: PlaybookWinRate[];
  structure_win_rates: StructureWinRate[];
}

export interface ModelDetail {
  direction_accuracy: number;
  calibration_score: number;
  magnitude_score: number;
  composite_score: number;
  sample_count: number;
}

export interface WeightsPreview {
  lookback_days: number;
  current_weights: Record<string, number>;
  new_weights: Record<string, number>;
  model_details: Record<string, ModelDetail>;
}

export interface CalibrationParams {
  signal_threshold: number;
  min_agreement: number;
  min_confidence: number;
  recommended: {
    signal_threshold: { min: number; max: number; default: number };
    min_agreement: { min: number; max: number; default: number };
    min_confidence: { min: number; max: number; default: number };
  };
}

export interface DbTableStat {
  table: string;
  row_count: number;
  error?: string;
}

export interface CleanupResult {
  retain_days: number;
  deleted: Record<string, number>;
}

// ── API calls ────────────────────────────────────────────────

const handleResponse = handleApiResponse;

export async function fetchPerformanceReview(
  days: number = 30,
  symbol?: string
): Promise<PerformanceReview> {
  const params = new URLSearchParams({ days: String(days) });
  if (symbol) params.set("symbol", symbol);
  const res = await authFetch(
    `${API_BASE}/api/admin/learning/performance-review?${params}`
  );
  return handleResponse(res, "获取绩效回顾失败");
}

export async function recalculateWeights(
  lookbackDays: number = 30
): Promise<WeightsPreview> {
  const res = await authFetch(
    `${API_BASE}/api/admin/learning/recalculate-weights?lookback_days=${lookbackDays}`,
    { method: "POST" }
  );
  return handleResponse(res, "计算权重失败");
}

export async function applyWeights(
  weights: Record<string, number>,
  note: string = ""
): Promise<{ status: string; weights: Record<string, number> }> {
  const res = await authFetch(`${API_BASE}/api/admin/learning/apply-weights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weights, note }),
  });
  return handleResponse(res, "应用权重失败");
}

export async function fetchCurrentWeights(): Promise<{
  weights: Record<string, number>;
}> {
  const res = await authFetch(
    `${API_BASE}/api/admin/learning/current-weights`
  );
  return handleResponse(res, "获取权重失败");
}

export async function fetchCalibrationParams(): Promise<CalibrationParams> {
  const res = await authFetch(
    `${API_BASE}/api/admin/learning/calibration-params`
  );
  return handleResponse(res, "获取校准参数失败");
}

export async function updateCalibrationParams(params: {
  signal_threshold?: number;
  min_agreement?: number;
  min_confidence?: number;
}): Promise<{ status: string; params: Record<string, string> }> {
  const res = await authFetch(
    `${API_BASE}/api/admin/learning/calibration-params`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  );
  return handleResponse(res, "更新校准参数失败");
}

export async function fetchDbStats(): Promise<DbTableStat[]> {
  const res = await authFetch(`${API_BASE}/api/admin/learning/db-stats`);
  return handleResponse(res, "获取DB统计失败");
}

export async function cleanupOldData(
  retainDays: number = 90
): Promise<CleanupResult> {
  const res = await authFetch(`${API_BASE}/api/admin/learning/cleanup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retain_days: retainDays }),
  });
  return handleResponse(res, "清理数据失败");
}
