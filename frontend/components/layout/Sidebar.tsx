"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  History,
  CreditCard,
  ChevronDown,
  Bell,
  ShieldCheck,
  Brain,
  BarChart3,
  Gift,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface SubNavItem {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: SubNavItem[];
}

const navItems: NavItem[] = [
  { label: "庄家看板", href: "/dashboard", icon: LayoutDashboard },
  { label: "综合分析", href: "/consensus", icon: Brain },
  { label: "剧本推演", href: "/playbook-sim", icon: History },
  { label: "策略绩效", href: "/performance", icon: BarChart3 },
  { label: "预警提醒", href: "/alerts", icon: Bell },
  { label: "任务中心", href: "/tasks", icon: Gift },
  { label: "合伙人", href: "/partner", icon: Users },
  {
    label: "设置",
    href: "/settings",
    icon: CreditCard,
    children: [
      { label: "会员中心", href: "/settings/membership" },
      { label: "推送设置", href: "/settings/push" },
    ],
  },
];

const adminNavItem: NavItem = {
  label: "管理后台",
  href: "/admin",
  icon: ShieldCheck,
  children: [
    { label: "快速设置", href: "/admin/setup" },
    { label: "运营概览", href: "/admin/dashboard" },
    { label: "参数设置", href: "/settings/configs" },
    { label: "API 密钥", href: "/admin/api-keys" },
    { label: "用户管理", href: "/admin/users" },
    { label: "运营员管理", href: "/admin/operators" },
    { label: "数据源管理", href: "/admin/datasources" },
    { label: "模型分工", href: "/admin/models" },
    { label: "订单管理", href: "/admin/orders" },
    { label: "自主学习", href: "/admin/learning" },
    { label: "币种管理", href: "/admin/symbols" },
    { label: "通知管理", href: "/admin/notifications" },
    { label: "系统监控", href: "/admin/monitor" },
    { label: "剧本审核", href: "/admin/playbook-review" },
    { label: "任务审核", href: "/admin/task-review" },
    { label: "任务模板", href: "/admin/task-templates" },
    { label: "提现审核", href: "/admin/withdrawals" },
    { label: "合伙人统计", href: "/admin/partner-stats" },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;
  const [expanded, setExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const filteredNavItems = navItems;

  return (
    <motion.aside
      animate={{ width: expanded ? 240 : 64 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        setExpanded(false);
        setSettingsOpen(false);
        setAdminOpen(false);
      }}
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/[0.05] bg-black/40 backdrop-blur-xl"
    >
      {/* Logo + Brand */}
      <div className="flex h-14 flex-col items-center justify-center px-4">
        <span className="text-xl font-bold tracking-wider text-white uppercase">
          {expanded ? "AXIOM洞察" : "AX"}
        </span>
        {expanded && (
          <span className="text-xs tracking-widest text-zinc-500 -mt-0.5">
            剧本流
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex flex-1 flex-col gap-1 px-2">
        {filteredNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const hasChildren = item.children && item.children.length > 0;

          if (hasChildren) {
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                    isActive
                      ? "bg-white/[0.06] text-zinc-100"
                      : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-zinc-100"
                    />
                  )}
                  <Icon size={20} />
                  {expanded && (
                    <>
                      <span className="flex-1 whitespace-nowrap text-left">
                        {item.label}
                      </span>
                      <motion.span
                        animate={{ rotate: settingsOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={14} />
                      </motion.span>
                    </>
                  )}
                </button>

                <AnimatePresence>
                  {expanded && settingsOpen && item.children && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      {item.children.map((child) => {
                        const childActive = pathname === child.href;
                        return (
                          <Link key={child.href} href={child.href}>
                            <div
                              className={`ml-7 rounded-md px-3 py-2 text-xs transition-colors ${
                                childActive
                                  ? "text-zinc-100 bg-white/[0.04]"
                                  : "text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              {child.label}
                            </div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ scale: 1.04 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-white/[0.06] text-zinc-100"
                    : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-zinc-100"
                  />
                )}
                <Icon size={20} />
                {expanded && (
                  <span className="whitespace-nowrap">{item.label}</span>
                )}
              </motion.div>
            </Link>
          );
        })}

        {/* Admin 菜单组 — 仅管理员可见 */}
        {isAdmin && (() => {
          const item = adminNavItem;
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href + "/") || pathname === item.href || pathname === "/settings/configs";
          return (
            <div key={item.href}>
              <button
                type="button"
                onClick={() => setAdminOpen((prev) => !prev)}
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-white/[0.06] text-indigo-300"
                    : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-admin"
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-indigo-400"
                  />
                )}
                <Icon size={20} />
                {expanded && (
                  <>
                    <span className="flex-1 whitespace-nowrap text-left">
                      {item.label}
                    </span>
                    <motion.span
                      animate={{ rotate: adminOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown size={14} />
                    </motion.span>
                  </>
                )}
              </button>

              <AnimatePresence>
                {expanded && adminOpen && item.children && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {item.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link key={child.href} href={child.href}>
                          <div
                            className={`ml-7 rounded-md px-3 py-2 text-xs transition-colors ${
                              childActive
                                ? "text-indigo-300 bg-white/[0.04]"
                                : "text-zinc-500 hover:text-zinc-300"
                            }`}
                          >
                            {child.label}
                          </div>
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.08] px-4 py-3">
        {expanded && (
          <p className="text-xs text-zinc-500">v3.0.0</p>
        )}
      </div>
    </motion.aside>
  );
}
