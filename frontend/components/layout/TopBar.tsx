"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { Bell, Wifi, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "next-intl";

const PAGE_KEYS: Record<string, string> = {
  "/dashboard": "dashboard",
  "/consensus": "consensus",
  "/adversarial": "adversarial",
  "/performance": "performance",
  "/alerts": "alerts",
  "/backtest": "backtest",
  "/tasks": "tasks",
  "/partner": "partner",
  "/settings/membership": "membership",
  "/settings/push": "push",
  "/settings": "settings",
};

export function TopBar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const t = useTranslations("nav.topbar");
  const tCommon = useTranslations("nav.common");
  const [time, setTime] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pageKey =
    Object.entries(PAGE_KEYS).find(([path]) =>
      pathname.startsWith(path)
    )?.[1];
  const title = pageKey ? t(`pages.${pageKey}`) : t("defaultTitle");

  const initial = user?.email?.charAt(0).toUpperCase() ?? "U";

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-white/[0.08] px-6 backdrop-blur-md bg-bg-primary/80">
      {/* Page title */}
      <h1 className="text-sm font-medium text-white">{title}</h1>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* System status */}
        <div className="flex items-center gap-2">
          <Wifi size={14} className="text-bull" />
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-bull)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-bull)]" />
          </span>
          <span className="text-xs text-zinc-400">{t("systemOnline")}</span>
        </div>

        {/* Time */}
        <span className="font-mono text-sm text-zinc-300">{time}</span>

        {/* Notification bell */}
        <button
          type="button"
          className="relative rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
          aria-label="֪ͨ"
        >
          <Bell size={18} />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-bear)]" />
        </button>

        {/* User avatar + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            className="group flex h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-[var(--color-accent)]/10 text-xs font-medium text-accent transition-colors hover:bg-[var(--color-accent)]/20"
            title={user?.email ?? ""}
          >
            {initial}
          </button>

          {showMenu && (
            <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border border-white/[0.08] backdrop-blur-md bg-bg-elevated/95 py-1 shadow-xl">
              <div className="border-b border-white/[0.08] px-3 py-2">
                <p className="truncate text-xs text-zinc-400">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <LogOut size={14} />
                {tCommon("logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
