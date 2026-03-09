import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface OperatorInfo {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateOperatorBody {
  email: string;
  password: string;
}

// ── API calls ────────────────────────────────────────────────

export async function getOperators(): Promise<OperatorInfo[]> {
  const res = await authFetch(`${API_BASE}/api/operators`);
  return handleApiResponse(res, "获取运营员列表失败");
}

export async function createOperator(
  body: CreateOperatorBody
): Promise<OperatorInfo> {
  const res = await authFetch(`${API_BASE}/api/operators`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleApiResponse(res, "创建运营员失败");
}

export async function activateOperator(id: string): Promise<OperatorInfo> {
  const res = await authFetch(
    `${API_BASE}/api/operators/${encodeURIComponent(id)}/activate`,
    { method: "PUT" }
  );
  return handleApiResponse(res, "启用运营员失败");
}

export async function deactivateOperator(id: string): Promise<OperatorInfo> {
  const res = await authFetch(
    `${API_BASE}/api/operators/${encodeURIComponent(id)}/deactivate`,
    { method: "PUT" }
  );
  return handleApiResponse(res, "停用运营员失败");
}
