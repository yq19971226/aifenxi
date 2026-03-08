import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface AdminOrderInfo {
  id: string;
  payment_id: string;
  user_email: string;
  plan: number;
  amount_usd: number;
  network: string | null;
  status: string;
  created_at: string;
}

export interface AdminOrderListResponse {
  items: AdminOrderInfo[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminOrderQueryParams {
  search?: string | null;
  status?: string | null;
  plan?: number | null;
  page?: number;
  page_size?: number;
}

// ── API calls ────────────────────────────────────────────────

export async function getAdminOrders(
  params: AdminOrderQueryParams = {}
): Promise<AdminOrderListResponse> {
  const qs = new URLSearchParams();

  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.plan != null) qs.set("plan", String(params.plan));
  if (params.page != null) qs.set("page", String(params.page));
  if (params.page_size != null) qs.set("page_size", String(params.page_size));

  const query = qs.toString();
  const url = `${API_BASE}/api/admin/orders${query ? `?${query}` : ""}`;

  const res = await authFetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "查询订单失败" }));
    throw new Error(err.detail || "查询订单失败");
  }

  return res.json();
}
