import type { AnnouncementDisplayMode } from "@/lib/api/announcements";
import type {
  AdminAnnouncementDraftPayload,
  AdminAnnouncementInfo,
  AdminAnnouncementUpdatePayload,
} from "@/lib/api/admin-announcements";

export interface AnnouncementFormState {
  announcement_key: string;
  title: string;
  summary: string;
  content_md: string;
  display_mode: AnnouncementDisplayMode;
  priority: string;
  strong_ack_required: boolean;
  allow_snooze: boolean;
  action_text: string;
  action_href: string;
  target_roles: string;
  target_membership_levels: string;
  target_path_prefixes: string;
  starts_at: string;
  ends_at: string;
}

export function emptyAnnouncementForm(): AnnouncementFormState {
  return {
    announcement_key: "",
    title: "",
    summary: "",
    content_md: "",
    display_mode: "banner",
    priority: "0",
    strong_ack_required: false,
    allow_snooze: true,
    action_text: "",
    action_href: "",
    target_roles: "",
    target_membership_levels: "",
    target_path_prefixes: "",
    starts_at: "",
    ends_at: "",
  };
}

function parseStringList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function parseNumberList(value: string): number[] {
  return parseStringList(value).map((item) => {
    const parsed = Number(item);
    if (!Number.isInteger(parsed)) {
      throw new Error("target_membership_levels 必须是整数列表");
    }
    return parsed;
  });
}

function toOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function toDateTimeInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

export function toIsoOrNull(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} 格式无效`);
  }
  return date.toISOString();
}

export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toDraftPayload(form: AnnouncementFormState): AdminAnnouncementDraftPayload {
  const priority = Number(form.priority);
  if (!Number.isInteger(priority)) {
    throw new Error("priority 必须是整数");
  }

  const displayMode = form.display_mode;
  const strongAckRequired = displayMode === "blocking_modal" ? true : form.strong_ack_required;

  return {
    announcement_key: toOptional(form.announcement_key),
    title: form.title.trim(),
    summary: toOptional(form.summary),
    content_md: form.content_md.trim(),
    display_mode: displayMode,
    priority,
    strong_ack_required: strongAckRequired,
    allow_snooze: form.allow_snooze,
    action_text: toOptional(form.action_text),
    action_href: toOptional(form.action_href),
    target_roles: parseStringList(form.target_roles),
    target_membership_levels: parseNumberList(form.target_membership_levels),
    target_path_prefixes: parseStringList(form.target_path_prefixes),
    starts_at: toIsoOrNull(form.starts_at, "starts_at"),
    ends_at: toIsoOrNull(form.ends_at, "ends_at"),
  };
}

export function toUpdatePayload(form: AnnouncementFormState): AdminAnnouncementUpdatePayload {
  const payload = toDraftPayload(form);
  return {
    title: payload.title,
    summary: payload.summary,
    content_md: payload.content_md,
    display_mode: payload.display_mode,
    priority: payload.priority,
    strong_ack_required: payload.strong_ack_required,
    allow_snooze: payload.allow_snooze,
    action_text: payload.action_text,
    action_href: payload.action_href,
    target_roles: payload.target_roles,
    target_membership_levels: payload.target_membership_levels,
    target_path_prefixes: payload.target_path_prefixes,
    starts_at: payload.starts_at,
    ends_at: payload.ends_at,
  };
}

export function formFromItem(item: AdminAnnouncementInfo): AnnouncementFormState {
  return {
    announcement_key: item.announcement_key,
    title: item.title,
    summary: item.summary || "",
    content_md: item.content_md,
    display_mode: item.display_mode,
    priority: String(item.priority),
    strong_ack_required: item.strong_ack_required,
    allow_snooze: item.allow_snooze,
    action_text: item.action_text || "",
    action_href: item.action_href || "",
    target_roles: item.target_roles.join(", "),
    target_membership_levels: item.target_membership_levels.join(", "),
    target_path_prefixes: item.target_path_prefixes.join("\n"),
    starts_at: toDateTimeInputValue(item.starts_at),
    ends_at: toDateTimeInputValue(item.ends_at),
  };
}
