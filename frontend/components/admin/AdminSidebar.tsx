"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { isNavItemVisible, stripLocalePrefix, type UserRole } from "@/lib/route-permissions";
import { ADMIN_MENU_GROUPS, type AdminMenuGroup } from "./AdminSidebar.config";

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
  const [collapsed, setCollapsed] = useState(false);
  const filteredGroups = useFilteredGroups(userRole);

  return (
    <aside
      className={`hidden md:flex flex-col flex-shrink-0 border-r border-white/[0.06] bg-black/20 transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      <div className="flex items-center justify-end px-2 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
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
    <div className="md:hidden border-b border-white/[0.06] bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200"
      >
        {open ? <X size={15} /> : <Menu size={15} />}
        <span>{t("mobileMenu")}</span>
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

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
      {groups.map((group) => (
        <div key={group.labelKey}>
          {!collapsed && (
            <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
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

              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? "text-zinc-100 bg-white/[0.08]"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                    } ${collapsed ? "justify-center" : ""}`}
                    title={collapsed ? label : undefined}
                  >
                    <Icon size={15} className="flex-shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{label}</span>
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
