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
    <div className="relative overflow-hidden rounded-2xl bg-black/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.8)] p-6">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />

      <div className="relative z-10 mb-6 flex items-center justify-between gap-4 border-b border-white/[0.04] pb-4">
        <div>
          <h2 className="text-lg font-black tracking-widest uppercase text-white drop-shadow-sm">{title}</h2>
          <p className="mt-1.5 text-xs text-zinc-400 font-mono tracking-tight">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div className="relative z-10 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] px-5 py-3.5">
        <p className="text-[13px] text-indigo-200/80">{e("simpleHint")}</p>
        <button type="button" onClick={() => setShowAdvanced((prev) => !prev)} className="text-xs font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20">
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
        <div className="relative z-10 grid gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelTitle")}</label>
            <input
              value={formState.title}
              onChange={(event) => onUpdateForm("title", event.target.value)}
              className="h-11 rounded-lg border border-white/[0.08] bg-black/40 px-4 text-sm text-white focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium"
              placeholder="Announcement Title"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelContent")}</label>
            <textarea
              value={formState.content_md}
              onChange={(event) => onUpdateForm("content_md", event.target.value)}
              rows={8}
              className="min-h-[200px] resize-y rounded-lg border border-white/[0.08] bg-black/40 px-4 py-3 text-sm text-zinc-300 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono leading-relaxed"
              placeholder="Write in Markdown..."
            />
          </div>
        </div>

        {showAdvanced ? (
          <div className="relative z-10 grid gap-6 rounded-xl border border-white/[0.04] bg-white/[0.01] p-5 md:grid-cols-2 xl:grid-cols-3">
            {/* Same fields with updated labels and inputs */}
            <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-1">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelDisplayMode")}</label>
              <select
                value={formState.display_mode}
                onChange={(event) => onUpdateForm("display_mode", event.target.value as AnnouncementDisplayMode)}
                className="h-10 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 text-sm text-zinc-200 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
              >
                {DISPLAY_MODE_OPTIONS.filter((option) => option.value).map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelSummary")}</label>
              <input
                value={formState.summary}
                onChange={(event) => onUpdateForm("summary", event.target.value)}
                className="h-10 rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm text-zinc-200 focus:border-indigo-500/50 focus:outline-none transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelKey")}</label>
              <input
                value={formState.announcement_key}
                onChange={(event) => onUpdateForm("announcement_key", event.target.value)}
                disabled={mode === "edit"}
                className="h-10 rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm font-mono text-zinc-400 disabled:opacity-50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelPriority")}</label>
              <input
                type="number"
                value={formState.priority}
                onChange={(event) => onUpdateForm("priority", event.target.value)}
                className="h-10 rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm font-mono text-zinc-200 focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="flex items-center gap-6 pt-5">
              <label className="flex items-center gap-2.5 text-sm text-zinc-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.display_mode === "blocking_modal" ? true : formState.strong_ack_required}
                  onChange={(event) => onUpdateForm("strong_ack_required", event.target.checked)}
                  disabled={formState.display_mode === "blocking_modal"}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900 h-4 w-4"
                />
                {e("labelStrongAck")}
              </label>
              <label className="flex items-center gap-2.5 text-sm text-zinc-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.allow_snooze}
                  onChange={(event) => onUpdateForm("allow_snooze", event.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900 h-4 w-4"
                />
                {e("labelAllowSnooze")}
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelActionText")}</label>
              <input
                value={formState.action_text}
                onChange={(event) => onUpdateForm("action_text", event.target.value)}
                className="h-10 rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm text-zinc-200 focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2 xl:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelActionHref")}</label>
              <input
                value={formState.action_href}
                onChange={(event) => onUpdateForm("action_href", event.target.value)}
                className="h-10 rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm font-mono text-zinc-200 focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelTargetRoles")}</label>
              <textarea
                value={formState.target_roles}
                onChange={(event) => onUpdateForm("target_roles", event.target.value)}
                rows={2}
                placeholder="admin, operator"
                className="resize-y rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm font-mono text-zinc-300 focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelTargetLevels")}</label>
              <textarea
                value={formState.target_membership_levels}
                onChange={(event) => onUpdateForm("target_membership_levels", event.target.value)}
                rows={2}
                placeholder="0, 1, 2"
                className="resize-y rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm font-mono text-zinc-300 focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelTargetPaths")}</label>
              <textarea
                value={formState.target_path_prefixes}
                onChange={(event) => onUpdateForm("target_path_prefixes", event.target.value)}
                rows={2}
                placeholder="/dashboard&#10;/tasks"
                className="resize-y rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm font-mono text-zinc-300 focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelStartsAt")}</label>
              <input
                type="datetime-local"
                value={formState.starts_at}
                onChange={(event) => onUpdateForm("starts_at", event.target.value)}
                className="h-10 rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm font-mono text-zinc-200 focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{e("labelEndsAt")}</label>
              <input
                type="datetime-local"
                value={formState.ends_at}
                onChange={(event) => onUpdateForm("ends_at", event.target.value)}
                className="h-10 rounded-lg border border-white/[0.08] bg-black/40 px-3 text-sm font-mono text-zinc-200 focus:border-indigo-500/50 transition-all"
              />
            </div>
          </div>
        ) : null}

        {error ? <p className="relative z-10 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm font-medium text-red-400">{error}</p> : null}

        <div className="relative z-10 mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.04] pt-6">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">{e("defaultHint")}</p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-all">
              {e("cancel")}
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-bold text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 transition-all disabled:opacity-50">
              {saving ? e("saving") : draftLabel}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSubmit(true)}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all disabled:opacity-50"
            >
              {saving ? e("publishing") : publishLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
