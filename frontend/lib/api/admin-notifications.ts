import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface NotificationLogInfo {
  id: string;
  user_email: string | null;
  recipient: string;
  channel: string;
  event_type: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface NotificationLogListResponse {
  items: NotificationLogInfo[];
  total: number;
  page: number;
  page_size: number;
}

export interface NotificationQueryParams {
  search?: string;
  channel?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

// ── API calls ────────────────────────────────────────────────

export async function getNotifications(
  params: NotificationQueryParams = {}
): Promise<NotificationLogListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.channel) query.set("channel", params.channel);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));

  const qs = query.toString();
  const url = `${API_BASE}/api/admin/notifications${qs ? `?${qs}` : ""}`;
  const res = await authFetch(url);
  return handleApiResponse(res, "查询通知历史失败");
}
