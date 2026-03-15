import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  archiveAdminAnnouncement,
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  publishAdminAnnouncement,
  scheduleAdminAnnouncement,
  unscheduleAdminAnnouncement,
  updateAdminAnnouncement,
} from "@/lib/api/admin-announcements";
import {
  toDraftPayload,
  toIsoOrNull,
  toUpdatePayload,
  type AnnouncementFormState,
} from "../announcement.form";

interface SaveArgs {
  mode: "create" | "edit";
  formState: AnnouncementFormState;
  editingId?: string;
  publishAfterSave?: boolean;
}

interface ScheduleArgs {
  announcementId: string;
  scheduledAt: string;
}

export function useAnnouncementMutations() {
  const queryClient = useQueryClient();

  const invalidateAnnouncements = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ mode, formState, editingId, publishAfterSave }: SaveArgs) => {
      let saved;

      if (mode === "create") {
        saved = await createAdminAnnouncement(toDraftPayload(formState));
      } else {
        if (!editingId) {
          throw new Error("缺少待编辑公告 ID");
        }

        saved = await updateAdminAnnouncement(editingId, toUpdatePayload(formState));
      }

      if (!publishAfterSave) {
        return saved;
      }

      try {
        return await publishAdminAnnouncement(saved.id);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "请在列表中重试发布";
        throw new Error(`内容已保存为草稿，但自动发布失败：${detail}`);
      }
    },
    onSettled: invalidateAnnouncements,
    onError: (error) => {
      console.error("保存公告失败", error);
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ announcementId, scheduledAt }: ScheduleArgs) => {
      const scheduledAtIso = toIsoOrNull(scheduledAt, "scheduled_at");
      if (!scheduledAtIso) {
        throw new Error("请选择排期时间");
      }
      return scheduleAdminAnnouncement(announcementId, scheduledAtIso);
    },
    onSuccess: invalidateAnnouncements,
    onError: (error) => {
      console.error("公告排期失败", error);
    },
  });

  const unscheduleMutation = useMutation({
    mutationFn: unscheduleAdminAnnouncement,
    onSuccess: invalidateAnnouncements,
    onError: (error) => {
      console.error("取消公告排期失败", error);
    },
  });

  const publishMutation = useMutation({
    mutationFn: publishAdminAnnouncement,
    onSuccess: invalidateAnnouncements,
    onError: (error) => {
      console.error("发布公告失败", error);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveAdminAnnouncement,
    onSuccess: invalidateAnnouncements,
    onError: (error) => {
      console.error("归档公告失败", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminAnnouncement,
    onSuccess: invalidateAnnouncements,
    onError: (error) => {
      console.error("删除公告失败", error);
    },
  });

  return {
    saveMutation,
    scheduleMutation,
    unscheduleMutation,
    publishMutation,
    archiveMutation,
    deleteMutation,
  };
}
