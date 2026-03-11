import { useQuery } from "@tanstack/react-query";
import { authHeaders } from "@/lib/api/auth";
import { fetchConfigs } from "@/lib/api/configs";
import { Activity, Database, Cpu, HardDrive, Wifi } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

// ── 在线用户数据 ──
export interface AdminOnlineStats {
  total: number;
  price: number;
  alerts: number;
}

export function useAdminOnlineStats() {
  return useQuery<AdminOnlineStats>({
    queryKey: ["admin-online-stats"],
    queryFn: async () => {
      try {
        const res = await fetch(`${API}/api/admin/stats/online`, { headers: authHeaders() });
        if (!res.ok) return { total: 0, price: 0, alerts: 0 };
        const d = await res.json();
        return { total: d.count ?? 0, price: d.price ?? 0, alerts: d.alerts ?? 0 };
      } catch {
        return { total: 0, price: 0, alerts: 0 };
      }
    },
    refetchInterval: 15_000,
  });
}

// ── 后端健康数据 ──
export interface HealthData {
  status: string;
  env: string;
}

export function useSystemHealth() {
  return useQuery<HealthData>({
    queryKey: ["admin-health-status"],
    queryFn: async () => {
      try {
        const url = API ? `${API}/health` : "/health";
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) throw new Error(`health_status_${res.status}`);
        return await res.json();
      } catch {
        return { status: "error", env: "unknown" };
      }
    },
    refetchInterval: 30_000,
  });
}

// ── 模型与 API 配置健康检查 ──
export function useConfigHealth() {
  return useQuery({
    queryKey: ["admin-config-health"],
    queryFn: async () => {
      const configs = await fetchConfigs();
      return configs;
    },
    refetchInterval: 60_000,
  });
}
// ── 数据源健康检查 ──
export function useDataSourceHealth() {
  return useQuery({
    queryKey: ["admin-datasource-health"],
    queryFn: async () => {
      try {
        const res = await fetch(`${API}/api/admin/datasources/health`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("datasource_health_failed");
        return await res.json();
      } catch {
        return { sources: {}, completeness_score: 0 };
      }
    },
    refetchInterval: 30_000,
  });
}
