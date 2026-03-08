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
  FileCheck,
  ClipboardCheck,
  FileText,
  Wallet,
  PieChart,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

export interface AdminMenuItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface AdminMenuGroup {
  label: string;
  items: AdminMenuItem[];
}

export const ADMIN_MENU_GROUPS: AdminMenuGroup[] = [
  {
    label: "概览",
    items: [
      { label: "后台总览", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "系统监控", href: "/admin/monitor", icon: Activity },
    ],
  },
  {
    label: "系统配置",
    items: [
      { label: "快速设置", href: "/admin/setup", icon: Settings },
      { label: "参数设置", href: "/settings/configs", icon: SlidersHorizontal }, // 注意：此路径在 /admin 布局外，点击会跳出
      { label: "API 密钥", href: "/admin/api-keys", icon: Key },
      { label: "数据源管理", href: "/admin/datasources", icon: Database },
      { label: "模型分工", href: "/admin/models", icon: Brain },
      { label: "币种管理", href: "/admin/symbols", icon: Coins },
    ],
  },
  {
    label: "用户运营",
    items: [
      { label: "用户管理", href: "/admin/users", icon: Users },
      { label: "运营员管理", href: "/admin/operators", icon: UserCog },
      { label: "平台订单", href: "/admin/orders", icon: Receipt },
      { label: "通知管理", href: "/admin/notifications", icon: Bell },
      { label: "公告管理", href: "/admin/announcements", icon: BellRing },
    ],
  },
  {
    label: "内容审核",
    items: [
      { label: "剧本审核", href: "/admin/playbook-review", icon: FileCheck },
      { label: "任务审核", href: "/admin/task-review", icon: ClipboardCheck },
      { label: "任务模板", href: "/admin/task-templates", icon: FileText },
    ],
  },
  {
    label: "财务",
    items: [
      { label: "提现审核", href: "/admin/withdrawals", icon: Wallet },
      { label: "合伙人统计", href: "/admin/partner-stats", icon: PieChart },
    ],
  },
  {
    label: "AI",
    items: [
      { label: "自主学习", href: "/admin/learning", icon: GraduationCap },
    ],
  },
];
