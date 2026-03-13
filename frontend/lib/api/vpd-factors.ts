import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API = process.env.NEXT_PUBLIC_API_URL || "";

/* ── 因子权重 ─────────────────────────────────────────────── */

export interface VpdFactor {
  factor_id: string;
  factor_name: string;
  description: string;
  weight: number;
  default_weight: number;
}

export interface VpdFactorsResponse {
  factors: VpdFactor[];
  total_weight: number;
  source: string;
}

export async function fetchVpdFactors(): Promise<VpdFactorsResponse> {
  const res = await authFetch(`${API}/api/admin/models/vpd-factors`);
  return handleApiResponse<VpdFactorsResponse>(res, "获取因子权重失败");
}

export async function updateVpdFactors(
  weights: Record<string, number>
): Promise<{ ok: boolean; message: string }> {
  const res = await authFetch(`${API}/api/admin/models/vpd-factors`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weights }),
  });
  return handleApiResponse(res, "更新因子权重失败");
}

export async function resetVpdFactors(): Promise<{ ok: boolean; message: string }> {
  const res = await authFetch(`${API}/api/admin/models/vpd-factors/reset`, {
    method: "POST",
  });
  return handleApiResponse(res, "重置因子权重失败");
}

/* ── 因子统计 ─────────────────────────────────────────────── */

export interface FactorStat {
  factor_id: string;
  active_count: number;
  hit_rate_1h: number;
  hit_rate_4h: number;
  avg_score: number;
}

export interface VpdStatsResponse {
  period_days: number;
  total_analyses: number;
  tracked_count: number;
  overall_hit_rate_1h: number;
  overall_hit_rate_4h: number;
  factor_stats: FactorStat[];
}

export async function fetchVpdStats(
  days = 7,
  symbol?: string,
  mode?: string
): Promise<VpdStatsResponse> {
  const params = new URLSearchParams({ days: String(days) });
  if (symbol) params.set("symbol", symbol);
  if (mode) params.set("mode", mode);
  const res = await authFetch(`${API}/api/admin/models/vpd-stats?${params}`);
  return handleApiResponse<VpdStatsResponse>(res, "获取因子统计失败");
}

/* ── 审计日志 ─────────────────────────────────────────────── */

export interface WeightAuditEntry {
  id: number;
  changed_at: string | null;
  changed_by: string;
  source: string;
  old_weights: Record<string, number>;
  new_weights: Record<string, number>;
  ai_accuracy: number | null;
  sample_count: number | null;
  notes: string | null;
}

export async function fetchWeightHistory(): Promise<{ history: WeightAuditEntry[] }> {
  const res = await authFetch(`${API}/api/admin/models/vpd-weight-history`);
  return handleApiResponse(res, "获取权重历史失败");
}

/* ── AI 训练 ──────────────────────────────────────────────── */

export interface AiTrainingChange {
  factor: string;
  old: number;
  new: number;
  reason: string;
}

export interface AiTrainingResult {
  ok: boolean;
  error?: string;
  ai_result?: {
    analysis: string;
    suggested_weights: Record<string, number>;
    changes: AiTrainingChange[];
    confidence: number;
    warnings: string[];
  };
  current_weights?: Record<string, number>;
  suggested_weights?: Record<string, number>;
  tokens_used?: number;
  model?: string;
  stats?: VpdStatsResponse;
  message?: string;
}

export async function triggerAiTraining(days = 14): Promise<AiTrainingResult> {
  const res = await authFetch(`${API}/api/admin/models/vpd-train?days=${days}`, {
    method: "POST",
  });
  return handleApiResponse<AiTrainingResult>(res, "AI 训练调用失败");
}

export async function applyAiSuggestion(
  suggestedWeights: Record<string, number>
): Promise<{ ok: boolean; message: string }> {
  const res = await authFetch(`${API}/api/admin/models/vpd-train/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggested_weights: suggestedWeights }),
  });
  return handleApiResponse(res, "应用 AI 建议失败");
}
