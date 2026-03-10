import type { FormEvent } from "react";
import { CalendarClock } from "lucide-react";
import type { AdminAnnouncementInfo } from "@/lib/api/admin-announcements";
import { actionClass } from "../announcement.constants";

interface AnnouncementSchedulePanelProps {
  target: AdminAnnouncementInfo;
  scheduledAt: string;
  saving: boolean;
  error: string | null;
  onScheduledAtChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AnnouncementSchedulePanel({
  target,
  scheduledAt,
  saving,
  error,
  onScheduledAtChange,
  onClose,
  onSubmit,
}: AnnouncementSchedulePanelProps) {
  return (
    <div className="card-surface rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
            <CalendarClock size={16} className="text-amber-300" />
            公告排期
          </h2>
          <p className="mt-1 text-xs text-zinc-500">{target.title}</p>
        </div>
        <button type="button" onClick={onClose} className={actionClass("ghost")}>
          收起
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs text-zinc-400">scheduled_at</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => onScheduledAtChange(event.target.value)}
            className="input h-9"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={actionClass("ghost")}>
            取消
          </button>
          <button type="submit" disabled={saving} className={actionClass("primary")}>
            {saving ? "排期中" : "确认排期"}
          </button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm text-bear">{error}</p> : null}
    </div>
  );
}
