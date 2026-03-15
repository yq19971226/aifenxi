"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import { fetchActiveAnnouncements } from "@/lib/api/announcements";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Singleton event dispatcher for the drawer
export const toggleNotificationDrawer = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("toggle-notifications"));
  }
};

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const pathname = usePathname() || "/";
  const { data: active = [] } = useQuery({
    queryKey: ["announcements", "active", pathname],
    queryFn: () => fetchActiveAnnouncements(pathname),
    staleTime: 30000,
  });

  const hasActiveUnread = active.length > 0;

  return (
    <button
      onClick={toggleNotificationDrawer}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 transition-colors",
        className
      )}
      aria-label="消息通知"
    >
      {hasActiveUnread ? (
        <BellRing size={20} className="text-indigo-400 animate-pulse" />
      ) : (
        <Bell size={20} />
      )}
      
      {hasActiveUnread && (
        <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] border border-[#121217]"></span>
        </span>
      )}
    </button>
  );
}
