"use client";

import { useTranslations } from "next-intl";
import { Megaphone, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AnnouncementDeliveriesPanel } from "./components/AnnouncementDeliveriesPanel";
import { AnnouncementEditorPanel } from "./components/AnnouncementEditorPanel";
import { AnnouncementFilters } from "./components/AnnouncementFilters";
import { AnnouncementSchedulePanel } from "./components/AnnouncementSchedulePanel";
import { AnnouncementTable } from "./components/AnnouncementTable";
import { useAnnouncementPageState } from "./hooks/useAnnouncementPageState";

export default function AdminAnnouncementsPage() {
  const t = useTranslations("admin");
  const { user, loading: authLoading } = useAuth();
  const isAdmin = Boolean(user?.is_admin || user?.role === "admin");
  const { openCreate, filters, editor, schedule, list, deliveries } = useAnnouncementPageState(isAdmin);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-zinc-500">{t("announcements.noAccess")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-200">
            <Megaphone size={18} className="text-indigo-300" />
            {t("announcements.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{t("announcements.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium"
        >
          <Plus size={16} />
          {t("announcements.createButton")}
        </button>
      </div>

      <AnnouncementFilters {...filters} />

      {editor.isOpen ? (
        <AnnouncementEditorPanel
          key={`${editor.mode}:${editor.editingItem?.id ?? "create"}`}
          mode={editor.mode}
          editingItem={editor.editingItem}
          formState={editor.formState}
          saving={editor.saving}
          error={editor.error}
          onUpdateForm={editor.onUpdateForm}
          onClose={editor.onClose}
          onSubmit={editor.onSubmit}
        />
      ) : null}

      {schedule.target ? (
        <AnnouncementSchedulePanel
          target={schedule.target}
          scheduledAt={schedule.scheduledAt}
          saving={schedule.saving}
          error={schedule.error}
          onScheduledAtChange={schedule.onScheduledAtChange}
          onClose={schedule.onClose}
          onSubmit={schedule.onSubmit}
        />
      ) : null}

      {list.loading ? (
        <div className="flex justify-center py-12">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : null}

      {list.error && !list.loading ? (
        <div className="rounded-lg border border-[var(--color-bear)]/30 bg-white/[0.04] p-6 text-center">
          <p className="text-sm text-bear">{list.error}</p>
        </div>
      ) : null}

      {!list.loading && list.data ? (
        <AnnouncementTable
          data={list.data}
          page={list.page}
          totalPages={list.totalPages}
          actingKey={list.actingKey}
          onPageChange={list.onPageChange}
          onEdit={list.onEdit}
          onSchedule={list.onSchedule}
          onUnschedule={list.onUnschedule}
          onPublish={list.onPublish}
          onArchive={list.onArchive}
          onOpenDeliveries={list.onOpenDeliveries}
        />
      ) : null}

      {deliveries.target ? (
        <AnnouncementDeliveriesPanel
          target={deliveries.target}
          data={deliveries.data}
          loading={deliveries.loading}
          error={deliveries.error}
          page={deliveries.page}
          totalPages={deliveries.totalPages}
          onClose={deliveries.onClose}
          onPageChange={deliveries.onPageChange}
        />
      ) : null}
    </div>
  );
}
