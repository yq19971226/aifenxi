"use client";

import { useTranslations } from "next-intl";
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
      <div className="mb-4 rounded-lg bg-white/[0.04] p-4">
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
  const t = useTranslations('onchain');
  return (
    <EmptyState
      icon={LinkIcon}
      title={t('empty.title')}
      description={t('empty.description')}
    />
  );
}

export function EmptyConsensus() {
  const t = useTranslations('common.emptyStates.consensus');
  return (
    <EmptyState
      icon={Brain}
      title={t('title')}
      description={t('description')}
    />
  );
}

export function EmptyCases() {
  const t = useTranslations('common.emptyStates.cases');
  return (
    <EmptyState
      icon={History}
      title={t('title')}
      description={t('description')}
    />
  );
}

export function EmptyAlertRules() {
  const t = useTranslations('common.emptyStates.alertRules');
  return (
    <EmptyState
      icon={Bell}
      title={t('title')}
      description={t('description')}
    />
  );
}

export function EmptyAlertHistory() {
  const t = useTranslations('common.emptyStates.alertHistory');
  return (
    <EmptyState
      icon={Zap}
      title={t('title')}
      description={t('description')}
    />
  );
}

export function EmptyChart() {
  const t = useTranslations('common.emptyStates.chart');
  return (
    <EmptyState
      icon={BarChart3}
      title={t('title')}
      description={t('description')}
    />
  );
}

export function EmptyOrders() {
  const t = useTranslations('common.emptyStates.orders');
  return (
    <EmptyState
      icon={Receipt}
      title={t('title')}
    />
  );
}

export function EmptyUsers() {
  const t = useTranslations('common.emptyStates.users');
  return (
    <EmptyState
      icon={Users}
      title={t('title')}
    />
  );
}

export function EmptyNotifications() {
  const t = useTranslations('common.emptyStates.notifications');
  return (
    <EmptyState
      icon={MessageSquare}
      title={t('title')}
    />
  );
}

export function EmptyOperators() {
  const t = useTranslations('common.emptyStates.operators');
  return (
    <EmptyState
      icon={Shield}
      title={t('title')}
    />
  );
}

export function EmptyConfigs() {
  const t = useTranslations('common.emptyStates.configs');
  return (
    <EmptyState
      icon={Sliders}
      title={t('title')}
    />
  );
}

export function EmptyPerformance() {
  const t = useTranslations('common.emptyStates.performance');
  return (
    <EmptyState
      icon={TrendingUp}
      title={t('title')}
      description={t('description')}
    />
  );
}

export function EmptyPlaybook() {
  const t = useTranslations('common.emptyStates.playbook');
  return (
    <EmptyState
      icon={FileSearch}
      title={t('title')}
      description={t('description')}
    />
  );
}

export function EmptyPayments() {
  const t = useTranslations('common.emptyStates.payments');
  return (
    <EmptyState
      icon={Receipt}
      title={t('title')}
    />
  );
}

export function EmptyLiquidations() {
  const t = useTranslations('common.emptyStates.liquidations');
  return (
    <EmptyState
      icon={Zap}
      title={t('title')}
      description={t('description')}
    />
  );
}

export function EmptyAuditLog() {
  const t = useTranslations('common.emptyStates.auditLog');
  return (
    <EmptyState
      icon={History}
      title={t('title')}
    />
  );
}

