import {
  LayoutDashboard,
  Activity,
  Settings,
  SlidersHorizontal,
  Key,
  Database,
  Brain,
  Coins,
  Users,
  UserCog,
  Receipt,
  Bell,
  BellRing,
  Megaphone,
  FileCheck,
  ClipboardCheck,
  FileText,
  Wallet,
  PieChart,
  GraduationCap,
  Server,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface AdminMenuItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface AdminMenuGroup {
  labelKey: string;
  items: AdminMenuItem[];
}

export const ADMIN_MENU_GROUPS: AdminMenuGroup[] = [
  {
    labelKey: "overview",
    items: [
      { labelKey: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { labelKey: "monitor", href: "/admin/monitor", icon: Activity },
    ],
  },
  {
    labelKey: "config",
    items: [
      { labelKey: "setup", href: "/admin/setup", icon: Settings },
      { labelKey: "configs", href: "/admin/configs", icon: SlidersHorizontal },
      { labelKey: "maintenance", href: "/admin/maintenance", icon: Wrench },
      { labelKey: "apiKeys", href: "/admin/api-keys", icon: Key },
      { labelKey: "datasources", href: "/admin/datasources", icon: Database },
      { labelKey: "models", href: "/admin/models", icon: Brain },
      { labelKey: "symbols", href: "/admin/symbols", icon: Coins },
    ],
  },
  {
    labelKey: "users",
    items: [
      { labelKey: "users", href: "/admin/users", icon: Users },
      { labelKey: "operators", href: "/admin/operators", icon: UserCog },
      { labelKey: "orders", href: "/admin/orders", icon: Receipt },
      { labelKey: "notifications", href: "/admin/notifications", icon: Bell },
      { labelKey: "push", href: "/admin/push", icon: BellRing },
      { labelKey: "announcements", href: "/admin/announcements", icon: Megaphone },
    ],
  },
  {
    labelKey: "review",
    items: [
      { labelKey: "playbookReview", href: "/admin/playbook-review", icon: FileCheck },
      { labelKey: "taskReview", href: "/admin/task-review", icon: ClipboardCheck },
      { labelKey: "taskTemplates", href: "/admin/task-templates", icon: FileText },
    ],
  },
  {
    labelKey: "finance",
    items: [
      { labelKey: "withdrawals", href: "/admin/withdrawals", icon: Wallet },
      { labelKey: "partnerStats", href: "/admin/partner-stats", icon: PieChart },
    ],
  },
  {
    labelKey: "ai",
    items: [
      { labelKey: "learning", href: "/admin/learning", icon: GraduationCap },
    ],
  },
  {
    labelKey: "system",
    items: [
      { labelKey: "systemMgmt", href: "/admin/system", icon: Server },
    ],
  },
];
