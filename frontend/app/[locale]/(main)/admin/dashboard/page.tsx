"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Users,
  UserPlus,
  DollarSign,
  Clock,
  Brain,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Stethoscope,
  Settings,
  Key,
  Database,
  Monitor,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { 
  fetchDashboardStats, 
  fetchLLMCost, 
  fetchCrawlerStats,
  type DashboardStats, 
  type LLMCostSummary,
  type CrawlerStats
} from "@/lib/api/admin-dashboard";
import { fetchConfigs, type SystemConfig } from "@/lib/api/configs";
import { SkeletonStatCard, Skeleton } from "@/components/ui/Skeleton";
import { SystemHealthGrid } from "@/components/admin/SystemHealthGrid";
import { AdminUserTable } from "@/components/admin/AdminUserTable";
import { ApiCallChart } from "@/components/admin/ApiCallChart";
import { useAuth } from "@/lib/auth-context";
import { useAdminOnlineStats } from "@/lib/hooks/useAdminMonitor";

/* ── 系统体检项定义 ──────────────────────────────────────────── */

interface HealthItem {
  id: string;
  itemKey: string;
  checkFn: (configs: SystemConfig[]) => "ok" | "warn" | "fail";
  href: string;
}

const HEALTH_ITEMS: HealthItem[] = [
  {
    id: "ai_key",
    itemKey: "aiKey",
    checkFn: (c) => c.some((x) => x.config_key === "dmx_api_key") ? "ok" : "fail",
    href: "/admin/api-keys",
  },
  {
    id: "news_key",
    itemKey: "newsKey",
    checkFn: (c) => c.some((x) => x.config_key === "finnhub_api_key") ? "ok" : "warn",
    href: "/admin/api-keys",
  },
  {
    id: "onchain_key",
    itemKey: "onchainKey",
    checkFn: (c) => c.some((x) => x.config_key === "glassnode_api_key") ? "ok" : "warn",
    href: "/admin/api-keys",
  },
  {
    id: "params",
    itemKey: "params",
    checkFn: (c) => {
      const has = (k: string) => c.some((x) => x.config_key === k);
      return has("risk_threshold_fear_greed_panic") && has("query_limit_free")
        ? "ok" : "warn";
    },
    href: "/settings/configs",
  },
  {
    id: "push",
    itemKey: "push",
    checkFn: (c) => {
      const hasTg = c.some((x) => x.config_key === "telegram_bot_token");
      const hasEmail = c.some((x) => x.config_key === "resend_api_key" || x.config_key === "sendgrid_api_key");
      return hasTg || hasEmail ? "ok" : "warn";
    },
    href: "/admin/api-keys",
  },
];

/* ── 配置体检列表 ──────────────────────────────────────────── */

