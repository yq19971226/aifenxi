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
  CreditCard,
  ClipboardCheck,
  ListChecks,
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
  badgeKey?: "taskReview" | "withdrawals";
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
  // ── 商业运营 ──────────────────────────────
  {
    labelKey: "business",
    items: [
      { labelKey: "membership", href: "/admin/membership", icon: CreditCard, frequency: "high" },
      { labelKey: "users", href: "/admin/users", icon: Users, frequency: "high" },
      { labelKey: "withdrawals", href: "/admin/withdrawals", icon: Wallet, badgeKey: "withdrawals", badgeColor: "blue" },
    ],
  },
  // ── 内容运营 ──────────────────────────────
  {
    labelKey: "content",
    items: [
      { labelKey: "announcements", href: "/admin/announcements", icon: Bell },
      { labelKey: "taskReview", href: "/admin/task-review", icon: ClipboardCheck, badgeKey: "taskReview", badgeColor: "amber" },
      { labelKey: "taskTemplates", href: "/admin/task-templates", icon: ListChecks },
    ],
  },
  // ── 系统配置 ──────────────────────────────
  {
    labelKey: "config",
    items: [
      { labelKey: "apiKeys", href: "/admin/api-keys", icon: Key, frequency: "high" },
      { labelKey: "setup", href: "/admin/setup", icon: Settings, frequency: "high" },
      { labelKey: "models", href: "/admin/models", icon: Brain },
      { labelKey: "symbols", href: "/admin/symbols", icon: Coins, frequency: "high" },
    ],
  },
  // ── 智能体与数据 ──────────────────────────
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
