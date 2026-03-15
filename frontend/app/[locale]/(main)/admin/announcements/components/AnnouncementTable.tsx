import { useTranslations } from "next-intl";
import { BellRing, CalendarClock, Eye, PencilLine, Send, Trash2 } from "lucide-react";
import type { AdminAnnouncementInfo, AdminAnnouncementListResponse } from "@/lib/api/admin-announcements";
import {
  MODE_LABEL,
  MODE_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  actionClass,
} from "../announcement.constants";
import { formatDateTime } from "../announcement.form";

interface AnnouncementTableProps {
  data: AdminAnnouncementListResponse;
  page: number;
  totalPages: number;
  actingKey: string | null;
  onPageChange: (page: number) => void;
  onEdit: (item: AdminAnnouncementInfo) => void;
  onSchedule: (item: AdminAnnouncementInfo) => void;
  onUnschedule: (item: AdminAnnouncementInfo) => void;
  onPublish: (item: AdminAnnouncementInfo) => void;
  onArchive: (item: AdminAnnouncementInfo) => void;
  onDelete: (item: AdminAnnouncementInfo) => void;
  onOpenDeliveries: (item: AdminAnnouncementInfo) => void;
}

export function AnnouncementTable({
  data,
  page,
  totalPages,
  actingKey,
  onPageChange,
  onEdit,
  onSchedule,
  onUnschedule,
  onPublish,
  onArchive,
  onDelete,
  onOpenDeliveries,
}: AnnouncementTableProps) {
  const t = useTranslations("admin.announcements");

  if (data.items.length === 0) {
    return (
      <div className="card-surface flex flex-col items-center justify-center gap-3 rounded-lg px-6 py-14 text-center">
        <BellRing size={22} className="text-zinc-500" />
        <div>
          <p className="text-sm font-medium text-zinc-200">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-zinc-500">{t("empty.hint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface overflow-hidden rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
              <th className="px-5 py-3 font-medium">{t("table.title")}</th>
              <th className="px-5 py-3 font-medium">{t("table.version")}</th>
              <th className="px-5 py-3 font-medium">{t("table.displayMode")}</th>
              <th className="px-5 py-3 font-medium">{t("table.status")}</th>
              <th className="px-5 py-3 font-medium">{t("table.priority")}</th>
              <th className="px-5 py-3 font-medium">{t("table.time")}</th>
              <th className="px-5 py-3 font-medium text-right">{t("table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => {
              const editLabel =
                item.status === "published" || item.status === "archived" ? t("actions.newVersion") : t("actions.edit");
              const canEdit = item.status !== "scheduled";

              return (
                <tr
                  key={item.id}
                  className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02] last:border-0"
                >
                  <td className="px-5 py-4 align-top">
                    <div className="max-w-[320px]">
                      <p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">{item.announcement_key}</p>
                      {item.summary ? (
                        <p className="mt-2 line-clamp-2 text-xs text-zinc-400">{item.summary}</p>
                      ) : null}
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
                      {item.updated_at ? <p>{t("table.timeUpdated")}：{formatDateTime(item.updated_at)}</p> : null}
                      {item.published_at ? <p>{t("table.timePublished")}：{formatDateTime(item.published_at)}</p> : null}
                      {item.scheduled_at ? <p>{t("table.timeScheduled")}：{formatDateTime(item.scheduled_at)}</p> : null}
                      {!item.updated_at && !item.published_at && !item.scheduled_at ? <p>—</p> : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      {canEdit ? (
                        <button type="button" onClick={() => onEdit(item)} className={actionClass("ghost")}>
                          <span className="inline-flex items-center gap-1">
                            <PencilLine size={12} />
                            {editLabel}
                          </span>
                        </button>
                      ) : null}

                      {item.status === "draft" ? (
                        <button type="button" onClick={() => onSchedule(item)} className={actionClass("ghost")}>
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock size={12} />
                            {t("actions.schedule")}
                          </span>
                        </button>
                      ) : null}

                      {item.status === "scheduled" ? (
                        <button
                          type="button"
                          disabled={actingKey === `${item.id}:unschedule`}
                          onClick={() => onUnschedule(item)}
                          className={actionClass("ghost")}
                        >
                          {actingKey === `${item.id}:unschedule` ? t("actions.processing") : t("actions.unschedule")}
                        </button>
                      ) : null}

                      {item.status === "draft" || item.status === "scheduled" ? (
                        <button
                          type="button"
                          disabled={actingKey === `${item.id}:publish`}
                          onClick={() => onPublish(item)}
                          className={actionClass("primary")}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Send size={12} />
                            {actingKey === `${item.id}:publish` ? t("actions.publishing") : t("actions.publish")}
                          </span>
                        </button>
                      ) : null}

                      {item.status === "published" ? (
                        <button
                          type="button"
                          disabled={actingKey === `${item.id}:archive`}
                          onClick={() => onArchive(item)}
                          className={actionClass("danger")}
                        >
                          {actingKey === `${item.id}:archive` ? t("actions.archiving") : t("actions.archive")}
                        </button>
                      ) : null}

                      <button type="button" onClick={() => onOpenDeliveries(item)} className={actionClass("ghost")}>
                        <span className="inline-flex items-center gap-1">
                          <Eye size={12} />
                          {t("actions.trace")}
                        </span>
                      </button>

                      {(item.status === "draft" || item.status === "archived") ? (
                        <button
                          type="button"
                          disabled={actingKey === `${item.id}:delete`}
                          onClick={() => onDelete(item)}
                          className={actionClass("danger")}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Trash2 size={12} />
                            {actingKey === `${item.id}:delete` ? "删除中..." : "删除"}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3">
          <span className="text-xs text-zinc-500">
            {t("pagination.summary", { total: data.total, page: data.page, totalPages })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-lg bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] disabled:opacity-30"
            >
              {t("pagination.prev")}
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded-lg bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] disabled:opacity-30"
            >
              {t("pagination.next")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
