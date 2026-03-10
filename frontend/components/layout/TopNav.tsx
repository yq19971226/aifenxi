"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { LogoMark } from "@/components/ui/Logo";
import {
  LayoutDashboard,
  Bell,
  BellRing,
  Megaphone,
  Settings,
  ChevronDown,
  LogOut,
  MoreHorizontal,
  Menu,
  X,
  Brain,
  TrendingUp,
  Shield,
  ShieldCheck,
  Activity,
  Gift,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAlertSocket } from "@/lib/ws/useAlertSocket";
import { useQuery } from "@tanstack/react-query";
import { fetchActiveAnnouncements, type ActiveAnnouncement } from "@/lib/api/announcements";
import { type UserRole, ROLE_LEVEL, isNavItemVisible, stripLocalePrefix } from "@/lib/route-permissions";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import type { UserInfo } from "@/lib/api/auth";


const LEVEL_NAMES: Record<number, string> = { 1: "专业版", 2: "旗舰版" };

function MembershipExpiry({ user }: { user: UserInfo | null }) {
  if (!user || user.is_admin || user.membership_level <= 0) return null;
  const expiresAt = user.membership_expires_at;
  if (!expiresAt) return null;

  const expDate = new Date(expiresAt);
  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return null;

  const levelName = LEVEL_NAMES[user.membership_level] ?? "会员";
  const dateStr = expDate.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  const urgent = diffDays <= 7;

  return (
    <p className={`text-xs mt-1 ${urgent ? "text-red-400" : "text-zinc-500"}`}>
      {urgent && <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 mr-1 animate-pulse align-middle" />}
      {levelName} · {diffDays <= 30 ? `还剩 ${diffDays} 天` : `到期 ${dateStr}`}
    </p>
  );
}


interface SubNavItem {
  key: string; // Translation key
  href: string;
  minRole?: UserRole;
  featureFlag?: string;
}

interface NavItem {
  key: string; // Translation key
  href: string;
  icon: LucideIcon;
  minRole: UserRole;
  children?: SubNavItem[];
  featureFlag?: string;
}


const navItems: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, minRole: "user" },
  { key: "consensus", href: "/consensus", icon: Brain, minRole: "user" },
  { key: "playbook", href: "/playbook-sim", icon: Activity, minRole: "user", featureFlag: "playbook" },
  { key: "leaderboard", href: "/leaderboard", icon: TrendingUp, minRole: "user", featureFlag: "leaderboard" },
  { key: "alerts", href: "/alerts", icon: Shield, minRole: "user", featureFlag: "alerts" },
  {
    key: "growth",
    href: "/tasks",
    icon: Gift,
    minRole: "user",
    children: [
      { key: "tasks", href: "/tasks", featureFlag: "task" },
      { key: "partner", href: "/partner", featureFlag: "partner" },
    ],
  },
  {
    key: "settings",
    href: "/settings",
    icon: Settings,
    minRole: "user",
    children: [
      { key: "membership", href: "/settings/membership" },
      { key: "push", href: "/settings/push", featureFlag: "push" },
    ],
  },
  { key: "admin", href: "/admin", icon: ShieldCheck, minRole: "operator" },
];


export { navItems };
export type { NavItem, SubNavItem };


function DropdownMenu({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -2, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -2, scale: 0.98 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      className={`absolute top-full z-50 mt-2 min-w-[180px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#18181b] p-1 shadow-dropdown ${className}`}
    >
      {children}
    </motion.div>
  );
}


