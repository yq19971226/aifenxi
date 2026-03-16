"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { LogoMark } from "@/components/ui/Logo";
import {
  LayoutDashboard,
  Brain,
  History,
  TrendingUp,
  Shield,
  Gift,
  ShieldCheck,
  ChevronDown,
  LogOut,
  Rocket,
  type LucideIcon,
  Settings,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { type UserRole, isNavItemVisible, stripLocalePrefix } from "@/lib/route-permissions";
import { cn } from "@/lib/utils";

interface SubNavItem {
  key: string;
  href: string;
  minRole?: UserRole;
  featureFlag?: string;
}

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  minRole: UserRole;
  children?: SubNavItem[];
  featureFlag?: string;
}

const navItems: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, minRole: "user" },
  { key: "consensus", href: "/consensus", icon: Brain, minRole: "user" },
  { key: "adversarial", href: "/adversarial", icon: Shield, minRole: "user", featureFlag: "adversarial" },
  { key: "autopilots", href: "/autopilots", icon: Rocket, minRole: "user" },
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
];

const adminNavItem: NavItem = {
  key: "admin",
  href: "/admin",
  icon: ShieldCheck,
  minRole: "admin",
  children: [
    { key: "setup", href: "/admin/setup" },
    { key: "dashboard", href: "/admin/dashboard" },
    { key: "configs", href: "/settings/configs" },
    { key: "api_keys", href: "/admin/api-keys" },
    { key: "users", href: "/admin/users" },
    { key: "operators", href: "/admin/operators" },
    { key: "datasources", href: "/admin/datasources" },
    { key: "models", href: "/admin/models" },
    { key: "orders", href: "/admin/orders" },
    { key: "learning", href: "/admin/learning" },
    { key: "symbols", href: "/admin/symbols" },
    { key: "notifications", href: "/admin/notifications" },
    { key: "monitor", href: "/admin/monitor" },
    { key: "playbook_review", href: "/admin/playbook-review" },
    { key: "task_review", href: "/admin/task-review" },
    { key: "task_templates", href: "/admin/task-templates" },
    { key: "withdrawals", href: "/admin/withdrawals" },
    { key: "partner_stats", href: "/admin/partner-stats" },
  ],
};

const settingsItem: NavItem = {
  key: "settings",
  href: "/settings",
  icon: Settings,
  minRole: "user",
  children: [
    { key: "membership", href: "/settings/membership" },
    { key: "push", href: "/settings/push" },
  ],
};

function getSubLabelKey(parentKey: string, subKey: string): string {
  return parentKey === "admin" ? `admin.${subKey}` : `settings.${subKey}`;
}

export function Sidebar() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { flags } = useFeatureFlags();
  const [expanded, setExpanded] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<string[]>([]);
  
  // Combine all items based on role
  const allItems = [
    ...navItems,
    settingsItem,
    ...(user?.is_admin ? [adminNavItem] : [])
  ];

  const toggleSubmenu = (key: string) => {
    setOpenSubmenus(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const currentPath = stripLocalePrefix(pathname);
  const role: UserRole = user?.role ?? "user";

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 240 : 64 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        setExpanded(false);
        setOpenSubmenus([]);
      }}
      className="hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col border-r border-border bg-bg-primary/95 backdrop-blur-md"
    >
      {/* Logo Area */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <LogoMark className="h-6 w-6 text-primary shrink-0" />
        <AnimatePresence>
          {expanded && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="ml-3 font-bold tracking-tight text-foreground whitespace-nowrap"
            >
              AXIOM
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1.5 scrollbar-thin scrollbar-thumb-bg-elevated">
        {allItems.map((item) => {
          if (item.featureFlag && !flags?.[item.featureFlag]) return null;
          if (!isNavItemVisible(item.href, role)) return null;

          const isActive = currentPath.startsWith(item.href);
          const hasChildren = item.children && item.children.length > 0;
          const isOpen = openSubmenus.includes(item.key);

          return (
            <div key={item.key}>
              <Link
                href={hasChildren ? "#" : `/${locale}${item.href}`}
                onClick={(e) => {
                  if (hasChildren) {
                    e.preventDefault();
                    toggleSubmenu(item.key);
                  }
                }}
                className={cn(
                  "group flex items-center h-11 px-3.5 rounded-xl transition-all relative font-semibold",
                  isActive ? "bg-bg-elevated text-white shadow-inner" : "text-zinc-500 hover:bg-bg-surface hover:text-zinc-200"
                )}
              >
                <item.icon size={20} className={cn("shrink-0 transition-colors", isActive && "text-indigo-400")} />
                
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="ml-3.5 flex-1 overflow-hidden flex items-center justify-between"
                    >
                      <span className="text-sm font-bold tracking-wide whitespace-nowrap">{t(`main.${item.key}`)}</span>
                      {hasChildren && (
                        <ChevronDown
                          size={16}
                          className={cn("transition-transform", isOpen && "rotate-180")}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Active Indicator Line */}
                {isActive && !expanded && (
                  <div className="absolute left-0 top-2.5 bottom-2.5 w-1.5 rounded-r-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                )}
              </Link>

              {/* Submenu */}
              <AnimatePresence>
                {expanded && hasChildren && isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden ml-5 pl-5 border-l-2 border-border mt-1.5 space-y-1"
                  >
                    {item.children!.map((sub) => {
                      if (sub.featureFlag && !flags?.[sub.featureFlag]) return null;
                      if (!isNavItemVisible(sub.href, role)) return null;
                      const isSubActive = currentPath === sub.href;
                      
                      return (
                        <Link
                          key={sub.key}
                          href={`/${locale}${sub.href}`}
                          className={cn(
                            "block py-2.5 px-3 text-xs font-bold tracking-wide rounded-lg transition-colors",
                            isSubActive ? "text-indigo-400 bg-indigo-500/10 shadow-inner" : "text-zinc-500 hover:text-zinc-200 hover:bg-bg-surface"
                          )}
                        >
                          {t(getSubLabelKey(item.key, sub.key))}
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-border bg-bg-primary/50">
        {user ? (
          <div className={cn("flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors", expanded ? "hover:bg-bg-surface" : "")}>
            <div className="h-9 w-9 rounded-full bg-bg-surface flex items-center justify-center text-sm font-black font-mono shadow-inner shrink-0 border border-border text-zinc-300">
              {(user.email?.split("@")[0] ?? "U").substring(0, 2).toUpperCase()}
            </div>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex-1 overflow-hidden flex flex-col justify-center"
                >
                  <div className="text-sm font-bold truncate text-zinc-200 leading-tight mb-0.5">{user.email?.split("@")[0] ?? "User"}</div>
                  <div className="text-xs font-bold font-mono tracking-widest text-zinc-500 truncate uppercase">
                    {user.membership_level >= 2 ? "旗舰会员" : user.membership_level >= 1 ? "专业会员" : "普通用户"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {expanded && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={logout}
                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors group cursor-pointer"
                  title={t('main.logout')}
                >
                  <LogOut size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        ) : (
          expanded && (
            <Link href={`/${locale}/login`} className="flex w-full items-center justify-center h-10 rounded-lg bg-indigo-500 text-white font-bold hover:bg-indigo-600 transition-colors shadow-lg">
              {t('common.login')}
            </Link>
          )
        )}
      </div>
    </motion.aside>
  );
}
