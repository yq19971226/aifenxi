import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface AdminUserInfo {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  membership_level: number;
  expires_at: string | null;
  created_at: string;
}

export interface AdminUserListResponse {
  items: AdminUserInfo[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserQueryParams {
  search?: string;
  role?: string;
  membership_level?: number;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export interface CreateUserParams {
  email: string;
  password: string;
  role?: string;
  membership_level?: number;
  expires_at?: string | null;
}

// ── API calls ────────────────────────────────────────────────

export async function createUser(
  params: CreateUserParams
): Promise<AdminUserInfo> {
  const res = await authFetch(`${API_BASE}/api/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleApiResponse(res, "创建用户失败");
}

export async function getUsers(
  params: UserQueryParams = {}
): Promise<AdminUserListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);
  if (params.membership_level !== undefined)
    query.set("membership_level", String(params.membership_level));
  if (params.is_active !== undefined)
    query.set("is_active", String(params.is_active));
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));

  const qs = query.toString();
  const url = `${API_BASE}/api/admin/users${qs ? `?${qs}` : ""}`;
  const res = await authFetch(url);
  return handleApiResponse(res, "查询用户列表失败");
}

export async function toggleUserActive(
  userId: string,
  isActive: boolean
): Promise<AdminUserInfo> {
  const res = await authFetch(
    `${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/active`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    }
  );
  return handleApiResponse(res, "操作失败");
}

export async function updateMembership(
  userId: string,
  level: number,
  expiresAt: string | null
): Promise<AdminUserInfo> {
  const res = await authFetch(
    `${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/membership`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, expires_at: expiresAt }),
    }
  );
  return handleApiResponse(res, "调整会员等级失败");
}