export function TopNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const t = useTranslations('nav');
  const locale = useLocale();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(Infinity);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const moreRef = useRef<HTMLDivElement>(null);
  const navContainerRef = useRef<HTMLElement>(null);
  const itemWidthsRef = useRef<number[]>([]);
  const measureRef = useRef<HTMLDivElement>(null);

  const initial = user?.email?.charAt(0).toUpperCase() ?? "U";
  const userRole: UserRole = user?.role ?? "user";
  const { unreadCount: alertCount, clearUnread: clearAlertCount } = useAlertSocket();

  const { data: activeAnnouncements = [] } = useQuery<ActiveAnnouncement[]>({
    queryKey: ["announcements", "active", pathname],
    queryFn: () => fetchActiveAnnouncements(pathname ?? "/"),
    staleTime: 30_000,
    retry: 1,
  });
  const announcementCount = activeAnnouncements.filter((a) => a.display_mode === "banner").length;

  // Feature flags (tri-state: active / maintenance / hidden)
  const { flags: featureFlags } = useFeatureFlags();

  // Filter nav items by shared route-permissions + feature flags
  const filteredItems = useMemo(
    () =>
      navItems
        .map((item) => {
          if (!item.children) return item;
          const filteredChildren = item.children.filter((child) => {
            if (!isNavItemVisible(child.href, userRole)) return false;
            if (child.featureFlag && featureFlags[child.featureFlag] === "hidden") return false;
            return true;
          });
          return { ...item, children: filteredChildren };
        })
        .filter((item) => {
          if (ROLE_LEVEL[userRole] < ROLE_LEVEL[item.minRole]) return false;
          if (item.featureFlag && featureFlags[item.featureFlag] === "hidden") return false;
          if (item.children && item.children.length === 0) return false;
          return true;
        }),
    [userRole, featureFlags]
  );

  // ── Measure item widths once ──
  useEffect(() => {
    if (!measureRef.current) return;
    const children = measureRef.current.children;
    const widths: number[] = [];
    for (let i = 0; i < children.length; i++) {
      widths.push((children[i] as HTMLElement).offsetWidth);
    }
    itemWidthsRef.current = widths;
  }, [filteredItems.length]);

  // ── Calculate how many items fit ──
  const recalculate = useCallback(() => {
    if (!navContainerRef.current || itemWidthsRef.current.length === 0) return;
    const containerWidth = navContainerRef.current.offsetWidth;
    const moreButtonWidth = 44;
    const gap = 4;
    let usedWidth = 0;
    let count = 0;

    for (let i = 0; i < itemWidthsRef.current.length; i++) {
      const nextWidth = itemWidthsRef.current[i] + (i > 0 ? gap : 0);
      const remainingItems = itemWidthsRef.current.length - (i + 1);
      const needsMore = remainingItems > 0;
      if (usedWidth + nextWidth + (needsMore ? moreButtonWidth + gap : 0) > containerWidth) {
        break;
      }
      usedWidth += nextWidth;
      count++;
    }

    if (count >= itemWidthsRef.current.length) {
      setVisibleCount(Infinity);
    } else {
      setVisibleCount(Math.max(1, count));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(recalculate, 50);
    const ro = new ResizeObserver(() => recalculate());
    if (navContainerRef.current) ro.observe(navContainerRef.current);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, [recalculate, filteredItems.length]);

  const shownItems = visibleCount === Infinity
    ? filteredItems
    : filteredItems.slice(0, visibleCount);
  const overflowItems = visibleCount === Infinity
    ? []
    : filteredItems.slice(visibleCount);


  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      const clickedInsideDropdown = Object.values(dropdownRefs.current).some(
        (ref) => ref && ref.contains(e.target as Node)
      );
      if (!clickedInsideDropdown) setOpenDropdown(null);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const normalizedPath = stripLocalePrefix(pathname);
  const isActive = (href: string) =>
    normalizedPath === href || normalizedPath.startsWith(href + "/");

  const hasActiveOverflow = overflowItems.some(
    (item) => isActive(item.href) || item.children?.some((c) => isActive(c.href))
  );

  return (
    <>
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-white/[0.05] bg-black/40 px-3 md:px-6 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setMobileMenuOpen((v) => !v)}
        className="mr-2 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] md:hidden"
        aria-label={t('common.menu')}
      >
        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <Link href="/dashboard" className="mr-4 md:mr-10 flex-shrink-0 flex items-center gap-2 group">
        <LogoMark size={22} className="transition-transform group-hover:scale-105" />
        <span className="text-sm font-semibold text-zinc-100 select-none transition-colors group-hover:text-white">
          <span className="tracking-[0.18em]">AXIOM</span>
          <span className="text-zinc-500 font-normal ml-1">洞察</span>
        </span>
      </Link>

      <div
        ref={measureRef}
        className="pointer-events-none invisible absolute hidden md:flex items-center gap-1"
        aria-hidden="true"
      >
        {filteredItems.map((item) => (
          <div
            key={item.href + "-measure"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm whitespace-nowrap"
          >
            <span>{t(`main.${item.key}`)}</span>
            {item.children && <ChevronDown size={11} />}
          </div>
        ))}
      </div>

      <nav ref={navContainerRef} className="hidden md:flex flex-1 items-center gap-1 overflow-x-clip overflow-y-visible">
        {shownItems.map((item) => {
          const hasChildren = item.children && item.children.length > 0;
          const active = isActive(item.href) || (item.children?.some((c) => isActive(c.href)) ?? false);

          if (hasChildren) {
            const isOpen = openDropdown === item.href;
            return (
              <div
                key={item.href}
                className="relative flex-shrink-0"
                ref={(el) => { dropdownRefs.current[item.href] = el; }}
              >
                <button
                  type="button"
                  onClick={() => setOpenDropdown(isOpen ? null : item.href)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                    active
                      ? "text-zinc-100 bg-white/[0.06]"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="whitespace-nowrap">{t(`main.${item.key}`)}</span>
                  <ChevronDown
                    size={11}
                    className={`transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isOpen && item.children && (
                    <DropdownMenu className="left-0">
                      {item.children.map((child) => {
                        const childActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setOpenDropdown(null)}
                          >
                            <div
                              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                                childActive
                                  ? "text-zinc-100 bg-white/[0.06]"
                                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                              }`}
                            >
                              {t(`settings.${child.key}`)}
                              {child.featureFlag && featureFlags[child.featureFlag] === "maintenance" && (
                                <span className="ml-1.5 inline-block rounded bg-amber-500/15 px-1 py-px text-xs font-medium text-amber-400 leading-tight">
                                  {t('common.maintenance')}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </DropdownMenu>
                  )}
                </AnimatePresence>
              </div>
            );
          }

          const isMaintenance = item.featureFlag && featureFlags[item.featureFlag] === "maintenance";
          return (
            <Link key={item.href} href={item.href} className="flex-shrink-0">
              <div
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "text-zinc-100 bg-white/[0.06]"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]"
                }`}
              >
                <span className="whitespace-nowrap">{t(`main.${item.key}`)}</span>
                {isMaintenance && (
                  <span className="ml-1.5 inline-block rounded bg-amber-500/15 px-1 py-px text-xs font-medium text-amber-400 leading-tight">
                    {t('common.maintenance')}
                  </span>
                )}
              </div>
            </Link>
          );
        })}

        {overflowItems.length > 0 && (
          <div className="relative flex-shrink-0" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-label={t('common.more')}
              title={t('common.more')}
              className={`flex items-center gap-0.5 rounded-md px-2 py-1.5 text-sm font-medium transition-all duration-200 ${
                hasActiveOverflow
                  ? "text-zinc-100 bg-white/[0.06]"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]"
              }`}
            >
              <MoreHorizontal size={15} />
            </button>

            <AnimatePresence>
              {moreOpen && (
                <DropdownMenu className="right-0">
                  {overflowItems.map((item) => {
                    const active = isActive(item.href) || (item.children?.some((c) => isActive(c.href)) ?? false);
                    const hasChildren = item.children && item.children.length > 0;

                    if (hasChildren && item.children) {
                      return (
                        <div key={item.href}>
                          <div className="px-3 py-1.5 text-xs font-medium text-zinc-500">
                            {t(`main.${item.key}`)}
                          </div>
                          {item.children.map((child) => {
                            const childActive = pathname === child.href;
                            const childMaint = child.featureFlag && featureFlags[child.featureFlag] === "maintenance";
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => setMoreOpen(false)}
                              >
                                <div
                                  className={`rounded-md px-3 py-2 text-sm transition-colors ${
                                    childActive
                                      ? "text-zinc-100 bg-white/[0.06]"
                                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                                  }`}
                                >
                                  {t(`settings.${child.key}`)}
                                  {childMaint && (
                                    <span className="ml-1.5 inline-block rounded bg-amber-500/15 px-1 py-px text-xs font-medium text-amber-400 leading-tight">
                                      {t('common.maintenance')}
                                    </span>
                                  )}
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    }

                    const itemMaint = item.featureFlag && featureFlags[item.featureFlag] === "maintenance";
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                      >
                        <div
                          className={`rounded-md px-3 py-2 text-sm transition-colors ${
                            active
                              ? "text-zinc-100 bg-white/[0.06]"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                          }`}
                        >
                          {t(`main.${item.key}`)}
                          {itemMaint && (
                            <span className="ml-1.5 inline-block rounded bg-amber-500/15 px-1 py-px text-xs font-medium text-amber-400 leading-tight">
                              {t('common.maintenance')}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </DropdownMenu>
              )}
            </AnimatePresence>
          </div>
        )}
      </nav>

      <div className="flex-1 md:hidden" />

      <div className="flex flex-shrink-0 items-center gap-2 ml-4">
        <Link
          href="/announcements"
          className="relative flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 transition-colors hover:text-zinc-300 hover:bg-white/[0.04]"
          aria-label={t('common.announcements')}
        >
          <Megaphone size={15} />
          {announcementCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-500 px-1 text-xs font-bold text-white">
              {announcementCount > 9 ? "9+" : announcementCount}
            </span>
          )}
        </Link>

        <Link
          href="/alerts"
          onClick={clearAlertCount}
          className="relative flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 transition-colors hover:text-zinc-300 hover:bg-white/[0.04]"
          aria-label={t('common.notifications')}
        >
          <Bell size={15} />
          {alertCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>

        <LanguageSwitcher />

        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu((prev) => !prev)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-zinc-200"
            title={user?.email ?? ""}
          >
            {initial}
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <DropdownMenu className="right-0 w-52">
                <div className="border-b border-white/[0.06] px-3 py-2.5 mb-1">
                  <p className="truncate text-sm text-zinc-300">{user?.email}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {userRole === "admin" ? t('common.roleAdmin') : userRole === "operator" ? t('common.roleOperator') : t('common.roleUser')}
                  </p>
                  <MembershipExpiry user={user} />
                </div>
                <Link
                  href="/announcements"
                  onClick={() => setShowUserMenu(false)}
                >
                  <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200 hover:bg-white/[0.04]">
                    <BellRing size={14} />
                    {t('common.announcements')}
                  </div>
                </Link>
                <Link
                  href={`/${locale}/guide`}
                  onClick={() => setShowUserMenu(false)}
                >
                  <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200 hover:bg-white/[0.04]">
                    <BookOpen size={14} />
                    {t('common.guide')}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200 hover:bg-white/[0.04]"
                >
                  <LogOut size={14} />
                  {t('common.logout')}
                </button>
              </DropdownMenu>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>

    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
          />
          <motion.nav
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-14 left-0 bottom-0 z-30 w-64 border-r border-white/[0.06] bg-[#0a0a0f]/95 backdrop-blur-xl overflow-y-auto md:hidden"
          >
            <div className="p-4 space-y-1">
              {filteredItems.map((item) => {
                const active = isActive(item.href) || (item.children?.some((c) => isActive(c.href)) ?? false);
                const hasChildren = item.children && item.children.length > 0;

                if (hasChildren) {
                  return (
                    <div key={item.href} className="space-y-0.5">
                      <div className={`rounded-lg px-3 py-2.5 text-sm font-medium ${active ? "text-zinc-100" : "text-zinc-500"}`}>
                        {t(`main.${item.key}`)}
                      </div>
                      {item.children!.map((child) => {
                        const childActive = pathname === child.href;
                        const childMaint = child.featureFlag && featureFlags[child.featureFlag] === "maintenance";
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <div className={`ml-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                              childActive
                                ? "text-zinc-100 bg-white/[0.06]"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                            }`}>
                              {t(`settings.${child.key}`)}
                              {childMaint && (
                                <span className="ml-1.5 inline-block rounded bg-amber-500/15 px-1 py-px text-xs font-medium text-amber-400 leading-tight">
                                  {t('common.maintenance')}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  );
                }

                const itemMaint = item.featureFlag && featureFlags[item.featureFlag] === "maintenance";
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                    <div className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "text-zinc-100 bg-white/[0.06]"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                    }`}>
                      {t(`main.${item.key}`)}
                      {itemMaint && (
                        <span className="ml-1.5 inline-block rounded bg-amber-500/15 px-1 py-px text-xs font-medium text-amber-400 leading-tight">
                          {t('common.maintenance')}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
    </>
  );
}
