import {
  LayoutDashboard,
  Activity,
  Settings,
  Key,
  Database,
  Brain,
  Coins,
  Users,
  Bell,
  FileCheck,
  ClipboardCheck,
  Wallet,
  GraduationCap,
  Server,
  FileText,
  type LucideIcon,
} from "lucide-react";

export interface AdminMenuItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: "playbookReview" | "taskReview" | "withdrawals";
  badgeColor?: "red" | "amber" | "blue";
  frequency?: "high" | "low";
}

export interface AdminMenuGroup {
  labelKey: string;
  items: AdminMenuItem[];
}

export const ADMIN_MENU_GROUPS: AdminMenuGroup[] = [
  // ── 概览 ──────────────────────────────────
  {
    labelKey: "overview",
    items: [
      { labelKey: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard, frequency: "high" },
      { labelKey: "monitor", href: "/admin/monitor", icon: Activity, frequency: "high" },
    ],
  },
  // ── 配置 ──────────────────────────────────
  {
    labelKey: "config",
    items: [
      { labelKey: "apiKeys", href: "/admin/api-keys", icon: Key, frequency: "high" },
      { labelKey: "setup", href: "/admin/setup", icon: Settings, frequency: "high" },
      { labelKey: "models", href: "/admin/models", icon: Brain },
      { labelKey: "symbols", href: "/admin/symbols", icon: Coins, frequency: "high" },
    ],
  },
  // ── 运营 ──────────────────────────────────
  {
    labelKey: "operations",
    items: [
      { labelKey: "users", href: "/admin/users", icon: Users, frequency: "high" },
      { labelKey: "playbookReview", href: "/admin/playbook-review", icon: FileCheck, badgeKey: "playbookReview", badgeColor: "amber", frequency: "high" },
      { labelKey: "taskReview", href: "/admin/task-review", icon: ClipboardCheck, badgeKey: "taskReview", badgeColor: "amber" },
      { labelKey: "announcements", href: "/admin/announcements", icon: Bell },
      { labelKey: "withdrawals", href: "/admin/withdrawals", icon: Wallet, badgeKey: "withdrawals", badgeColor: "blue" },
    ],
  },
  // ── 智能 ──────────────────────────────────
  {
    labelKey: "intelligence",
    items: [
      { labelKey: "learning", href: "/admin/learning", icon: GraduationCap, frequency: "high" },
      { labelKey: "datasources", href: "/admin/datasources", icon: Database },
      { labelKey: "logs", href: "/admin/system/logs", icon: FileText },
      { labelKey: "systemMgmt", href: "/admin/system", icon: Server },
    ],
  },
];
