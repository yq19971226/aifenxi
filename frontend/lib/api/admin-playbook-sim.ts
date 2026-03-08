import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface AdminPrediction {
  id: string;
  symbol: string;
  playbook_name: string;
  match_pct: number;
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

async function handleRes<T>(res: Response, msg: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: msg }));
    throw new Error(err.detail || msg);
  }
  return res.json();
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
  return handleRes(res, "获取预测列表失败");
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
  return handleRes(res, "操作失败");
}

export async function deletePrediction(
  id: string
): Promise<{ message: string }> {
  const res = await authFetch(
    `${API_BASE}/api/admin/playbook-sim/predictions/${id}`,
    { method: "DELETE" }
  );
  return handleRes(res, "删除失败");
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
  return handleRes(res, "批量发布失败");
}
