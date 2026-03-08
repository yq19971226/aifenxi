import { authFetch } from "./auth";
import type { AnnouncementDisplayMode } from "./announcements";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export type AdminAnnouncementStatus = "draft" | "scheduled" | "published" | "archived";

export interface AdminAnnouncementInfo {
  id: string;
  announcement_key: string;
  version: number;
  title: string;
  summary: string | null;
  content_md: string;
  display_mode: AnnouncementDisplayMode;
  priority: number;
  status: AdminAnnouncementStatus;
  strong_ack_required: boolean;
  allow_snooze: boolean;
  action_text: string | null;
  action_href: string | null;
  target_roles: string[];
  target_membership_levels: number[];
  target_path_prefixes: string[];
  starts_at: string | null;
  ends_at: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  published_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminAnnouncementListResponse {
  items: AdminAnnouncementInfo[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminAnnouncementQueryParams {
  status?: AdminAnnouncementStatus;
  display_mode?: AnnouncementDisplayMode;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface AdminAnnouncementDraftPayload {
  announcement_key?: string | null;
  title: string;
  summary?: string | null;
  content_md: string;
  display_mode: AnnouncementDisplayMode;
  priority: number;
  strong_ack_required: boolean;
  allow_snooze: boolean;
  action_text?: string | null;
  action_href?: string | null;
  target_roles: string[];
  target_membership_levels: number[];
  target_path_prefixes: string[];
  starts_at?: string | null;
  ends_at?: string | null;
}

export type AdminAnnouncementUpdatePayload = Partial<
  Omit<AdminAnnouncementDraftPayload, "announcement_key">
>;

export interface AdminAnnouncementDeliveryInfo {
  id: string;
  user_id: string;
  email: string;
  announcement_id: string;
  announcement_key: string;
  announcement_version: number;
  shown_count: number;
  last_event: string;
  first_shown_at: string | null;
  last_shown_at: string | null;
  closed_at: string | null;
  clicked_at: string | null;
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  snooze_until: string | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminAnnouncementDeliveriesResponse {
  items: AdminAnnouncementDeliveryInfo[];
  total: number;
  page: number;
  page_size: number;
}

async function readError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ detail: fallback }));
  return new Error(err.detail || fallback);
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function getAdminAnnouncements(
  params: AdminAnnouncementQueryParams = {}
): Promise<AdminAnnouncementListResponse> {
  const qs = buildQuery({
    status: params.status,
    display_mode: params.display_mode,
    search: params.search,
    page: params.page,
    page_size: params.page_size,
  });
  const res = await authFetch(`${API_BASE}/api/admin/announcements${qs}`);
  if (!res.ok) {
    throw await readError(res, "查询公告列表失败");
  }
  return res.json();
}

export async function createAdminAnnouncement(
  payload: AdminAnnouncementDraftPayload
): Promise<AdminAnnouncementInfo> {
  const res = await authFetch(`${API_BASE}/api/admin/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      announcement_key: payload.announcement_key || null,
      summary: payload.summary || null,
      action_text: payload.action_text || null,
      action_href: payload.action_href || null,
      starts_at: payload.starts_at || null,
      ends_at: payload.ends_at || null,
    }),
  });
  if (!res.ok) {
    throw await readError(res, "创建公告草稿失败");
  }
  return res.json();
}

export async function updateAdminAnnouncement(
  announcementId: string,
  payload: AdminAnnouncementUpdatePayload
): Promise<AdminAnnouncementInfo> {
  const res = await authFetch(
    `${API_BASE}/api/admin/announcements/${encodeURIComponent(announcementId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    throw await readError(res, "更新公告失败");
  }
  return res.json();
}

export async function scheduleAdminAnnouncement(
  announcementId: string,
  scheduledAt: string
): Promise<AdminAnnouncementInfo> {
  const res = await authFetch(
    `${API_BASE}/api/admin/announcements/${encodeURIComponent(announcementId)}/schedule`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    }
  );
  if (!res.ok) {
    throw await readError(res, "公告排期失败");
  }
  return res.json();
}

export async function unscheduleAdminAnnouncement(
  announcementId: string
): Promise<AdminAnnouncementInfo> {
  const res = await authFetch(
    `${API_BASE}/api/admin/announcements/${encodeURIComponent(announcementId)}/unschedule`,
    {
      method: "POST",
    }
  );
  if (!res.ok) {
    throw await readError(res, "取消公告排期失败");
  }
  return res.json();
}

export async function publishAdminAnnouncement(
  announcementId: string
): Promise<AdminAnnouncementInfo> {
  const res = await authFetch(
    `${API_BASE}/api/admin/announcements/${encodeURIComponent(announcementId)}/publish`,
    {
      method: "POST",
    }
  );
  if (!res.ok) {
    throw await readError(res, "发布公告失败");
  }
  return res.json();
}

export async function archiveAdminAnnouncement(
  announcementId: string
): Promise<AdminAnnouncementInfo> {
  const res = await authFetch(
    `${API_BASE}/api/admin/announcements/${encodeURIComponent(announcementId)}/archive`,
    {
      method: "POST",
    }
  );
  if (!res.ok) {
    throw await readError(res, "归档公告失败");
  }
  return res.json();
}

export async function getAnnouncementDeliveries(
  announcementId: string,
  page = 1,
  pageSize = 20
): Promise<AdminAnnouncementDeliveriesResponse> {
  const qs = buildQuery({ page, page_size: pageSize });
  const res = await authFetch(
    `${API_BASE}/api/admin/announcements/${encodeURIComponent(announcementId)}/deliveries${qs}`
  );
  if (!res.ok) {
    throw await readError(res, "查询公告投递记录失败");
  }
  return res.json();
}
