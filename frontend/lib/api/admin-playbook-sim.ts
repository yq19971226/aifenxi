import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface AdminPrediction {
  id: string;
  symbol: string;
  playbook_name: string;
  match_pct: number;
  market_structure_type?: string | null;
  dominant_factors?: string[];
  ranking_reason_summary?: string | null;
  decision_sentence?: string | null;
  inferred_market_structures?: string[];
  matched_confidence_boosters?: string[];
  matched_invalidation_signals?: string[];
  structure_explanation?: string | null;
  current_stage_idx: number | null;
  status: string;
  published: boolean;
  final_accuracy: number | null;
  verified_stages: number;
  stages: unknown[];
  created_at: string | null;
}

export interface AdminPredictionList {
  items: AdminPrediction[];
  total: number;
  page: number;
  page_size: number;
}

export async function fetchAdminPredictions(params: {
  symbol?: string;
  playbook?: string;
  published?: boolean;
  page?: number;
  page_size?: number;
}): Promise<AdminPredictionList> {
  const sp = new URLSearchParams();
  if (params.symbol) sp.set("symbol", params.symbol);
  if (params.playbook) sp.set("playbook", params.playbook);
  if (params.published !== undefined) sp.set("published", String(params.published));
  sp.set("page", String(params.page || 1));
  sp.set("page_size", String(params.page_size || 20));
  const res = await authFetch(`${API_BASE}/api/admin/playbook-sim/predictions?${sp}`);
  return handleApiResponse(res, "获取预测列表失败");
}

export async function togglePublish(
  id: string,
  published: boolean
): Promise<{ message: string }> {
  const res = await authFetch(
    `${API_BASE}/api/admin/playbook-sim/predictions/${id}/publish`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published }),
    }
  );
  return handleApiResponse(res, "操作失败");
}

export async function deletePrediction(
  id: string
): Promise<{ message: string }> {
  const res = await authFetch(
    `${API_BASE}/api/admin/playbook-sim/predictions/${id}`,
    { method: "DELETE" }
  );
  return handleApiResponse(res, "删除失败");
}

export async function batchPublish(
  ids: number[]
): Promise<{ message: string; count: number }> {
  const res = await authFetch(
    `${API_BASE}/api/admin/playbook-sim/predictions/batch-publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids),
    }
  );
  return handleApiResponse(res, "批量发布失败");
}
