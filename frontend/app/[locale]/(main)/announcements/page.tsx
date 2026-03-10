"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  History,
  MousePointerClick,
  XCircle,
} from "lucide-react";
import { PageTransition } from "@/components/layout/PageTransition";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  fetchAnnouncementHistory,
  type AnnouncementHistoryItem,
} from "@/lib/api/announcements";

const PAGE_SIZE = 20;

function formatDateTime(value: string | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function getEventMeta(item: AnnouncementHistoryItem, t: (key: string) => string) {
  switch (item.last_event) {
    case "confirmed":
      return { label: t('events.confirmed'), icon: CheckCircle2, className: "text-emerald-400" };
    case "clicked":
      return { label: t('events.clicked'), icon: MousePointerClick, className: "text-indigo-400" };
    case "closed":
      return { label: t('events.closed'), icon: XCircle, className: "text-zinc-400" };
    case "snoozed":
      return { label: t('events.snoozed'), icon: Clock3, className: "text-amber-400" };
    case "delivered":
      return { label: t('events.delivered'), icon: BellRing, className: "text-zinc-400" };
    case "failed":
      return { label: t('events.failed'), icon: XCircle, className: "text-red-400" };
    default:
      return { label: t('events.none'), icon: History, className: "text-zinc-500" };
  }
}

function AnnouncementHistoryCard({ item, index }: { item: AnnouncementHistoryItem; index: number }) {
  const t = useTranslations('announcements');
  const eventMeta = getEventMeta(item, t);
  const EventIcon = eventMeta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="card p-4 md:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
              {item.display_mode}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                item.status === "archived"
                  ? "bg-zinc-500/[0.08] text-zinc-400"
                  : "bg-indigo-500/[0.08] text-indigo-300"
              }`}
            >
              {item.status === "archived" ? t('card.archived') : t('card.published')}
            </span>
          </div>

          <h2 className="mt-3 text-base font-semibold tracking-tight text-zinc-100 md:text-lg">
            {item.title}
          </h2>
          {item.summary ? <p className="mt-1 text-sm text-zinc-400">{item.summary}</p> : null}

          <div className="mt-4 grid gap-3 text-sm text-zinc-500 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{t('card.publishedAt')}</p>
              <p className="mt-1 text-sm text-zinc-300">{formatDateTime(item.published_at)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{t('card.archivedAt')}</p>
              <p className="mt-1 text-sm text-zinc-300">{formatDateTime(item.archived_at)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{t('card.lastAction')}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <EventIcon size={14} className={eventMeta.className} />
                <span className="text-sm text-zinc-300">{eventMeta.label}</span>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{t('card.confirmedAt')}</p>
              <p className="mt-1 text-sm text-zinc-300">{formatDateTime(item.confirmed_at)}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard"
            className="btn-ghost inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs"
          >
            <ExternalLink size={13} />
            {t('card.backHome')}
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

export default function AnnouncementsPage() {
  const t = useTranslations('announcements');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["announcements", "history", page],
    queryFn: () => fetchAnnouncementHistory(page, PAGE_SIZE),
    placeholderData: (previous) => previous,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 text-lg font-semibold text-white md:text-xl">
              <BellRing size={20} className="text-indigo-400" />
              {t('title')}
            </h1>
            <p className="mt-1 text-xs text-zinc-500 md:text-sm">
              {t('subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 md:text-sm">
            <span>{isFetching ? t('refreshing') : t('totalRecords', { total })}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-36 rounded-lg skeleton" />
            ))}
          </div>
        ) : null}

        {isError ? (
          <div className="card p-8">
            <EmptyState
              icon={BellRing}
              title={t('error.loadFailed')}
              description=""
            />
          </div>
        ) : null}

        {!isLoading && !isError && items.length === 0 ? (
          <div className="card p-8">
            <EmptyState
              icon={History}
              title={t('empty.title')}
              description={t('empty.description')}
            />
          </div>
        ) : null}

        {!isLoading && !isError && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item, index) => (
              <AnnouncementHistoryCard key={item.id} item={item} index={index} />
            ))}
          </div>
        ) : null}

        {!isLoading && !isError && totalPages > 1 ? (
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="text-xs text-zinc-500 md:text-sm">
              {t('pagination.page', { current: page, total: totalPages })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={ChevronLeft}
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                {t('pagination.prev')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={ChevronRight}
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                {t('pagination.next')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </PageTransition>
  );
}
