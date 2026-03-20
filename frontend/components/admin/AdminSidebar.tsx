"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { isNavItemVisible, stripLocalePrefix, type UserRole } from "@/lib/route-permissions";
import { ADMIN_MENU_GROUPS, type AdminMenuGroup } from "./AdminSidebar.config";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminBadges } from "@/lib/api/admin-dashboard";

function useFilteredGroups(userRole: UserRole): AdminMenuGroup[] {
  return ADMIN_MENU_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isNavItemVisible(item.href, userRole)),
    }))
    .filter((group) => group.items.length > 0);
}

interface AdminSidebarProps {
  userRole: UserRole;
}

export function AdminSidebar({ userRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav.sidebar");
  const [collapsed, setCollapsed] = useState(false);
  const filteredGroups = useFilteredGroups(userRole);

  return (
    <aside
      className={`hidden md:flex flex-col flex-shrink-0 border-r border-white/[0.06] bg-[#09090b]/95 backdrop-blur-xl transition-[width] duration-300 ease-in-out relative ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-32 bg-indigo-500/5 blur-[50px] pointer-events-none" />
      <div className="flex items-center justify-end px-2 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
          aria-label={collapsed ? t("expand") : t("collapse")}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <SidebarNav groups={filteredGroups} pathname={pathname} collapsed={collapsed} />
    </aside>
  );
}

export function AdminMobileNav({ userRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const filteredGroups = useFilteredGroups(userRole);
  const t = useTranslations("admin.sidebar");

  return (
    <div className="md:hidden border-b border-white/[0.06] bg-[#09090b]/95 backdrop-blur-xl sticky top-0 z-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-sm text-zinc-300 hover:text-white transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-white/[0.04] border border-white/[0.06] group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 group-hover:text-indigo-400 transition-all">
            {open ? <X size={16} /> : <Menu size={16} />}
          </div>
          <span className="font-bold tracking-wide uppercase text-xs">{t("mobileMenu")}</span>
        </div>
        <div className="h-[1px] flex-1 bg-gradient-to-r from-white/[0.08] to-transparent mx-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div onClick={() => setOpen(false)}>
              <SidebarNav groups={filteredGroups} pathname={pathname} collapsed={false} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarNav({
  groups,
  pathname,
  collapsed,
}: {
  groups: AdminMenuGroup[];
  pathname: string;
  collapsed: boolean;
}) {
  const t = useTranslations("admin.sidebar");

  const { data: badges } = useQuery({
    queryKey: ["adminBadges"],
    queryFn: fetchAdminBadges,
    refetchInterval: 30000, // 轮询: 30s
  });

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
      {groups.map((group) => (
        <div key={group.labelKey}>
          {!collapsed && (
            <div className="px-4 pb-2 pt-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500/80">
              {t(`groups.${group.labelKey}`)}
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const normalizedPath = stripLocalePrefix(pathname);
              const active =
                normalizedPath === item.href ||
                normalizedPath.startsWith(item.href + "/");
              const Icon = item.icon;
              const label = t(`items.${item.labelKey}`);
              const badgeCount = item.badgeKey && badges ? badges[item.badgeKey] : 0;
              const hasBadge = badgeCount > 0;
              const badgeColorClass = item.badgeColor === "red" ? "bg-red-500/10 text-red-500" :
                                      item.badgeColor === "amber" ? "bg-amber-500/10 text-amber-500" :
                                      item.badgeColor === "blue" ? "bg-blue-500/10 text-blue-500" :
                                      "bg-white/10 text-white";

              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center rounded-xl px-3 py-2.5 text-sm transition-all relative overflow-hidden group ${
                      active
                        ? "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)] font-bold"
                        : item.frequency === "high"
                        ? "text-zinc-300 hover:text-white hover:bg-white/[0.06] border border-transparent font-medium"
                        : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent font-medium"
                    } ${collapsed ? "justify-center mx-2" : "justify-between mx-3"}`}
                    title={collapsed ? label : undefined}
                  >
                    {active && (
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon size={16} className={`flex-shrink-0 transition-transform group-hover:scale-110 ${active ? "text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" : item.frequency === "high" ? "text-zinc-400 group-hover:text-zinc-300" : ""}`} />
                      {!collapsed && (
                        <span className="truncate">{label}</span>
                      )}
                      {item.frequency === "high" && !collapsed && !active && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 ml-2 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      )}
                    </div>
                    {!collapsed && hasBadge && (
                      <span className={`ml-2 flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-md text-[10px] font-black font-mono leading-none border border-current/[0.15] tracking-tight ${badgeColorClass}`}>
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                    {collapsed && hasBadge && (
                      <span className={`absolute right-1 top-1 h-2 w-2 rounded-full shadow-[0_0_5px_currentColor] ${badgeColorClass}`} />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
