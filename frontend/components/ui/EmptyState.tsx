"use client";

import {
  Inbox,
  FileSearch,
  BarChart3,
  Bell,
  History,
  Link as LinkIcon,
  Brain,
  TrendingUp,
  Receipt,
  Users,
  MessageSquare,
  Sliders,
  Shield,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="mb-4 rounded-2xl bg-white/[0.04] p-4">
        <Icon size={32} className="text-zinc-500" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-zinc-400">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-center text-xs text-zinc-500">
          {description}
        </p>
      )}
    </div>
  );
}

/* ── Preset empty states ────────────────────────────────── */

export function EmptyOnchain() {
  return (
    <EmptyState
      icon={LinkIcon}
      title="暂无链上数据"
      description="链上快照数据将在采集后自动展示"
    />
  );
}

export function EmptyConsensus() {
  return (
    <EmptyState
      icon={Brain}
      title="暂无共识报告"
      description="多智能体共识报告将在分析完成后展示"
    />
  );
}

export function EmptyCases() {
  return (
    <EmptyState
      icon={History}
      title="暂无案例数据"
      description="当前筛选条件下没有匹配的剧本案例"
    />
  );
}

export function EmptyAlertRules() {
  return (
    <EmptyState
      icon={Bell}
      title="暂无预警规则"
      description="创建你的第一条预警规则，实时监控市场变化"
    />
  );
}

export function EmptyAlertHistory() {
  return (
    <EmptyState
      icon={Zap}
      title="暂无触发记录"
      description="当预警规则条件满足时，触发记录将显示在这里"
    />
  );
}

export function EmptyChart() {
  return (
    <EmptyState
      icon={BarChart3}
      title="暂无数据"
      description="数据将在采集后自动展示"
    />
  );
}

export function EmptyOrders() {
  return (
    <EmptyState
      icon={Receipt}
      title="暂无订单数据"
    />
  );
}

export function EmptyUsers() {
  return (
    <EmptyState
      icon={Users}
      title="暂无用户数据"
    />
  );
}

export function EmptyNotifications() {
  return (
    <EmptyState
      icon={MessageSquare}
      title="暂无通知记录"
    />
  );
}

export function EmptyOperators() {
  return (
    <EmptyState
      icon={Shield}
      title="暂无运营商"
    />
  );
}

export function EmptyConfigs() {
  return (
    <EmptyState
      icon={Sliders}
      title="暂无配置"
    />
  );
}

export function EmptyPerformance() {
  return (
    <EmptyState
      icon={TrendingUp}
      title="暂无数据"
      description="策略绩效数据将在结算后展示"
    />
  );
}

export function EmptyPlaybook() {
  return (
    <EmptyState
      icon={FileSearch}
      title="暂无剧本匹配"
      description="当前行情未匹配到已知操盘剧本"
    />
  );
}

export function EmptyPayments() {
  return (
    <EmptyState
      icon={Receipt}
      title="暂无支付记录"
    />
  );
}

export function EmptyLiquidations() {
  return (
    <EmptyState
      icon={Zap}
      title="暂无爆仓数据"
      description="爆仓数据将在采集后自动展示"
    />
  );
}

export function EmptyAuditLog() {
  return (
    <EmptyState
      icon={History}
      title="暂无审计日志"
    />
  );
}
