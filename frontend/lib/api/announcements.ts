import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export type AnnouncementDisplayMode = "blocking_modal" | "modal" | "banner";
export type AnnouncementEventType = "shown" | "closed" | "snoozed" | "clicked" | "confirmed";

export interface ActiveAnnouncement {
  id: string;
  announcement_key: string;
  version: number;
  title: string;
  summary: string | null;
  content_md: string;
  display_mode: AnnouncementDisplayMode;
  priority: number;
  strong_ack_required: boolean;
  allow_snooze: boolean;
  action_text: string | null;
  action_href: string | null;
  published_at: string | null;
}

export interface AnnouncementHistoryItem {
  id: string;
  announcement_key: string;
  version: number;
  title: string;
  summary: string | null;
  display_mode: AnnouncementDisplayMode;
  status: "published" | "archived";
  published_at: string | null;
  archived_at: string | null;
  last_event: AnnouncementEventType | null;
  confirmed_at: string | null;
}

export interface AnnouncementHistoryResponse {
  items: AnnouncementHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AnnouncementEventPayload {
  event_type: AnnouncementEventType;
  pathname: string;
  occurred_at: string;
  snooze_until?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AnnouncementEventResult {
  announcement_id: string;
  event_type: AnnouncementEventType;
  occurred_at: string;
  snooze_until: string | null;
  recorded: boolean;
}

export async function fetchActiveAnnouncements(
  pathname: string
): Promise<ActiveAnnouncement[]> {
  const params = new URLSearchParams({ pathname });
  const url = `${API_BASE}/api/announcements/active?${params.toString()}`;

  const res = await authFetch(url);
  return handleApiResponse(res, "获取公告失败");
}

export async function fetchAnnouncementHistory(
  page = 1,
  pageSize = 20
): Promise<AnnouncementHistoryResponse> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const url = `${API_BASE}/api/announcements/history?${params.toString()}`;

  const res = await authFetch(url);
  return handleApiResponse(res, "获取公告历史失败");
}

export async function postAnnouncementEvent(
  announcementId: string,
  payload: AnnouncementEventPayload
): Promise<AnnouncementEventResult> {
  const res = await authFetch(`${API_BASE}/api/announcements/${announcementId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      metadata: payload.metadata || {},
      snooze_until: payload.snooze_until ?? null,
    }),
  });
  return handleApiResponse(res, "回写公告事件失败");
}
