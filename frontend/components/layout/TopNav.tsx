"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LogoMark } from "@/components/ui/Logo";
import {
  LayoutDashboard,
  Bell,
  BellRing,
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
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
// import { getDataSourceStatus, type DataSourceStatusSnapshot } from "@/lib/api/datasources";
import { useAlertSocket } from "@/lib/ws/useAlertSocket";
import { type UserRole, ROLE_LEVEL, isNavItemVisible } from "@/lib/route-permissions";

// ── Types ────────────────────────────────────────────────────

interface SubNavItem {
  label: string;
  href: string;
  minRole?: UserRole;
  featureFlag?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  minRole: UserRole;
  children?: SubNavItem[];
  featureFlag?: string;
}

// ── Nav items configuration ──────────────────────────────────

const navItems: NavItem[] = [
  { label: "\u770B\u677F", href: "/dashboard", icon: LayoutDashboard, minRole: "user" },
  { label: "\u5206\u6790", href: "/consensus", icon: Brain, minRole: "user" },
  { label: "\u5267\u672C", href: "/playbook-sim", icon: Activity, minRole: "user" },
  { label: "\u7EE9\u6548", href: "/performance", icon: TrendingUp, minRole: "user" },
  { label: "\u9884\u8B66", href: "/alerts", icon: Shield, minRole: "user" },
  {
    label: "\u589E\u957F",
    href: "/growth",
    icon: Gift,
    minRole: "user",
    children: [
      { label: "\u4EFB\u52A1\u4E2D\u5FC3", href: "/tasks" },
      { label: "\u5408\u4F19\u4EBA", href: "/partner" },
    ],
  },
  {
    label: "\u8BBE\u7F6E",
    href: "/settings",
    icon: Settings,
    minRole: "user",
    children: [
      { label: "\u4F1A\u5458\u4E2D\u5FC3", href: "/settings/membership" },
      { label: "\u63A8\u9001\u8BBE\u7F6E", href: "/settings/push" },
    ],
  },
  { label: "\u7BA1\u7406", href: "/admin", icon: ShieldCheck, minRole: "operator" },
];

// ── Exported for testing ─────────────────────────────────────

export { navItems };
export type { NavItem, SubNavItem };

// ── Dropdown Menu ────────────────────────────────────────────

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

// ── TopNav Component ─────────────────────────────────────────

export function TopNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [_time, setTime] = useState("");
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

  // Feature flags
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${API_BASE}/api/feature-flags`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setFeatureFlags)
      .catch(() => {});
  }, []);

  // Live datasource status (disabled - uncomment when needed)
  // const [dsStatus, setDsStatus] = useState<DataSourceStatusSnapshot | null>(null);
  // useEffect(() => {
  // let cancelled = false;
  // const poll = async () => {
  // try {
  // const s = await getDataSourceStatus();
  // if (!cancelled) setDsStatus(s);
  // } catch { /* ignore */ }
  // };
  // poll();
  // const timer = setInterval(poll, 30_000);
  // return () => { cancelled = true; clearInterval(timer); };
  // }, []);

  // const dsScore = dsStatus ? Math.round((dsStatus.domain_completeness ?? dsStatus.completeness_score) * 100) : null;
  // const dsHealthy = dsScore !== null && dsScore >= 50;

  // Filter nav items by shared route-permissions + feature flags
  const filteredItems = useMemo(
    () =>
      navItems
        .map((item) => {
          if (!item.children) return item;
          const filteredChildren = item.children.filter((child) => {
            if (!isNavItemVisible(child.href, userRole)) return false;
            if (child.featureFlag && featureFlags[child.featureFlag] === false) return false;
            return true;
          });
          return { ...item, children: filteredChildren };
        })
        .filter((item) => {
          if (ROLE_LEVEL[userRole] < ROLE_LEVEL[item.minRole]) return false;
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

  // Clock
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const hasActiveOverflow = overflowItems.some(
    (item) => isActive(item.href) || item.children?.some((c) => isActive(c.href))
  );

  return (
    <>
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-white/[0.05] bg-black/40 px-3 md:px-6 backdrop-blur-xl">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen((v) => !v)}
        className="mr-2 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] md:hidden"
        aria-label="菜单"
      >
        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <Link href="/dashboard" className="mr-4 md:mr-10 flex-shrink-0 flex items-center gap-2 group">
        <LogoMark size={22} className="transition-transform group-hover:scale-105" />
        <span className="text-sm font-semibold tracking-[0.18em] text-zinc-100 select-none transition-colors group-hover:text-white">
          AXIOM
        </span>
      </Link>

      {/* Hidden measure container (desktop only) */}
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
            <span>{item.label}</span>
            {item.children && <ChevronDown size={11} />}
          </div>
        ))}
      </div>

      {/* Nav items — desktop only */}
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
                  <span className="whitespace-nowrap">{item.label}</span>
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
                              {child.label}
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

          return (
            <Link key={item.href} href={item.href} className="flex-shrink-0">
              <div
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "text-zinc-100 bg-white/[0.06]"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]"
                }`}
              >
                <span className="whitespace-nowrap">{item.label}</span>
              </div>
            </Link>
          );
        })}

        {/* Overflow dropdown */}
        {overflowItems.length > 0 && (
          <div className="relative flex-shrink-0" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-label="更多菜单"
              title="更多菜单"
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
                            {item.label}
                          </div>
                          {item.children.map((child) => {
                            const childActive = pathname === child.href;
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
                                  {child.label}
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    }

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
                          {item.label}
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

      {/* Mobile spacer */}
      <div className="flex-1 md:hidden" />

      {/* Right section */}
      <div className="flex flex-shrink-0 items-center gap-2 ml-4">
        {/* Notification bell */}
        <Link
          href="/alerts"
          onClick={clearAlertCount}
          className="relative flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 transition-colors hover:text-zinc-300 hover:bg-white/[0.04]"
          aria-label="\u901A\u77E5"
        >
          <Bell size={15} />
          {alertCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>

        {/* User avatar + dropdown */}
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
                    {userRole === "admin" ? "\u7BA1\u7406\u5458" : userRole === "operator" ? "\u8FD0\u8425\u5458" : "\u7528\u6237"}
                  </p>
                </div>
                <Link
                  href="/announcements"
                  onClick={() => setShowUserMenu(false)}
                >
                  <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200 hover:bg-white/[0.04]">
                    <BellRing size={14} />
                    {"\u516C\u544A\u4E2D\u5FC3"}
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
                  {"\u9000\u51FA\u767B\u5F55"}
                </button>
              </DropdownMenu>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>

    {/* ── Mobile slide-out menu ── */}
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
          />
          {/* Panel */}
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
                        {item.label}
                      </div>
                      {item.children!.map((child) => {
                        const childActive = pathname === child.href;
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
                              {child.label}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  );
                }

                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                    <div className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "text-zinc-100 bg-white/[0.06]"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                    }`}>
                      {item.label}
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
