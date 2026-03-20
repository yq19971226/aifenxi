"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { LogoMark } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import {
  Menu,
  X,
  Search,
  LayoutDashboard,
  Brain,
  Shield,
  MoreHorizontal,
  History,
  TrendingUp,
  Gift,
  Rocket,
  Settings,
  ShieldCheck,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/announcements/NotificationBell";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { isNavItemVisible, stripLocalePrefix, type UserRole } from "@/lib/route-permissions";
import { cn } from "@/lib/utils";

// ── 移动端抽屉菜单数据 ──────────────────────────────────────
// 与 Sidebar.tsx 完全一致的菜单结构

interface MobileMenuItem {
  key: string;
  href: string;
  icon: LucideIcon;
  minRole: UserRole;
  featureFlag?: string;
}

interface MobileMenuGroup {
  labelKey: string;
  items: MobileMenuItem[];
}

const MOBILE_MENU_GROUPS: MobileMenuGroup[] = [
  {
    labelKey: "analysis",
    items: [
      { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, minRole: "user" },
      { key: "consensus", href: "/consensus", icon: Brain, minRole: "user" },
      { key: "alerts", href: "/alerts", icon: Shield, minRole: "user", featureFlag: "alerts" },
    ],
  },
  {
    labelKey: "tools",
    items: [
      { key: "adversarial", href: "/adversarial", icon: Shield, minRole: "user", featureFlag: "adversarial" },
      { key: "autopilots", href: "/autopilots", icon: Rocket, minRole: "user" },
      { key: "leaderboard", href: "/leaderboard", icon: TrendingUp, minRole: "user", featureFlag: "leaderboard" },
    ],
  },
  {
    labelKey: "account",
    items: [
      { key: "growth", href: "/tasks", icon: Gift, minRole: "user", featureFlag: "task" },
      { key: "settings", href: "/settings", icon: Settings, minRole: "user" },
    ],
  },
  {
    labelKey: "management",
    items: [
      { key: "admin", href: "/admin", icon: ShieldCheck, minRole: "admin" },
    ],
  },
];

// Group labels are resolved via t() at render time

export function TopNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('nav');
  const locale = useLocale();
  const { user, logout } = useAuth();
  const { flags } = useFeatureFlags();

  const currentPath = stripLocalePrefix(pathname);
  const role: UserRole = user?.role ?? "user";

  return (
    <>
      {/* Mobile Top Bar - 移动端占满宽，避免与内容区并排留白 */}
      <header className="md:hidden sticky top-0 z-50 flex h-14 w-full min-w-0 shrink-0 items-center justify-between border-b border-border bg-bg-primary/95 backdrop-blur-md px-4">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <LogoMark className="h-6 w-6 text-primary" />
          <span className="font-bold tracking-tight text-sm">AXIOM</span>
        </Link>

        <div className="flex items-center gap-1">
          <NotificationBell />
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="flex items-center justify-center w-9 h-9 text-foreground rounded-lg hover:bg-white/[0.04]"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Bar - Essential Actions Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border bg-bg-primary/90 backdrop-blur-xl pb-safe">
        <div className="grid h-full grid-cols-4 items-center justify-items-center">
          <Link href={`/${locale}/dashboard`} className={cn("flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px]", pathname.includes("/dashboard") ? "text-primary" : "text-muted-foreground")}>
            <LayoutDashboard size={22} />
            <span className="text-xs font-medium">{t('main.dashboard')}</span>
          </Link>
          <Link href={`/${locale}/consensus`} className={cn("flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px]", pathname.includes("/consensus") ? "text-primary" : "text-muted-foreground")}>
            <Brain size={22} />
            <span className="text-xs font-medium">{t('main.consensus')}</span>
          </Link>
          <Link href={`/${locale}/alerts`} className={cn("flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px]", pathname.includes("/alerts") ? "text-primary" : "text-muted-foreground")}>
            <Shield size={22} />
            <span className="text-xs font-medium">{t('main.alerts')}</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] text-muted-foreground"
          >
            <MoreHorizontal size={22} />
            <span className="text-xs font-medium">{t('common.menu')}</span>
          </button>
        </div>
      </nav>

      {/* Full Screen Drawer for Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] bg-bg-primary md:hidden flex flex-col"
          >
            {/* Drawer Header */}
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-bold">{t('common.menu')}</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-md hover:bg-bg-surface">
                <X size={24} />
              </button>
            </div>
            
            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
              {MOBILE_MENU_GROUPS.map((group) => {
                // 过滤权限和 feature flag
                const visibleItems = group.items.filter((item) => {
                  if (!isNavItemVisible(item.href, role)) return false;
                  if (item.featureFlag && flags[item.featureFlag] === "hidden") return false;
                  return true;
                });
                if (visibleItems.length === 0) return null;

                return (
                  <div key={group.labelKey} className="space-y-3">
                    <div className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest px-2">
                      {t(`common.${group.labelKey}` as Parameters<typeof t>[0])}
                    </div>
                    <div className="space-y-1">
                      {visibleItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentPath.startsWith(item.href);
                        const isMaintenance = item.featureFlag && flags[item.featureFlag] === "maintenance";

                        return (
                          <Link
                            key={item.key}
                            href={`/${locale}${item.href}`}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold transition-all active:scale-[0.98]",
                              isActive
                                ? "bg-indigo-500/10 text-indigo-400 shadow-inner"
                                : "text-zinc-300 hover:bg-bg-surface border border-transparent",
                              isMaintenance && "opacity-60",
                            )}
                          >
                            <Icon size={22} className={cn("shrink-0", isActive ? "text-indigo-400" : "text-zinc-500")} />
                            <span className="flex-1">{t(`main.${item.key}`)}</span>
                            {isMaintenance && (
                              <span className="text-[10px] font-bold font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md uppercase tracking-widest">
                                {t('common.maintenance')}
                              </span>
                            )}
                            {isActive && (
                              <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* 语言 & 系统 */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest px-2">
                  {t('common.system')}
                </div>
                <div className="px-2">
                  <LanguageSwitcher />
                </div>
              </div>
            </div>

            {/* Drawer Footer - 用户信息 & 退出 */}
            {user && (
              <div className="border-t border-border p-5 bg-bg-surface/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-bg-elevated flex items-center justify-center text-sm font-black font-mono shrink-0 border border-border text-zinc-300 shadow-inner">
                      {(user.email?.split("@")[0] ?? "U").substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate text-zinc-200">{user.email?.split("@")[0] ?? "User"}</div>
                      <div className="text-xs text-zinc-500 font-bold font-mono uppercase tracking-widest mt-0.5">
                      {user.is_admin ? t('common.roleAdmin') : user.membership_level >= 2 ? t('membership.flagship') : user.membership_level >= 1 ? t('membership.pro') : t('membership.free')}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { logout(); setMobileMenuOpen(false); }}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={20} />
                    <span className="text-[10px] font-bold font-mono uppercase tracking-widest">{t('common.logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
