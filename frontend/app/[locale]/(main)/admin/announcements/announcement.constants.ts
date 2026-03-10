import type { AnnouncementDisplayMode } from "@/lib/api/announcements";
import type { AdminAnnouncementStatus } from "@/lib/api/admin-announcements";

export const PAGE_SIZE = 20;
export const DELIVERY_PAGE_SIZE = 10;

export const STATUS_LABEL: Record<AdminAnnouncementStatus, string> = {
  draft: "草稿",
  scheduled: "已排期",
  published: "已发布",
  archived: "已归档",
};

export const STATUS_STYLE: Record<AdminAnnouncementStatus, string> = {
  draft: "bg-white/[0.06] text-zinc-300",
  scheduled: "bg-amber-500/15 text-amber-300",
  published: "bg-emerald-500/15 text-emerald-300",
  archived: "bg-zinc-500/15 text-zinc-400",
};

export const MODE_LABEL: Record<AnnouncementDisplayMode, string> = {
  banner: "横幅",
  modal: "弹窗",
  blocking_modal: "阻断弹窗",
};

export const MODE_STYLE: Record<AnnouncementDisplayMode, string> = {
  banner: "bg-sky-500/15 text-sky-300",
  modal: "bg-indigo-500/15 text-indigo-300",
  blocking_modal: "bg-rose-500/15 text-rose-300",
};

export const STATUS_OPTIONS: Array<{ value: "" | AdminAnnouncementStatus; label: string }> = [
  { value: "", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "scheduled", label: "已排期" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
];

export const DISPLAY_MODE_OPTIONS: Array<{ value: "" | AnnouncementDisplayMode; label: string }> = [
  { value: "", label: "全部" },
  { value: "banner", label: "横幅" },
  { value: "modal", label: "弹窗" },
  { value: "blocking_modal", label: "阻断弹窗" },
];

export function actionClass(intent: "primary" | "ghost" | "danger" = "ghost") {
  if (intent === "primary") {
    return "rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--color-accent)]/15 text-accent hover:bg-[var(--color-accent)]/25 transition-colors disabled:opacity-40";
  }

  if (intent === "danger") {
    return "rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--color-bear)]/15 text-bear hover:bg-[var(--color-bear)]/25 transition-colors disabled:opacity-40";
  }

  return "rounded-lg px-3 py-1.5 text-xs font-medium bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] transition-colors disabled:opacity-40";
}
