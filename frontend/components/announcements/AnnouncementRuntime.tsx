"use client";

import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Clock3,
  ExternalLink,
  Megaphone,
  X,
} from "lucide-react";
import {
  fetchActiveAnnouncements,
  postAnnouncementEvent,
  type ActiveAnnouncement,
  type AnnouncementEventPayload,
} from "@/lib/api/announcements";
import { Button } from "@/components/ui/Button";

const EMPTY_LIST: ActiveAnnouncement[] = [];
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function snoozeIso() {
  return new Date(Date.now() + SNOOZE_MS).toISOString();
}

function isExternalHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

function formatPublishTime(value: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

interface AnnouncementCardProps {
  announcement: ActiveAnnouncement;
  actioning: boolean;
  onClose: (announcement: ActiveAnnouncement) => void;
  onConfirm: (announcement: ActiveAnnouncement) => void;
  onSnooze: (announcement: ActiveAnnouncement) => void;
  onAction: (announcement: ActiveAnnouncement) => void;
}

function AnnouncementCard({
  announcement,
  actioning,
  onClose,
  onConfirm,
  onSnooze,
  onAction,
}: AnnouncementCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#121217]/95 shadow-modal backdrop-blur-xl">
      <div className="border-b border-white/[0.06] px-4 py-3 md:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <Megaphone size={13} className="text-indigo-400" />
              <span>站内公告</span>
              {announcement.published_at ? (
                <span className="text-zinc-500 normal-case tracking-normal">
                  {formatPublishTime(announcement.published_at)}
                </span>
              ) : null}
            </div>
            <h3 className="mt-2 text-base font-semibold tracking-tight text-zinc-100 md:text-lg">
              {announcement.title}
            </h3>
            {announcement.summary ? (
              <p className="mt-1 text-sm text-zinc-400">{announcement.summary}</p>
            ) : null}
          </div>
          {!announcement.strong_ack_required ? (
            <button
              type="button"
              onClick={() => onClose(announcement)}
              disabled={actioning}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-40"
              aria-label="关闭公告"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-4 md:px-5">
        <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">
          {announcement.content_md}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/[0.06] px-4 py-3 md:flex-row md:flex-wrap md:items-center md:justify-end md:px-5">
        {announcement.allow_snooze ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={Clock3}
            disabled={actioning}
            onClick={() => onSnooze(announcement)}
            className="justify-center"
          >
            24 小时后提醒
          </Button>
        ) : null}

        {announcement.action_href ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={ExternalLink}
            disabled={actioning}
            onClick={() => onAction(announcement)}
            className="justify-center"
          >
            {announcement.action_text || "查看详情"}
          </Button>
        ) : null}

        {announcement.strong_ack_required ? (
          <Button
            type="button"
            size="sm"
            icon={Check}
            disabled={actioning}
            onClick={() => onConfirm(announcement)}
            className="justify-center"
          >
            我已知晓
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={actioning}
            onClick={() => onClose(announcement)}
            className="justify-center"
          >
            关闭
          </Button>
        )}
      </div>
    </div>
  );
}

