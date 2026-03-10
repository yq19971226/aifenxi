import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AnnouncementDisplayMode } from "@/lib/api/announcements";
import type { AdminAnnouncementInfo } from "@/lib/api/admin-announcements";
import { actionClass, DISPLAY_MODE_OPTIONS } from "../announcement.constants";
import type { AnnouncementFormState } from "../announcement.form";

interface AnnouncementEditorPanelProps {
  mode: "create" | "edit";
  editingItem: AdminAnnouncementInfo | null;
  formState: AnnouncementFormState;
  saving: boolean;
  error: string | null;
  onUpdateForm: <K extends keyof AnnouncementFormState>(key: K, value: AnnouncementFormState[K]) => void;
  onClose: () => void;
  onSubmit: (publishAfterSave: boolean) => void;
}

export function AnnouncementEditorPanel({
  mode,
  editingItem,
  formState,
  saving,
  error,
  onUpdateForm,
  onClose,
  onSubmit,
}: AnnouncementEditorPanelProps) {
  const t = useTranslations("admin");
  const e = (key: string) => t(`announcements.editor.${key}`);

  const title =
    mode === "create"
      ? e("createDraft")
      : editingItem?.status === "published" || editingItem?.status === "archived"
        ? e("createNewVersion")
        : e("editAnnouncement");

  const subtitle =
    mode === "create"
      ? e("createSubtitle")
      : editingItem
        ? `${editingItem.announcement_key} · v${editingItem.version}`
        : "";

  const [showAdvanced, setShowAdvanced] = useState(
    mode === "edit" ||
      Boolean(
        formState.announcement_key.trim() ||
          formState.priority.trim() !== "0" ||
          formState.strong_ack_required ||
          !formState.allow_snooze ||
          formState.action_text.trim() ||
          formState.action_href.trim() ||
          formState.target_roles.trim() ||
          formState.target_membership_levels.trim() ||
          formState.target_path_prefixes.trim() ||
          formState.starts_at.trim() ||
          formState.ends_at.trim()
      )
  );

  const draftLabel =
    mode === "create"
      ? e("saveDraft")
      : editingItem?.status === "published" || editingItem?.status === "archived"
        ? e("saveNewVersion")
        : e("save");

  const publishLabel =
    mode === "create"
      ? e("publishDirect")
      : editingItem?.status === "published" || editingItem?.status === "archived"
      ? e("publishNewVersion")
      : e("saveAndPublish");

  return (
    <div className="card-surface rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className={actionClass("ghost")}>
          {e("collapse")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
        <p className="text-xs text-zinc-500">{e("simpleHint")}</p>
        <button type="button" onClick={() => setShowAdvanced((prev) => !prev)} className={actionClass("ghost")}>
          {showAdvanced ? e("collapseAdvanced") : e("expandAdvanced")}
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(false);
        }}
        className="space-y-4"
      >
        <div className="grid gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelTitle")}</label>
            <input
              value={formState.title}
              onChange={(event) => onUpdateForm("title", event.target.value)}
              className="input h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelContent")}</label>
            <textarea
              value={formState.content_md}
              onChange={(event) => onUpdateForm("content_md", event.target.value)}
              rows={8}
              className="input min-h-[180px] px-3 py-2"
            />
          </div>
        </div>

        {showAdvanced ? (
          <div className="grid gap-4 border-t border-white/[0.08] pt-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-1">
            <label className="text-xs text-zinc-400">{e("labelDisplayMode")}</label>
            <select
              value={formState.display_mode}
              onChange={(event) => onUpdateForm("display_mode", event.target.value as AnnouncementDisplayMode)}
              className="input h-9"
            >
              {DISPLAY_MODE_OPTIONS.filter((option) => option.value).map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-2">
            <label className="text-xs text-zinc-400">{e("labelSummary")}</label>
            <input
              value={formState.summary}
              onChange={(event) => onUpdateForm("summary", event.target.value)}
              className="input h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelKey")}</label>
            <input
              value={formState.announcement_key}
              onChange={(event) => onUpdateForm("announcement_key", event.target.value)}
              disabled={mode === "edit"}
              className="input h-9 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelPriority")}</label>
            <input
              type="number"
              value={formState.priority}
              onChange={(event) => onUpdateForm("priority", event.target.value)}
              className="input h-9"
            />
          </div>

          <div className="flex items-center gap-4 pt-6">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={formState.display_mode === "blocking_modal" ? true : formState.strong_ack_required}
                onChange={(event) => onUpdateForm("strong_ack_required", event.target.checked)}
                disabled={formState.display_mode === "blocking_modal"}
              />
              {e("labelStrongAck")}
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={formState.allow_snooze}
                onChange={(event) => onUpdateForm("allow_snooze", event.target.checked)}
              />
              {e("labelAllowSnooze")}
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelActionText")}</label>
            <input
              value={formState.action_text}
              onChange={(event) => onUpdateForm("action_text", event.target.value)}
              className="input h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5 xl:col-span-2">
            <label className="text-xs text-zinc-400">{e("labelActionHref")}</label>
            <input
              value={formState.action_href}
              onChange={(event) => onUpdateForm("action_href", event.target.value)}
              className="input h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelTargetRoles")}</label>
            <textarea
              value={formState.target_roles}
              onChange={(event) => onUpdateForm("target_roles", event.target.value)}
              rows={3}
              placeholder="admin, operator"
              className="input px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelTargetLevels")}</label>
            <textarea
              value={formState.target_membership_levels}
              onChange={(event) => onUpdateForm("target_membership_levels", event.target.value)}
              rows={3}
              placeholder="0, 1, 2"
              className="input px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelTargetPaths")}</label>
            <textarea
              value={formState.target_path_prefixes}
              onChange={(event) => onUpdateForm("target_path_prefixes", event.target.value)}
              rows={3}
              placeholder="/dashboard&#10;/tasks"
              className="input px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelStartsAt")}</label>
            <input
              type="datetime-local"
              value={formState.starts_at}
              onChange={(event) => onUpdateForm("starts_at", event.target.value)}
              className="input h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400">{e("labelEndsAt")}</label>
            <input
              type="datetime-local"
              value={formState.ends_at}
              onChange={(event) => onUpdateForm("ends_at", event.target.value)}
              className="input h-9"
            />
          </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-bear">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">{e("defaultHint")}</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={actionClass("ghost")}>
              {e("cancel")}
            </button>
            <button type="submit" disabled={saving} className={actionClass("ghost")}>
              {saving ? e("saving") : draftLabel}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSubmit(true)}
              className={actionClass("primary")}
            >
              {saving ? e("publishing") : publishLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
