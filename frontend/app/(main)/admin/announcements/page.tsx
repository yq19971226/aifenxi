"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { BellRing, CalendarClock, Eye, Megaphone, PencilLine, Plus, Send } from "lucide-react";
import type { AnnouncementDisplayMode } from "@/lib/api/announcements";
import {
  archiveAdminAnnouncement,
  createAdminAnnouncement,
  getAdminAnnouncements,
  getAnnouncementDeliveries,
  publishAdminAnnouncement,
  scheduleAdminAnnouncement,
  unscheduleAdminAnnouncement,
  updateAdminAnnouncement,
  type AdminAnnouncementDeliveriesResponse,
  type AdminAnnouncementDraftPayload,
  type AdminAnnouncementInfo,
  type AdminAnnouncementStatus,
  type AdminAnnouncementUpdatePayload,
  type AdminAnnouncementListResponse,
} from "@/lib/api/admin-announcements";

const PAGE_SIZE = 20;
const DELIVERY_PAGE_SIZE = 10;

const STATUS_LABEL: Record<AdminAnnouncementStatus, string> = {
  draft: "草稿",
  scheduled: "已排期",
  published: "已发布",
  archived: "已归档",
};

const STATUS_STYLE: Record<AdminAnnouncementStatus, string> = {
  draft: "bg-white/[0.06] text-zinc-300",
  scheduled: "bg-amber-500/15 text-amber-300",
  published: "bg-emerald-500/15 text-emerald-300",
  archived: "bg-zinc-500/15 text-zinc-400",
};

const MODE_LABEL: Record<AnnouncementDisplayMode, string> = {
  banner: "横幅",
  modal: "弹窗",
  blocking_modal: "阻断弹窗",
};

const MODE_STYLE: Record<AnnouncementDisplayMode, string> = {
  banner: "bg-sky-500/15 text-sky-300",
  modal: "bg-indigo-500/15 text-indigo-300",
  blocking_modal: "bg-rose-500/15 text-rose-300",
};

