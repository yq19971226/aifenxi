import { useQuery } from "@tanstack/react-query";
import {
  getAdminAnnouncements,
  type AdminAnnouncementQueryParams,
} from "@/lib/api/admin-announcements";
import { PAGE_SIZE } from "../announcement.constants";

export interface AnnouncementListFilters {
  search: string;
  status: AdminAnnouncementQueryParams["status"] | "";
  displayMode: AdminAnnouncementQueryParams["display_mode"] | "";
  page: number;
}

export function useAnnouncementListQuery(filters: AnnouncementListFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-announcements", filters],
    queryFn: () =>
      getAdminAnnouncements({
        search: filters.search || undefined,
        status: filters.status || undefined,
        display_mode: filters.displayMode || undefined,
        page: filters.page,
        page_size: PAGE_SIZE,
      }),
    enabled,
  });
}
