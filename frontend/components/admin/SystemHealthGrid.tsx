"use client";

import {
  Activity,
  Database,
  Cpu,
  HardDrive,
  Wifi,
  type LucideIcon,
} from "lucide-react";

/* ── Types ── */

type HealthStatus = "healthy" | "degraded" | "down";

interface ServiceHealth {
  id: string;
  label: string;
  icon: LucideIcon;
  status: HealthStatus;
  metric?: string;
  detail?: string;
}

export interface SystemHealthGridProps {
  services?: ServiceHealth[];
  className?: string;
}

/* ── Defaults ── */

const DEFAULT_SERVICES: ServiceHealth[] = [
  { id: "api", label: "API 服务", icon: Activity, status: "healthy", metric: "99.9%", detail: "响应 < 200ms" },
  { id: "db", label: "数据库", icon: Database, status: "healthy", metric: "正常", detail: "PostgreSQL 连接池 12/50" },
  { id: "redis", label: "Redis 缓存", icon: HardDrive, status: "healthy", metric: "正常", detail: "内存 128MB / 512MB" },
  { id: "ws", label: "WebSocket", icon: Wifi, status: "healthy", metric: "在线", detail: "活跃连接 24" },
  { id: "cpu", label: "CPU 使用率", icon: Cpu, status: "healthy", metric: "23%", detail: "4 核 / 8GB" },
  { id: "llm", label: "LLM 网关", icon: Activity, status: "healthy", metric: "正常", detail: "DMXAPI 可达" },
];

/* ── Status styles ── */

const STATUS_DOT: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-400",
  down: "bg-red-500",
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: "正常",
  degraded: "降级",
  down: "宕机",
};

const STATUS_TEXT: Record<HealthStatus, string> = {
  healthy: "text-emerald-400",
  degraded: "text-amber-400",
  down: "text-red-400",
};

/* ── Component ── */

export function SystemHealthGrid({
  services = DEFAULT_SERVICES,
  className = "",
}: SystemHealthGridProps) {
  return (
    <div className={`grid grid-cols-2 gap-3 lg:grid-cols-3 ${className}`}>
      {services.map((svc) => {
        const Icon = svc.icon;
        return (
          <div
            key={svc.id}
            className="card p-4 flex flex-col gap-2"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-zinc-500" />
                <span className="text-xs font-medium text-zinc-300">{svc.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[svc.status]}`} />
                <span className={`text-xs ${STATUS_TEXT[svc.status]}`}>
                  {STATUS_LABEL[svc.status]}
                </span>
              </div>
            </div>

            {/* Metric */}
            {svc.metric && (
              <span className="stat-value text-[18px] text-zinc-200">{svc.metric}</span>
            )}

            {/* Detail */}
            {svc.detail && (
              <span className="text-xs text-zinc-500">{svc.detail}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
