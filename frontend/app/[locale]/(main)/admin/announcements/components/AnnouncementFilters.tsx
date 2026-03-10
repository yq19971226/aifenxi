import type { FormEvent } from "react";
import type { AnnouncementDisplayMode } from "@/lib/api/announcements";
import type { AdminAnnouncementStatus } from "@/lib/api/admin-announcements";
import { DISPLAY_MODE_OPTIONS, STATUS_OPTIONS } from "../announcement.constants";

interface AnnouncementFiltersProps {
  searchInput: string;
  statusFilter: "" | AdminAnnouncementStatus;
  displayModeFilter: "" | AnnouncementDisplayMode;
  onSearchInputChange: (value: string) => void;
  onStatusFilterChange: (value: "" | AdminAnnouncementStatus) => void;
  onDisplayModeFilterChange: (value: "" | AnnouncementDisplayMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AnnouncementFilters({
  searchInput,
  statusFilter,
  displayModeFilter,
  onSearchInputChange,
  onStatusFilterChange,
  onDisplayModeFilterChange,
  onSubmit,
}: AnnouncementFiltersProps) {
  return (
    <form onSubmit={onSubmit} className="card-surface flex flex-wrap items-end gap-4 rounded-lg p-5">
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <label htmlFor="announcement-search" className="text-xs text-zinc-400">
          搜索
        </label>
        <input
          id="announcement-search"
          type="text"
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder="标题、摘要或公告 key"
          className="input h-9"
        />
      </div>

      <div className="flex min-w-[140px] flex-col gap-1.5">
        <label htmlFor="announcement-status-filter" className="text-xs text-zinc-400">
          状态
        </label>
        <select
          id="announcement-status-filter"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as "" | AdminAnnouncementStatus)}
          className="input h-9"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[140px] flex-col gap-1.5">
        <label htmlFor="announcement-display-filter" className="text-xs text-zinc-400">
          展示方式
        </label>
        <select
          id="announcement-display-filter"
          value={displayModeFilter}
          onChange={(event) => onDisplayModeFilterChange(event.target.value as "" | AnnouncementDisplayMode)}
          className="input h-9"
        >
          {DISPLAY_MODE_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn-primary h-9 shrink-0 px-5 text-sm font-medium">
        搜索
      </button>
    </form>
  );
}
