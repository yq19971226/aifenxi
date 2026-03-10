import { BellRing, Eye } from "lucide-react";
import type {
  AdminAnnouncementDeliveriesResponse,
  AdminAnnouncementInfo,
} from "@/lib/api/admin-announcements";
import { actionClass } from "../announcement.constants";
import { formatDateTime } from "../announcement.form";

interface AnnouncementDeliveriesPanelProps {
  target: AdminAnnouncementInfo;
  data: AdminAnnouncementDeliveriesResponse | undefined;
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  onClose: () => void;
  onPageChange: (page: number) => void;
}

export function AnnouncementDeliveriesPanel({
  target,
  data,
  loading,
  error,
  page,
  totalPages,
  onClose,
  onPageChange,
}: AnnouncementDeliveriesPanelProps) {
  return (
    <div className="card-surface rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
            <Eye size={16} className="text-indigo-300" />
            公告留痕
          </h2>
          <p className="mt-1 text-xs text-zinc-500">{target.title}</p>
        </div>
        <button type="button" onClick={onClose} className={actionClass("ghost")}>
          收起
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : error ? (
        <p className="text-sm text-bear">{error}</p>
      ) : data && data.items.length > 0 ? (
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
              {data.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02] last:border-0"
                >
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

      {data && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-4">
          <span className="text-xs text-zinc-500">
            共 {data.total} 条，第 {data.page}/{totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-lg bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] disabled:opacity-30"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded-lg bg-white/[0.06] px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] disabled:opacity-30"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
