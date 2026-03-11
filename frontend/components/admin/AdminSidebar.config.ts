import {
  LayoutDashboard,
  Activity,
  Settings,
  Key,
  Database,
  Brain,
  Coins,
  Users,
  UserCog,
  Receipt,
  Bell,
  Megaphone,
  FileCheck,
  ClipboardCheck,
  FileText,
  Wallet,
  PieChart,
  GraduationCap,
  Server,
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
  {
    labelKey: "overview",
    items: [
      { labelKey: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard, frequency: "high" },
    ],
  },
  {
    labelKey: "system",
    items: [
      { labelKey: "monitor", href: "/admin/monitor", icon: Activity, frequency: "high" },
      { labelKey: "setup", href: "/admin/setup", icon: Settings, frequency: "high" },
      { labelKey: "models", href: "/admin/models", icon: Brain },
      { labelKey: "logs", href: "/admin/system/logs", icon: FileText },
      { labelKey: "datasources", href: "/admin/datasources", icon: Database },
      { labelKey: "apiKeys", href: "/admin/api-keys", icon: Key },
      { labelKey: "symbols", href: "/admin/symbols", icon: Coins, frequency: "high" },
      { labelKey: "learning", href: "/admin/learning", icon: GraduationCap, frequency: "high" },
      { labelKey: "systemMgmt", href: "/admin/system", icon: Server },
    ],
  },
  {
    labelKey: "users",
    items: [
      { labelKey: "users", href: "/admin/users", icon: Users },
      { labelKey: "operators", href: "/admin/operators", icon: UserCog },
      { labelKey: "orders", href: "/admin/orders", icon: Receipt },
      { labelKey: "notifications", href: "/admin/notifications", icon: Bell },
      { labelKey: "announcements", href: "/admin/announcements", icon: Megaphone },
    ],
  },
  {
    labelKey: "review",
    items: [
      { labelKey: "playbookReview", href: "/admin/playbook-review", icon: FileCheck, badgeKey: "playbookReview", badgeColor: "amber", frequency: "high" },
      { labelKey: "taskReview", href: "/admin/task-review", icon: ClipboardCheck, badgeKey: "taskReview", badgeColor: "amber" },
      { labelKey: "taskTemplates", href: "/admin/task-templates", icon: FileText },
    ],
  },
  {
    labelKey: "finance",
    items: [
      { labelKey: "withdrawals", href: "/admin/withdrawals", icon: Wallet, badgeKey: "withdrawals", badgeColor: "blue" },
      { labelKey: "partnerStats", href: "/admin/partner-stats", icon: PieChart },
    ],
  },
];