interface AnnouncementFormState {
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

function emptyForm(): AnnouncementFormState {
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

function toDateTimeInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} 格式无效`);
  }
  return date.toISOString();
}

function formatDateTime(value: string | null): string {
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

function toDraftPayload(form: AnnouncementFormState): AdminAnnouncementDraftPayload {
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

function formFromItem(item: AdminAnnouncementInfo): AnnouncementFormState {
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

function actionClass(intent: "primary" | "ghost" | "danger" = "ghost") {
  if (intent === "primary") {
    return "rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--color-accent)]/15 text-accent hover:bg-[var(--color-accent)]/25 transition-colors disabled:opacity-40";
  }
  if (intent === "danger") {
    return "rounded-lg px-3 py-1.5 text-xs font-medium bg-[var(--color-bear)]/15 text-bear hover:bg-[var(--color-bear)]/25 transition-colors disabled:opacity-40";
  }
  return "rounded-lg px-3 py-1.5 text-xs font-medium bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] transition-colors disabled:opacity-40";
}

export default function AdminAnnouncementsPage() {
  const [data, setData] = useState<AdminAnnouncementListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminAnnouncementStatus | "">("");
  const [displayModeFilter, setDisplayModeFilter] = useState<AnnouncementDisplayMode | "">("");
  const [page, setPage] = useState(1);
  const [actingKey, setActingKey] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingItem, setEditingItem] = useState<AdminAnnouncementInfo | null>(null);
  const [formState, setFormState] = useState<AnnouncementFormState>(emptyForm());
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [scheduleTarget, setScheduleTarget] = useState<AdminAnnouncementInfo | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [deliveriesTarget, setDeliveriesTarget] = useState<AdminAnnouncementInfo | null>(null);
  const [deliveriesData, setDeliveriesData] = useState<AdminAnnouncementDeliveriesResponse | null>(null);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const [deliveriesPage, setDeliveriesPage] = useState(1);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminAnnouncements({
        search: search || undefined,
        status: statusFilter || undefined,
        display_mode: displayModeFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "查询公告列表失败");
    } finally {
      setLoading(false);
    }
  }, [displayModeFilter, page, search, statusFilter]);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  useEffect(() => {
    if (!deliveriesTarget) return;
    let active = true;
    const run = async () => {
      setDeliveriesLoading(true);
      setDeliveriesError(null);
      try {
        const res = await getAnnouncementDeliveries(
          deliveriesTarget.id,
          deliveriesPage,
          DELIVERY_PAGE_SIZE
        );
        if (active) {
          setDeliveriesData(res);
        }
      } catch (err: unknown) {
        if (active) {
          setDeliveriesError(err instanceof Error ? err.message : "查询公告投递记录失败");
        }
      } finally {
        if (active) {
          setDeliveriesLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [deliveriesPage, deliveriesTarget]);

  const totalPages = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, Math.ceil(data.total / data.page_size));
  }, [data]);

  const deliveryTotalPages = useMemo(() => {
    if (!deliveriesData) return 0;
    return Math.max(1, Math.ceil(deliveriesData.total / deliveriesData.page_size));
  }, [deliveriesData]);

  const updateForm = useCallback(<K extends keyof AnnouncementFormState>(key: K, value: AnnouncementFormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const openCreate = useCallback(() => {
    setEditorMode("create");
    setEditingItem(null);
    setFormState(emptyForm());
    setFormError(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((item: AdminAnnouncementInfo) => {
    setEditorMode("edit");
    setEditingItem(item);
    setFormState(formFromItem(item));
    setFormError(null);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingItem(null);
    setFormError(null);
    setFormSaving(false);
  }, []);

  const handleSearch = useCallback((event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }, [searchInput]);

  const runAction = useCallback(async (key: string, action: () => Promise<unknown>, fallback: string) => {
    setActingKey(key);
    setError(null);
    try {
      await action();
      await fetchAnnouncements();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setActingKey(null);
    }
  }, [fetchAnnouncements]);

  const handleSave = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setFormSaving(true);
    setFormError(null);
    try {
      const payload = toDraftPayload(formState);
      if (editorMode === "create") {
        await createAdminAnnouncement(payload);
      } else if (editingItem) {
        const updatePayload: AdminAnnouncementUpdatePayload = {
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
        await updateAdminAnnouncement(editingItem.id, updatePayload);
      }
      closeEditor();
      await fetchAnnouncements();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "保存公告失败");
    } finally {
      setFormSaving(false);
    }
  }, [closeEditor, editingItem, editorMode, fetchAnnouncements, formState]);

  const openSchedule = useCallback((item: AdminAnnouncementInfo) => {
    setScheduleTarget(item);
    setScheduledAt(toDateTimeInputValue(item.scheduled_at));
    setScheduleError(null);
  }, []);

  const closeSchedule = useCallback(() => {
    setScheduleTarget(null);
    setScheduledAt("");
    setScheduleError(null);
    setScheduleSaving(false);
  }, []);

  const handleSchedule = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!scheduleTarget) return;
    setScheduleSaving(true);
    setScheduleError(null);
    try {
      const scheduledAtIso = toIsoOrNull(scheduledAt, "scheduled_at");
      if (!scheduledAtIso) {
        throw new Error("请选择排期时间");
      }
      await scheduleAdminAnnouncement(scheduleTarget.id, scheduledAtIso);
      closeSchedule();
      await fetchAnnouncements();
    } catch (err: unknown) {
      setScheduleError(err instanceof Error ? err.message : "公告排期失败");
    } finally {
      setScheduleSaving(false);
    }
  }, [closeSchedule, fetchAnnouncements, scheduleTarget, scheduledAt]);

  const openDeliveries = useCallback((item: AdminAnnouncementInfo) => {
    setDeliveriesTarget(item);
    setDeliveriesPage(1);
    setDeliveriesData(null);
    setDeliveriesError(null);
  }, []);

  const closeDeliveries = useCallback(() => {
    setDeliveriesTarget(null);
    setDeliveriesData(null);
    setDeliveriesError(null);
    setDeliveriesPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <motion.h1
            className="flex items-center gap-2 text-lg font-semibold text-zinc-200"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Megaphone size={18} className="text-indigo-300" />
            公告管理
          </motion.h1>
          <p className="mt-1 text-sm text-zinc-500">管理站内公告草稿、排期、发布与用户留痕</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent)]/80"
        >
          <Plus size={16} />
          新建公告
        </button>
      </div>

      <motion.form
        onSubmit={handleSearch}
        className="card-surface rounded-xl p-5 flex flex-wrap items-end gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <label htmlFor="announcement-search" className="text-xs text-zinc-400">搜索</label>
          <input
            id="announcement-search"
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="标题、摘要或公告 key"
            className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label htmlFor="announcement-status-filter" className="text-xs text-zinc-400">状态</label>
          <select
            id="announcement-status-filter"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as AdminAnnouncementStatus | "");
              setPage(1);
            }}
            className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none transition-colors focus:border-accent"
          >
            <option value="">全部</option>
            <option value="draft">草稿</option>
            <option value="scheduled">已排期</option>
            <option value="published">已发布</option>
            <option value="archived">已归档</option>
          </select>
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label htmlFor="announcement-display-filter" className="text-xs text-zinc-400">展示方式</label>
          <select
            id="announcement-display-filter"
            value={displayModeFilter}
            onChange={(event) => {
              setDisplayModeFilter(event.target.value as AnnouncementDisplayMode | "");
              setPage(1);
            }}
            className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none transition-colors focus:border-accent"
          >
            <option value="">全部</option>
            <option value="banner">横幅</option>
            <option value="modal">弹窗</option>
            <option value="blocking_modal">阻断弹窗</option>
          </select>
        </div>
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg bg-[var(--color-accent)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent)]/80"
        >
          搜索
        </button>
      </motion.form>

      {editorOpen ? (
        <div className="card-surface rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                {editorMode === "create" ? "新建公告草稿" : editingItem?.status === "published" || editingItem?.status === "archived" ? "创建新版本草稿" : "编辑公告"}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {editorMode === "create" ? "先保存为草稿，再进行排期或发布" : editingItem ? `${editingItem.announcement_key} · v${editingItem.version}` : ""}
              </p>
            </div>
            <button type="button" onClick={closeEditor} className={actionClass("ghost")}>收起</button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">announcement_key</label>
                <input
                  value={formState.announcement_key}
                  onChange={(event) => updateForm("announcement_key", event.target.value)}
                  disabled={editorMode === "edit"}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1.5 xl:col-span-2">
                <label className="text-xs text-zinc-400">标题</label>
                <input
                  value={formState.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5 xl:col-span-3">
                <label className="text-xs text-zinc-400">摘要</label>
                <input
                  value={formState.summary}
                  onChange={(event) => updateForm("summary", event.target.value)}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5 xl:col-span-3">
                <label className="text-xs text-zinc-400">正文</label>
                <textarea
                  value={formState.content_md}
                  onChange={(event) => updateForm("content_md", event.target.value)}
                  rows={8}
                  className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">展示方式</label>
                <select
                  value={formState.display_mode}
                  onChange={(event) => updateForm("display_mode", event.target.value as AnnouncementDisplayMode)}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
                >
                  <option value="banner">横幅</option>
                  <option value="modal">弹窗</option>
                  <option value="blocking_modal">阻断弹窗</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">优先级</label>
                <input
                  type="number"
                  value={formState.priority}
                  onChange={(event) => updateForm("priority", event.target.value)}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
                />
              </div>
              <div className="flex items-center gap-4 pt-6">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={formState.display_mode === "blocking_modal" ? true : formState.strong_ack_required}
                    onChange={(event) => updateForm("strong_ack_required", event.target.checked)}
                    disabled={formState.display_mode === "blocking_modal"}
                  />
                  强确认
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={formState.allow_snooze}
                    onChange={(event) => updateForm("allow_snooze", event.target.checked)}
                  />
                  允许稍后提醒
                </label>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">操作文案</label>
                <input
                  value={formState.action_text}
                  onChange={(event) => updateForm("action_text", event.target.value)}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5 xl:col-span-2">
                <label className="text-xs text-zinc-400">操作链接</label>
                <input
                  value={formState.action_href}
                  onChange={(event) => updateForm("action_href", event.target.value)}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">目标角色</label>
                <textarea
                  value={formState.target_roles}
                  onChange={(event) => updateForm("target_roles", event.target.value)}
                  rows={3}
                  placeholder="admin, operator"
                  className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">目标会员等级</label>
                <textarea
                  value={formState.target_membership_levels}
                  onChange={(event) => updateForm("target_membership_levels", event.target.value)}
                  rows={3}
                  placeholder="0, 1, 2"
                  className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">目标路径前缀</label>
                <textarea
                  value={formState.target_path_prefixes}
                  onChange={(event) => updateForm("target_path_prefixes", event.target.value)}
                  rows={3}
                  placeholder="/dashboard\n/tasks"
                  className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">开始时间</label>
                <input
                  type="datetime-local"
                  value={formState.starts_at}
                  onChange={(event) => updateForm("starts_at", event.target.value)}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">结束时间</label>
                <input
                  type="datetime-local"
                  value={formState.ends_at}
                  onChange={(event) => updateForm("ends_at", event.target.value)}
                  className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
                />
              </div>
            </div>
            {formError ? <p className="text-sm text-bear">{formError}</p> : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={closeEditor} className={actionClass("ghost")}>取消</button>
              <button type="submit" disabled={formSaving} className={actionClass("primary")}>
                {formSaving ? "保存中" : editorMode === "create" ? "保存草稿" : "提交更新"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {scheduleTarget ? (
        <div className="card-surface rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                <CalendarClock size={16} className="text-amber-300" />
                公告排期
              </h2>
              <p className="mt-1 text-xs text-zinc-500">{scheduleTarget.title}</p>
            </div>
            <button type="button" onClick={closeSchedule} className={actionClass("ghost")}>收起</button>
          </div>
          <form onSubmit={handleSchedule} className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs text-zinc-400">scheduled_at</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={closeSchedule} className={actionClass("ghost")}>取消</button>
              <button type="submit" disabled={scheduleSaving} className={actionClass("primary")}>
                {scheduleSaving ? "排期中" : "确认排期"}
              </button>
            </div>
          </form>
          {scheduleError ? <p className="mt-3 text-sm text-bear">{scheduleError}</p> : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : null}

      {error && !loading ? (
        <div className="rounded-xl border border-[var(--color-bear)]/30 bg-white/[0.04] p-6 text-center backdrop-blur-md">
          <p className="text-sm text-bear">{error}</p>
        </div>
      ) : null}

      {!loading && data ? (
        <motion.div
          className="card-surface overflow-hidden rounded-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <BellRing size={22} className="text-zinc-500" />
              <div>
                <p className="text-sm font-medium text-zinc-200">暂无公告</p>
                <p className="mt-1 text-sm text-zinc-500">可以先创建一条草稿开始投放流程</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
                    <th className="px-5 py-3 font-medium">标题</th>
                    <th className="px-5 py-3 font-medium">版本</th>
                    <th className="px-5 py-3 font-medium">展示方式</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">优先级</th>
                    <th className="px-5 py-3 font-medium">时间</th>
                    <th className="px-5 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const editLabel = item.status === "published" || item.status === "archived" ? "新版本草稿" : "编辑";
                    return (
                      <tr key={item.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4 align-top">
                          <div className="max-w-[320px]">
                            <p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
                            <p className="mt-1 truncate text-xs text-zinc-500">{item.announcement_key}</p>
                            {item.summary ? <p className="mt-2 line-clamp-2 text-xs text-zinc-400">{item.summary}</p> : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top text-zinc-300">v{item.version}</td>
                        <td className="px-5 py-4 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${MODE_STYLE[item.display_mode]}`}>
                            {MODE_LABEL[item.display_mode]}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>
                            {STATUS_LABEL[item.status]}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-top text-zinc-300">{item.priority}</td>
                        <td className="px-5 py-4 align-top text-xs text-zinc-400">
                          <div className="space-y-1">
                            <p>更新：{formatDateTime(item.updated_at)}</p>
                            <p>发布：{formatDateTime(item.published_at)}</p>
                            <p>排期：{formatDateTime(item.scheduled_at)}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" onClick={() => openEdit(item)} className={actionClass("ghost")}>
                              <span className="inline-flex items-center gap-1"><PencilLine size={12} />{editLabel}</span>
                            </button>
                            {item.status === "draft" ? (
                              <button type="button" onClick={() => openSchedule(item)} className={actionClass("ghost")}>
                                <span className="inline-flex items-center gap-1"><CalendarClock size={12} />排期</span>
                              </button>
                            ) : null}
                            {item.status === "scheduled" ? (
                              <button
                                type="button"
                                disabled={actingKey === `${item.id}:unschedule`}
                                onClick={() => void runAction(`${item.id}:unschedule`, () => unscheduleAdminAnnouncement(item.id), "取消公告排期失败")}
                                className={actionClass("ghost")}
                              >
                                {actingKey === `${item.id}:unschedule` ? "处理中" : "取消排期"}
                              </button>
                            ) : null}
                            {item.status === "draft" || item.status === "scheduled" ? (
                              <button
                                type="button"
                                disabled={actingKey === `${item.id}:publish`}
                                onClick={() => {
                                  if (!window.confirm(`确认发布公告《${item.title}》吗？`)) return;
                                  void runAction(`${item.id}:publish`, () => publishAdminAnnouncement(item.id), "发布公告失败");
                                }}
                                className={actionClass("primary")}
                              >
                                <span className="inline-flex items-center gap-1"><Send size={12} />{actingKey === `${item.id}:publish` ? "发布中" : "发布"}</span>
                              </button>
                            ) : null}
                            {item.status === "published" ? (
                              <button
                                type="button"
                                disabled={actingKey === `${item.id}:archive`}
                                onClick={() => {
                                  if (!window.confirm(`确认归档公告《${item.title}》吗？`)) return;
                                  void runAction(`${item.id}:archive`, () => archiveAdminAnnouncement(item.id), "归档公告失败");
                                }}
                                className={actionClass("danger")}
                              >
                                {actingKey === `${item.id}:archive` ? "归档中" : "归档"}
                              </button>
                            ) : null}
                            <button type="button" onClick={() => openDeliveries(item)} className={actionClass("ghost")}>
                              <span className="inline-flex items-center gap-1"><Eye size={12} />留痕</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3">
              <span className="text-xs text-zinc-500">共 {data.total} 条，第 {data.page}/{totalPages} 页</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="rounded-lg bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] disabled:opacity-30"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
            </div>
          ) : null}
        </motion.div>
      ) : null}

      {deliveriesTarget ? (
        <div className="card-surface rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                <Eye size={16} className="text-indigo-300" />
                公告留痕
              </h2>
              <p className="mt-1 text-xs text-zinc-500">{deliveriesTarget.title}</p>
            </div>
            <button type="button" onClick={closeDeliveries} className={actionClass("ghost")}>收起</button>
          </div>

          {deliveriesLoading ? (
            <div className="flex justify-center py-10">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : deliveriesError ? (
            <p className="text-sm text-bear">{deliveriesError}</p>
          ) : deliveriesData && deliveriesData.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
                    <th className="px-4 py-3 font-medium">用户</th>
                    <th className="px-4 py-3 font-medium">展示次数</th>
                    <th className="px-4 py-3 font-medium">最近动作</th>
                    <th className="px-4 py-3 font-medium">确认时间</th>
                    <th className="px-4 py-3 font-medium">稍后提醒至</th>
                    <th className="px-4 py-3 font-medium">更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveriesData.items.map((item) => (
                    <tr key={item.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-zinc-200">{item.email}</td>
                      <td className="px-4 py-3 text-zinc-400">{item.shown_count}</td>
                      <td className="px-4 py-3 text-zinc-300">{item.last_event}</td>
                      <td className="px-4 py-3 text-zinc-400">{formatDateTime(item.confirmed_at)}</td>
                      <td className="px-4 py-3 text-zinc-400">{formatDateTime(item.snooze_until)}</td>
                      <td className="px-4 py-3 text-zinc-400">{formatDateTime(item.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <BellRing size={20} className="text-zinc-500" />
              <p className="text-sm text-zinc-500">当前公告还没有用户留痕</p>
            </div>
          )}

          {deliveriesData && deliveryTotalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-4">
              <span className="text-xs text-zinc-500">共 {deliveriesData.total} 条，第 {deliveriesData.page}/{deliveryTotalPages} 页</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveriesPage((prev) => Math.max(1, prev - 1))}
                  disabled={deliveriesPage <= 1}
                  className="rounded-lg bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] disabled:opacity-30"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveriesPage((prev) => Math.min(deliveryTotalPages, prev + 1))}
                  disabled={deliveriesPage >= deliveryTotalPages}
                  className="rounded-lg bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