export function AnnouncementRuntime() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const queryClient = useQueryClient();
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const { data = EMPTY_LIST } = useQuery({
    queryKey: ["announcements", "active", pathname],
    queryFn: () => fetchActiveAnnouncements(pathname),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const visibleAnnouncements = useMemo(
    () => data.filter((item) => !hiddenIds.includes(item.id)),
    [data, hiddenIds]
  );

  const banners = useMemo(
    () => visibleAnnouncements.filter((item) => item.display_mode === "banner"),
    [visibleAnnouncements]
  );

  const activeModal = useMemo(
    () =>
      visibleAnnouncements.find(
        (item) => item.display_mode === "blocking_modal" || item.display_mode === "modal"
      ) ?? null,
    [visibleAnnouncements]
  );

  useEffect(() => {
    const summary = data.slice(0, 5).map((item) => ({
      id: item.id,
      key: item.announcement_key,
      version: item.version,
      mode: item.display_mode,
    }));
    const duplicateKeys = Array.from(
      data.reduce((acc, item) => {
        acc.set(item.announcement_key, (acc.get(item.announcement_key) || 0) + 1);
        return acc;
      }, new Map<string, number>()).entries()
    )
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ key, count }));
    // #region agent log
    fetch('http://127.0.0.1:7463/ingest/17a3f00d-8f41-4ee8-acfa-f135822078c1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'389b23'},body:JSON.stringify({sessionId:'389b23',runId:'run1',hypothesisId:'H1',location:'frontend/components/announcements/AnnouncementRuntime.tsx:data',message:'announcement runtime received active items',data:{pathname,total:data.length,visible:visibleAnnouncements.length,banners:banners.length,hasModal:Boolean(activeModal),duplicateKeys,items:summary},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [activeModal, banners.length, data, pathname, visibleAnnouncements.length]);

  useEffect(() => {
    const activeIds = new Set(data.map((item) => item.id));
    setHiddenIds((prev) => {
      const next = prev.filter((id) => activeIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [data]);

  useEffect(() => {
    const previousVisibleIds = visibleIdsRef.current;
    const nextVisibleIds = new Set<string>();

    visibleAnnouncements.forEach((announcement) => {
      nextVisibleIds.add(announcement.id);
      if (previousVisibleIds.has(announcement.id)) return;
      const payload: AnnouncementEventPayload = {
        event_type: "shown",
        pathname,
        occurred_at: nowIso(),
        metadata: { source: "announcement_runtime" },
      };
      void postAnnouncementEvent(announcement.id, payload).catch(() => {});
    });

    visibleIdsRef.current = nextVisibleIds;
  }, [visibleAnnouncements, pathname]);

  const hideAnnouncement = (announcementId: string) => {
    setHiddenIds((prev) => (prev.includes(announcementId) ? prev : [...prev, announcementId]));
  };

  const refreshAnnouncementQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["announcements", "active"] });
    void queryClient.invalidateQueries({ queryKey: ["announcements", "history"] });
  };

  const sendEvent = async (
    announcement: ActiveAnnouncement,
    event_type: AnnouncementEventPayload["event_type"],
    extra?: Partial<AnnouncementEventPayload>
  ) => {
    const shouldHide = event_type !== "clicked" || !announcement.strong_ack_required;
    setActioningId(announcement.id);
    try {
      await postAnnouncementEvent(announcement.id, {
        event_type,
        pathname,
        occurred_at: nowIso(),
        metadata: { source: "announcement_runtime" },
        ...extra,
      });
      refreshAnnouncementQueries();
      return true;
    } catch (error) {
      console.error("announcement event write failed", {
        announcementId: announcement.id,
        eventType: event_type,
        error,
      });
      return false;
    } finally {
      if (shouldHide) {
        hideAnnouncement(announcement.id);
      }
      setActioningId(null);
    }
  };

  const handleAction = async (announcement: ActiveAnnouncement) => {
    if (!announcement.action_href) return;
    const href = announcement.action_href;
    await sendEvent(announcement, "clicked");
    if (isExternalHref(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(href);
  };

  if (banners.length === 0 && !activeModal) {
    return null;
  }

  return (
    <>
      {banners.length > 0 ? (
        <div className="sticky top-14 z-30 mx-auto w-full max-w-[1400px] px-3 pt-3 md:px-6">
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {banners.map((announcement) => (
                <motion.div
                  key={announcement.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <AnnouncementCard
                    announcement={announcement}
                    actioning={actioningId === announcement.id}
                    onClose={(item) => void sendEvent(item, "closed")}
                    onConfirm={(item) => void sendEvent(item, "confirmed")}
                    onSnooze={(item) => void sendEvent(item, "snoozed", { snooze_until: snoozeIso() })}
                    onAction={(item) => void handleAction(item)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {activeModal ? (
          <motion.div
            key={activeModal.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-3 py-6 backdrop-blur-sm md:px-6"
            onClick={() => {
              if (!activeModal.strong_ack_required) {
                void sendEvent(activeModal, "closed");
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <AnnouncementCard
                announcement={activeModal}
                actioning={actioningId === activeModal.id}
                onClose={(item) => void sendEvent(item, "closed")}
                onConfirm={(item) => void sendEvent(item, "confirmed")}
                onSnooze={(item) => void sendEvent(item, "snoozed", { snooze_until: snoozeIso() })}
                onAction={(item) => void handleAction(item)}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
