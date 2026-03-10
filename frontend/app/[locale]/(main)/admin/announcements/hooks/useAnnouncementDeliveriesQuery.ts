import { useQuery } from "@tanstack/react-query";
import { getAnnouncementDeliveries } from "@/lib/api/admin-announcements";
import { DELIVERY_PAGE_SIZE } from "../announcement.constants";

export function useAnnouncementDeliveriesQuery(
  announcementId: string | null,
  page: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["admin-announcement-deliveries", announcementId, page],
    queryFn: () => {
      if (!announcementId) {
        throw new Error("缺少公告 ID");
      }
      return getAnnouncementDeliveries(announcementId, page, DELIVERY_PAGE_SIZE);
    },
    enabled: enabled && Boolean(announcementId),
  });
}
