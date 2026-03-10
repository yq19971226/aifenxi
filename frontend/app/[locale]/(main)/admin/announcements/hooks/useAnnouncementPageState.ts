import { useCallback, useMemo, useState, type FormEvent } from "react";
import type { AnnouncementDisplayMode } from "@/lib/api/announcements";
import type {
  AdminAnnouncementInfo,
  AdminAnnouncementStatus,
} from "@/lib/api/admin-announcements";
import {
  emptyAnnouncementForm,
  formFromItem,
  toDateTimeInputValue,
  type AnnouncementFormState,
} from "../announcement.form";
import { useAnnouncementDeliveriesQuery } from "./useAnnouncementDeliveriesQuery";
import { useAnnouncementListQuery } from "./useAnnouncementListQuery";
import { useAnnouncementMutations } from "./useAnnouncementMutations";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useAnnouncementPageState(enabled: boolean) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminAnnouncementStatus | "">("");
  const [displayModeFilter, setDisplayModeFilter] = useState<AnnouncementDisplayMode | "">("");
  const [page, setPage] = useState(1);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingItem, setEditingItem] = useState<AdminAnnouncementInfo | null>(null);
  const [formState, setFormState] = useState<AnnouncementFormState>(emptyAnnouncementForm());
  const [formError, setFormError] = useState<string | null>(null);

  const [scheduleTarget, setScheduleTarget] = useState<AdminAnnouncementInfo | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [deliveriesTarget, setDeliveriesTarget] = useState<AdminAnnouncementInfo | null>(null);
  const [deliveriesPage, setDeliveriesPage] = useState(1);

  const filters = useMemo(
    () => ({
      search,
      status: statusFilter,
      displayMode: displayModeFilter,
      page,
    }),
    [displayModeFilter, page, search, statusFilter]
  );

  const announcementsQuery = useAnnouncementListQuery(filters, enabled);
  const deliveriesQuery = useAnnouncementDeliveriesQuery(
    deliveriesTarget?.id ?? null,
    deliveriesPage,
    enabled
  );
  const {
    saveMutation,
    scheduleMutation,
    unscheduleMutation,
    publishMutation,
    archiveMutation,
  } = useAnnouncementMutations();

  const totalPages = useMemo(() => {
    if (!announcementsQuery.data) return 0;
    return Math.max(
      1,
      Math.ceil(announcementsQuery.data.total / announcementsQuery.data.page_size)
    );
  }, [announcementsQuery.data]);

  const deliveryTotalPages = useMemo(() => {
    if (!deliveriesQuery.data) return 0;
    return Math.max(1, Math.ceil(deliveriesQuery.data.total / deliveriesQuery.data.page_size));
  }, [deliveriesQuery.data]);

  const updateForm = useCallback(
    <K extends keyof AnnouncementFormState>(key: K, value: AnnouncementFormState[K]) => {
      setFormState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const openCreate = useCallback(() => {
    setEditorMode("create");
    setEditingItem(null);
    setFormState(emptyAnnouncementForm());
    setFormError(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((item: AdminAnnouncementInfo) => {
    setEditorMode("edit");
    setEditingItem(item);
    setFormState(formFromItem(item));
    setFormError(null);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingItem(null);
    setFormError(null);
  }, []);

  const handleSearch = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }, [searchInput]);

  const changeStatusFilter = useCallback((value: "" | AdminAnnouncementStatus) => {
    setStatusFilter(value);
    setPage(1);
  }, []);

  const changeDisplayModeFilter = useCallback((value: "" | AnnouncementDisplayMode) => {
    setDisplayModeFilter(value);
    setPage(1);
  }, []);

  const runAction = useCallback(async (key: string, action: () => Promise<unknown>, fallback: string) => {
    setActingKey(key);
    setPageError(null);
    try {
      await action();
    } catch (error) {
      setPageError(getErrorMessage(error, fallback));
    } finally {
      setActingKey(null);
    }
  }, []);

  const submitEditor = useCallback(async (publishAfterSave: boolean) => {
    setFormError(null);
    try {
      await saveMutation.mutateAsync({
        mode: editorMode,
        formState,
        editingId: editingItem?.id,
        publishAfterSave,
      });
      closeEditor();
    } catch (error) {
      setFormError(
        getErrorMessage(error, publishAfterSave ? "保存并发布失败" : "保存公告失败")
      );
    }
  }, [closeEditor, editingItem, editorMode, formState, saveMutation]);

  const openSchedule = useCallback((item: AdminAnnouncementInfo) => {
    setScheduleTarget(item);
    setScheduledAt(toDateTimeInputValue(item.scheduled_at));
    setScheduleError(null);
  }, []);

  const closeSchedule = useCallback(() => {
    setScheduleTarget(null);
    setScheduledAt("");
    setScheduleError(null);
  }, []);

  const handleSchedule = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scheduleTarget) return;
    setScheduleError(null);
    try {
      await scheduleMutation.mutateAsync({
        announcementId: scheduleTarget.id,
        scheduledAt,
      });
      closeSchedule();
    } catch (error) {
      setScheduleError(getErrorMessage(error, "公告排期失败"));
    }
  }, [closeSchedule, scheduleMutation, scheduleTarget, scheduledAt]);

  const openDeliveries = useCallback((item: AdminAnnouncementInfo) => {
    setDeliveriesTarget(item);
    setDeliveriesPage(1);
  }, []);

  const closeDeliveries = useCallback(() => {
    setDeliveriesTarget(null);
    setDeliveriesPage(1);
  }, []);

  const handleUnschedule = useCallback((item: AdminAnnouncementInfo) => {
    void runAction(
      `${item.id}:unschedule`,
      () => unscheduleMutation.mutateAsync(item.id),
      "取消公告排期失败"
    );
  }, [runAction, unscheduleMutation]);

  const handlePublish = useCallback((item: AdminAnnouncementInfo) => {
    if (!window.confirm(`确认发布公告《${item.title}》吗？`)) return;
    void runAction(
      `${item.id}:publish`,
      () => publishMutation.mutateAsync(item.id),
      "发布公告失败"
    );
  }, [publishMutation, runAction]);

  const handleArchive = useCallback((item: AdminAnnouncementInfo) => {
    if (!window.confirm(`确认归档公告《${item.title}》吗？`)) return;
    void runAction(
      `${item.id}:archive`,
      () => archiveMutation.mutateAsync(item.id),
      "归档公告失败"
    );
  }, [archiveMutation, runAction]);

  return {
    openCreate,
    filters: {
      searchInput,
      statusFilter,
      displayModeFilter,
      onSearchInputChange: setSearchInput,
      onStatusFilterChange: changeStatusFilter,
      onDisplayModeFilterChange: changeDisplayModeFilter,
      onSubmit: handleSearch,
    },
    editor: {
      isOpen: editorOpen,
      mode: editorMode,
      editingItem,
      formState,
      saving: saveMutation.isPending,
      error: formError,
      onUpdateForm: updateForm,
      onClose: closeEditor,
      onSubmit: submitEditor,
    },
    schedule: {
      target: scheduleTarget,
      scheduledAt,
      saving: scheduleMutation.isPending,
      error: scheduleError,
      onScheduledAtChange: setScheduledAt,
      onClose: closeSchedule,
      onSubmit: handleSchedule,
    },
    list: {
      loading: announcementsQuery.isLoading,
      error: pageError || (announcementsQuery.error ? getErrorMessage(announcementsQuery.error, "查询公告列表失败") : null),
      data: announcementsQuery.data,
      page,
      totalPages,
      actingKey,
      onPageChange: setPage,
      onEdit: openEdit,
      onSchedule: openSchedule,
      onUnschedule: handleUnschedule,
      onPublish: handlePublish,
      onArchive: handleArchive,
      onOpenDeliveries: openDeliveries,
    },
    deliveries: {
      target: deliveriesTarget,
      data: deliveriesQuery.data,
      loading: deliveriesQuery.isLoading,
      error: deliveriesQuery.error ? getErrorMessage(deliveriesQuery.error, "查询公告投递记录失败") : null,
      page: deliveriesPage,
      totalPages: deliveryTotalPages,
      onClose: closeDeliveries,
      onPageChange: setDeliveriesPage,
    },
  };
}