function ConfigHealthList({ configs }: { configs: SystemConfig[] }) {
  const t = useTranslations("admin");
  const results = HEALTH_ITEMS.map((item) => ({
    ...item,
    status: item.checkFn(configs),
  }));
  const okCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.filter((r) => r.status === "fail").length;

  const statusBadge =
    failCount > 0
      ? t("dashboard.configHealth.failCount", { count: failCount })
      : okCount === results.length
        ? t("dashboard.configHealth.allOk")
        : t("dashboard.configHealth.pendingCount", { count: results.length - okCount });

  return (
    <div className="bg-bg-surface border border-border rounded-xl shadow-inner overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-primary/30">
        <div className="flex items-center gap-2.5">
          <Stethoscope size={16} className="text-zinc-500" />
          <span className="text-sm font-bold text-zinc-300">{t("dashboard.configHealth.title")}</span>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-[10px] font-bold font-mono tracking-widest uppercase ${
            failCount > 0
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : okCount === results.length
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}
        >
          {statusBadge}
        </span>
      </div>
      <div className="divide-y divide-border">
        {results.map((item) => {
          const statusText =
            item.status === "ok"
              ? t(`dashboard.configHealth.items.${item.itemKey}.ok`)
              : item.status === "warn"
                ? t(`dashboard.configHealth.items.${item.itemKey}.warn`)
                : t(`dashboard.configHealth.items.${item.itemKey}.fail`);
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-bg-elevated group"
            >
              <div className="flex items-center gap-3">
                {item.status === "ok" ? (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 shadow-sm" />
                ) : item.status === "warn" ? (
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 shadow-sm" />
                ) : (
                  <XCircle size={16} className="text-red-400 shrink-0 shadow-sm" />
                )}
                <div>
                  <span className="text-xs font-bold text-zinc-300">{t(`dashboard.configHealth.items.${item.itemKey}.label`)}</span>
                  <p
                    className={`text-[10px] uppercase font-bold tracking-widest font-mono mt-1 ${
                      item.status === "ok"
                        ? "text-zinc-500"
                        : item.status === "warn"
                        ? "text-amber-500/70"
                        : "text-red-400/70"
                    }`}
                  >
                    {statusText}
                  </p>
                </div>
              </div>
              {item.status !== "ok" && (
                <ArrowRight
                  size={14}
                  className="text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all shrink-0"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── KPI 卡片组件 ──────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="bg-bg-surface border border-border rounded-xl shadow-inner p-5 hover:border-indigo-500/30 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold text-zinc-400 group-hover:text-zinc-300 transition-colors uppercase tracking-widest">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl shadow-inner border border-border/50 ${color}`}>
          <Icon size={16} className="opacity-80" />
        </div>
      </div>
      <p className="text-2xl font-black text-white font-mono tracking-tight">{value}</p>
      {sub && <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-2">{sub}</p>}
    </div>
  );
}

/* ── 会员分布条 ────────────────────────────────────────────── */

function TierBar({ free, pro, flagship }: { free: number; pro: number; flagship: number }) {
  const total = free + pro + flagship || 1;
  const pct = (n: number) => ((n / total) * 100).toFixed(1);

  return (
    <div className="bg-bg-surface border border-border rounded-xl shadow-inner p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">会员分布</span>
        <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{total} 人</span>
      </div>
      <div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-bg-elevated border border-border shadow-inner mt-2">
        <div className="bg-zinc-500 transition-all opacity-80" style={{ width: `${pct(free)}%` }} />
        <div className="bg-indigo-500 transition-all shadow-[0_0_8px_rgba(99,102,241,0.5)] z-10" style={{ width: `${pct(pro)}%` }} />
        <div className="bg-amber-500 transition-all shadow-[0_0_8px_rgba(245,158,11,0.5)] z-20" style={{ width: `${pct(flagship)}%` }} />
      </div>
      <div className="flex items-center gap-4 text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-500 opacity-80" />
          免费 <span className="text-zinc-300">{free}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
          专业 <span className="text-zinc-300">{pro}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
          旗舰 <span className="text-zinc-300">{flagship}</span>
        </span>
      </div>
    </div>
  );
}

/* ── LLM 成本面板（紧凑版） ──────────────────────────────── */

function LLMCostCompact({ cost }: { cost: LLMCostSummary }) {
  const modelLabels: Record<string, string> = {
    "deepseek-r1": "DeepSeek R1",
    "deepseek-v3.2-thinking": "DeepSeek V3.2",
    "claude-sonnet": "Claude Sonnet",
    "grok-fast": "Grok-4 Fast",
    "grok-code-fast": "Grok Code",
    "qwen3-max": "Qwen3 Max",
    "qwen3-next-thinking": "Qwen3 Next",
    "claude-haiku": "Claude Haiku",
    deepseek: "DeepSeek",
    "deepseek-reasoner": "DeepSeek R1",
    grok: "Grok-4",
    claude: "Claude",
    qwen: "Qwen3",
    gpt4o: "GPT-4o",
    gemini: "Gemini",
    o3: "o3",
  };
  const modelColors: Record<string, string> = {
    "deepseek-r1": "bg-emerald-500",
    "deepseek-v3.2-thinking": "bg-[#00D4AA]",
    "claude-sonnet": "bg-[#F59E0B]",
    "grok-fast": "bg-indigo-500",
    "grok-code-fast": "bg-[#3B82F6]",
    "qwen3-max": "bg-[#A855F7]",
    "qwen3-next-thinking": "bg-[#C084FC]",
    "claude-haiku": "bg-[#D97706]",
    deepseek: "bg-emerald-500",
    "deepseek-reasoner": "bg-emerald-500",
    grok: "bg-indigo-500",
    claude: "bg-[#F59E0B]",
    qwen: "bg-[#A855F7]",
    gpt4o: "bg-[#74AA9C]",
    gemini: "bg-[#8E75B2]",
    o3: "bg-[#74AA9C]",
  };
  const total = cost.total_cost_usd || 1;

  return (
    <div className="bg-bg-surface border border-border rounded-xl shadow-inner p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">今日 AI 成本</span>
        <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">{cost.date}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 pt-1">
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">总成本</p>
          <p className="text-base sm:text-lg font-black font-mono text-zinc-200 tracking-tight">${cost.total_cost_usd.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Tokens</p>
          <p className="text-base sm:text-lg font-black font-mono text-zinc-200 tracking-tight">{cost.total_tokens.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">调用</p>
          <p className="text-base sm:text-lg font-black font-mono text-zinc-200 tracking-tight">{cost.total_calls}</p>
        </div>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-bg-elevated border border-border mt-4 mb-3">
        {Object.entries(cost.by_model).map(([key, val]) => (
          <div
            key={key}
            className={`${modelColors[key] ?? "bg-zinc-500"} transition-all`}
            style={{ width: `${((val / total) * 100).toFixed(1)}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold font-mono uppercase tracking-widest text-zinc-500">
        {Object.entries(cost.by_model).map(([key, val]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${modelColors[key] ?? "bg-zinc-500"} shadow-sm`} />
            {modelLabels[key] ?? key} <span className="text-zinc-300">${val.toFixed(4)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── AI 爬虫访问统计 ────────────────────────────────────── */

function CrawlerStatsCard({ stats }: { stats: CrawlerStats }) {
  const bots = stats.bots.slice(0, 5); // 只看前5个
  
  return (
    <div className="bg-bg-surface border border-border rounded-xl shadow-inner p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">AI 引擎收录检测</span>
        <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest">累计 {stats.total_hits} 次</span>
      </div>
      
      {bots.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center gap-3 text-zinc-600 bg-bg-primary/50 rounded-xl border border-dashed border-border/50">
          <Wifi size={24} className="animate-pulse opacity-50" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">等待 AI 引擎首访同步...</p>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {bots.map((bot) => (
            <div key={bot.name}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-zinc-300 font-bold">{bot.name}</span>
                <span className="text-zinc-500 font-mono font-bold tracking-widest uppercase text-[10px]">{bot.count} hits</span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-bg-elevated border border-border shadow-inner mb-2.5">
                <div 
                  className="bg-indigo-500 transition-all shadow-[0_0_8px_rgba(99,102,241,0.5)]" 
                  style={{ width: `${Math.min(100, (bot.count / stats.total_hits) * 100)}%` }} 
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {Object.entries(bot.locales).map(([lang, count]) => (
                    <span key={lang} className="text-[9px] font-bold font-mono text-zinc-500 bg-bg-elevated border border-border px-1.5 py-0.5 rounded-md uppercase tracking-widest">
                      {lang}: {count}
                    </span>
                  ))}
                </div>
                {bot.last_seen && (
                  <span className="text-[9px] font-bold font-mono text-zinc-600 uppercase tracking-widest">
                    Last: {new Date(bot.last_seen).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 快捷操作 ──────────────────────────────────────────────── */

const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon; desc: string }[] = [
  { label: "用户管理", href: "/admin/users", icon: Users, desc: "搜索/封禁/调整等级" },
  { label: "API 密钥", href: "/admin/api-keys", icon: Key, desc: "管理第三方密钥" },
  { label: "数据源", href: "/admin/datasources", icon: Database, desc: "开关数据源" },
  { label: "系统监控", href: "/admin/monitor", icon: Monitor, desc: "智能体/编排器" },
  { label: "模型分工", href: "/admin/models", icon: Brain, desc: "切换模型映射" },
  { label: "参数设置", href: "/settings/configs", icon: Settings, desc: "运行时参数" },
];

function QuickActions() {
  return (
    <div className="bg-bg-surface border border-border rounded-xl shadow-inner overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-bg-primary/30">
        <span className="text-sm font-bold text-zinc-300 tracking-wide">快捷操作</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        {QUICK_ACTIONS.map((act) => {
          const Icon = act.icon;
          return (
            <Link
              key={act.href}
              href={act.href}
              className="flex items-center gap-3 bg-bg-surface px-4 py-4 hover:bg-bg-elevated transition-colors group"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-primary border border-border shadow-inner text-zinc-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-colors">
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-300 group-hover:text-white transition-colors">
                  {act.label}
                </p>
                <p className="text-[10px] font-bold font-mono text-zinc-500 mt-0.5 uppercase tracking-widest">{act.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── 页面主体 ──────────────────────────────────────────────── */

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [error, setError] = useState("");

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [llmCost, setLLMCost] = useState<LLMCostSummary | null>(null);
  const [crawlerStats, setCrawlerStats] = useState<CrawlerStats | null>(null);
  const [configs, setConfigs] = useState<SystemConfig[]>([]);

  const [loading, setLoading] = useState(true);

  // Use the shared live hook for WebSocket stats
  const { data: onlineStats } = useAdminOnlineStats();

  const healthData = undefined;
  const apiCallData = undefined;

  useEffect(() => {
    fetchDashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    fetchLLMCost().then(setLLMCost).catch(() => {});
    fetchCrawlerStats().then(setCrawlerStats).catch(() => {});
    fetchConfigs().then(setConfigs).catch(() => {});
  }, []);

  if (!user || user.role !== "admin") return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-6">
        <Skeleton w="10rem" h="1.25rem" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-red-400">{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const fmtUsd = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-6 py-6 space-y-6">
        {/* ── Header ── */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white font-mono">运营概览 / DASHBOARD</h1>
            <p className="text-[10px] mt-2 font-bold font-mono text-zinc-500 uppercase tracking-widest">
              ADMIN CONTROL PANEL • {new Date().toLocaleDateString("zh-CN")}
            </p>
          </div>
          <div className="h-px w-24 bg-gradient-to-r from-indigo-500/30 to-transparent hidden md:block" />
        </div>

        {/* ── System health grid ── */}
        <SystemHealthGrid services={healthData} />

        {/* ── KPI row (6 columns) ── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
          <KpiCard
            label="总用户"
            value={stats.total_users}
            sub={`今日 +${stats.new_users_today}`}
            icon={Users}
            color="bg-indigo-500/10 text-indigo-400"
          />
          <KpiCard
            label="7日新增"
            value={stats.new_users_7d}
            icon={UserPlus}
            color="bg-emerald-500/10 text-emerald-400"
          />
          <KpiCard
            label="累计收入"
            value={fmtUsd(stats.total_revenue_usd)}
            sub={`30d ${fmtUsd(stats.revenue_30d_usd)}`}
            icon={DollarSign}
            color="bg-amber-500/10 text-amber-400"
          />
          <KpiCard
            label="待处理支付"
            value={stats.pending_payments}
            icon={Clock}
            color={stats.pending_payments > 0 ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-bg-elevated border-border text-zinc-500"}
          />
          <KpiCard
            label="策略 24h"
            value={`+${stats.strategies_24h}`}
            sub={`累计 ${stats.total_strategies}`}
            icon={TrendingUp}
            color="bg-indigo-500/10 text-indigo-400"
          />
          <KpiCard
            label="共识 24h"
            value={`+${stats.consensus_24h}`}
            sub={`累计 ${stats.total_consensus}`}
            icon={Brain}
            color="bg-purple-500/10 text-purple-400"
          />
          <KpiCard
            label="登录在线"
            value={onlineStats?.logged_in_online ?? 0}
            sub={`WS 价格${onlineStats?.price ?? 0} / 预警${onlineStats?.alerts ?? 0}`}
            icon={Wifi}
            color={(onlineStats?.logged_in_online ?? 0) > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"}
          />
        </div>

        {/* ── Middle row: Tier + Crawler + Cost + Activity ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TierBar free={stats.free_users} pro={stats.pro_users} flagship={stats.flagship_users} />
          {crawlerStats ? (
            <CrawlerStatsCard stats={crawlerStats} />
          ) : (
            <div className="bg-bg-surface border border-border rounded-xl shadow-inner p-5 flex items-center justify-center">
              <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest animate-pulse">爬虫数据加载中…</span>
            </div>
          )}
          {llmCost ? (
            <LLMCostCompact cost={llmCost} />
          ) : (
            <div className="bg-bg-surface border border-border rounded-xl shadow-inner p-5 flex items-center justify-center">
              <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-widest animate-pulse">AI 成本数据加载中…</span>
            </div>
          )}
          <div className="bg-bg-surface border border-border rounded-xl shadow-inner p-5 space-y-4">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">系统活跃度</span>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">智能体报告</p>
                <p className="text-2xl font-black font-mono text-zinc-200 tracking-tight">{stats.total_agent_reports}</p>
                <p className="text-[10px] font-bold font-mono text-indigo-400 uppercase tracking-widest mt-2 bg-indigo-500/10 inline-block px-1.5 py-0.5 rounded">24h +{stats.agent_reports_24h}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">预警规则</p>
                <p className="text-2xl font-black font-mono text-zinc-200 tracking-tight">{stats.total_alert_rules}</p>
                <p className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-widest mt-2 bg-emerald-500/10 inline-block px-1.5 py-0.5 rounded">活跃 {stats.active_alert_rules}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── API call chart ── */}
        <ApiCallChart data={apiCallData} />

        {/* ── User table + Config health + Quick actions ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <AdminUserTable />
          </div>
          <div className="space-y-4">
            <ConfigHealthList configs={configs} />
            <QuickActions />
          </div>
        </div>
      </div>
    </div>
  );
}