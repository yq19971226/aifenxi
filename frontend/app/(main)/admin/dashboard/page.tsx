"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  UserPlus,
  DollarSign,
  Clock,
  Brain,
  TrendingUp,
  FileText,
  Bell,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Stethoscope,
  Settings,
  Key,
  Database,
  Monitor,
  type LucideIcon,
} from "lucide-react";
import { fetchDashboardStats, fetchLLMCost, type DashboardStats, type LLMCostSummary } from "@/lib/api/admin-dashboard";
import { fetchConfigs, type SystemConfig } from "@/lib/api/configs";
import { SkeletonStatCard, Skeleton } from "@/components/ui/Skeleton";
import { SystemHealthGrid } from "@/components/admin/SystemHealthGrid";
import { AdminUserTable } from "@/components/admin/AdminUserTable";
import { ApiCallChart } from "@/components/admin/ApiCallChart";

/* ── 系统体检项定义 ──────────────────────────────────────────── */

interface HealthItem {
  id: string;
  label: string;
  checkFn: (configs: SystemConfig[]) => "ok" | "warn" | "fail";
  okText: string;
  failText: string;
  warnText?: string;
  href: string;
}

const HEALTH_ITEMS: HealthItem[] = [
  {
    id: "ai_key",
    label: "AI 分析引擎",
    checkFn: (c) => c.some((x) => x.config_key === "dmx_api_key") ? "ok" : "fail",
    okText: "已配置，AI 分析功能正常",
    failText: "未配置 AI 密钥，所有分析功能不可用",
    href: "/admin/api-keys",
  },
  {
    id: "news_key",
    label: "新闻数据",
    checkFn: (c) => c.some((x) => x.config_key === "cryptopanic_api_token") ? "ok" : "warn",
    okText: "CryptoPanic 已接入",
    failText: "",
    warnText: "CryptoPanic 未配置，仅使用 BlockBeats（免费）",
    href: "/admin/api-keys",
  },
  {
    id: "onchain_key",
    label: "链上深度数据",
    checkFn: (c) => c.some((x) => x.config_key === "glassnode_api_key") ? "ok" : "warn",
    okText: "GlassNode 已接入，MVRV/NVT 等链上指标可用",
    failText: "",
    warnText: "GlassNode 未配置，链上分析仅使用免费数据源（恐慌贪婪指数）",
    href: "/admin/api-keys",
  },
  {
    id: "params",
    label: "系统参数",
    checkFn: (c) => {
      const has = (k: string) => c.some((x) => x.config_key === k);
      return has("risk_threshold_fear_greed_panic") && has("query_limit_free")
        ? "ok" : "warn";
    },
    okText: "默认参数已初始化",
    failText: "",
    warnText: "部分默认参数未初始化，建议去参数设置一键初始化",
    href: "/settings/configs",
  },
  {
    id: "push",
    label: "消息推送",
    checkFn: (c) => {
      const hasTg = c.some((x) => x.config_key === "telegram_bot_token");
      const hasEmail = c.some((x) => x.config_key === "sendgrid_api_key");
      return hasTg || hasEmail ? "ok" : "warn";
    },
    okText: "推送通道已配置",
    failText: "",
    warnText: "未配置推送通道，预警消息无法送达",
    href: "/admin/api-keys",
  },
];

/* ── 配置体检列表 ──────────────────────────────────────────── */

function ConfigHealthList({ configs }: { configs: SystemConfig[] }) {
  const results = HEALTH_ITEMS.map((item) => ({
    ...item,
    status: item.checkFn(configs),
  }));
  const okCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.filter((r) => r.status === "fail").length;

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Stethoscope size={14} className="text-zinc-500" />
          <span className="text-sm font-medium text-zinc-200">配置体检</span>
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
            failCount > 0
              ? "bg-red-500/10 text-red-400"
              : okCount === results.length
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {failCount > 0
            ? `${failCount} 项异常`
            : okCount === results.length
            ? "全部正常"
            : `${results.length - okCount} 项待配置`}
        </span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {results.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-white/[0.02] group"
          >
            <div className="flex items-center gap-2.5">
              {item.status === "ok" ? (
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              ) : item.status === "warn" ? (
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              ) : (
                <XCircle size={14} className="text-red-400 shrink-0" />
              )}
              <div>
                <span className="text-xs text-zinc-300">{item.label}</span>
                <p
                  className={`text-xs mt-0.5 ${
                    item.status === "ok"
                      ? "text-zinc-500"
                      : item.status === "warn"
                      ? "text-amber-500/70"
                      : "text-red-400/70"
                  }`}
                >
                  {item.status === "ok"
                    ? item.okText
                    : item.status === "warn"
                    ? item.warnText || item.failText
                    : item.failText}
                </p>
              </div>
            </div>
            {item.status !== "ok" && (
              <ArrowRight
                size={12}
                className="text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0"
              />
            )}
          </Link>
        ))}
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
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-zinc-500">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${color}`}>
          <Icon size={13} />
        </div>
      </div>
      <p className="stat-value text-xl text-zinc-100">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

/* ── 会员分布条 ────────────────────────────────────────────── */

function TierBar({ free, pro, flagship }: { free: number; pro: number; flagship: number }) {
  const total = free + pro + flagship || 1;
  const pct = (n: number) => ((n / total) * 100).toFixed(1);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400">会员分布</span>
        <span className="text-sm text-zinc-500">{total} 人</span>
      </div>
      <div className="mb-2.5 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="bg-zinc-500 transition-all" style={{ width: `${pct(free)}%` }} />
        <div className="bg-[var(--color-accent)] transition-all" style={{ width: `${pct(pro)}%` }} />
        <div className="bg-amber-500 transition-all" style={{ width: `${pct(flagship)}%` }} />
      </div>
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
          免费 {free}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          专业 {pro}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          旗舰 {flagship}
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
    "deepseek-r1": "bg-[var(--color-bull)]",
    "deepseek-v3.2-thinking": "bg-[#00D4AA]",
    "claude-sonnet": "bg-[#F59E0B]",
    "grok-fast": "bg-[var(--color-accent)]",
    "grok-code-fast": "bg-[#3B82F6]",
    "qwen3-max": "bg-[#A855F7]",
    "qwen3-next-thinking": "bg-[#C084FC]",
    "claude-haiku": "bg-[#D97706]",
    deepseek: "bg-[var(--color-bull)]",
    "deepseek-reasoner": "bg-[var(--color-bull)]",
    grok: "bg-[var(--color-accent)]",
    claude: "bg-[#F59E0B]",
    qwen: "bg-[#A855F7]",
    gpt4o: "bg-[#74AA9C]",
    gemini: "bg-[#8E75B2]",
    o3: "bg-[#74AA9C]",
  };
  const total = cost.total_cost_usd || 1;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400">今日 AI 成本</span>
        <span className="text-xs text-zinc-500">{cost.date}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-xs text-zinc-500">总成本</p>
          <p className="stat-value text-base text-zinc-200">${cost.total_cost_usd.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Tokens</p>
          <p className="stat-value text-base text-zinc-200">{cost.total_tokens.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">调用</p>
          <p className="stat-value text-base text-zinc-200">{cost.total_calls}</p>
        </div>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06] mb-2">
        {Object.entries(cost.by_model).map(([key, val]) => (
          <div
            key={key}
            className={`${modelColors[key] ?? "bg-zinc-500"} transition-all`}
            style={{ width: `${((val / total) * 100).toFixed(1)}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
        {Object.entries(cost.by_model).map(([key, val]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${modelColors[key] ?? "bg-zinc-500"}`} />
            {modelLabels[key] ?? key} ${val.toFixed(4)}
          </span>
        ))}
      </div>
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
    <div className="card">
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <span className="text-sm font-medium text-zinc-200">快捷操作</span>
      </div>
      <div className="grid grid-cols-2 gap-0 sm:grid-cols-3">
        {QUICK_ACTIONS.map((act) => {
          const Icon = act.icon;
          return (
            <Link
              key={act.href}
              href={act.href}
              className="flex items-center gap-3 border-b border-r border-white/[0.04] px-4 py-3.5 hover:bg-white/[0.02] transition-colors group"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-500 group-hover:text-zinc-300 transition-colors">
                <Icon size={14} />
              </div>
              <div>
                <p className="text-xs text-zinc-300 group-hover:text-zinc-100 transition-colors">
                  {act.label}
                </p>
                <p className="text-xs text-zinc-500">{act.desc}</p>
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [llmCost, setLLMCost] = useState<LLMCostSummary | null>(null);
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const healthData = undefined;
  const apiCallData = undefined;

  useEffect(() => {
    fetchDashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    fetchLLMCost().then(setLLMCost).catch(() => {});
    fetchConfigs().then(setConfigs).catch(() => {});
  }, []);

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
    <div className="mx-auto max-w-[1400px] px-6 py-6 space-y-5">
      {/* ── Header ── */}
      <h1 className="text-xl font-semibold text-zinc-100">运营概览</h1>

      {/* ── System health grid ── */}
      <SystemHealthGrid services={healthData} />

      {/* ── KPI row (6 columns) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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
          color={stats.pending_payments > 0 ? "bg-red-500/10 text-red-400" : "bg-white/[0.04] text-zinc-500"}
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
      </div>

      {/* ── Middle row: Tier + LLM cost + Activity ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TierBar free={stats.free_users} pro={stats.pro_users} flagship={stats.flagship_users} />
        {llmCost ? (
          <LLMCostCompact cost={llmCost} />
        ) : (
          <div className="card p-4">
            <span className="text-xs text-zinc-500">AI 成本数据加载中…</span>
          </div>
        )}
        <div className="card p-4">
          <span className="text-xs text-zinc-400 mb-3 block">系统活跃度</span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-zinc-500">智能体报告</p>
              <p className="stat-value text-base text-zinc-200">{stats.total_agent_reports}</p>
              <p className="text-xs text-zinc-500">24h +{stats.agent_reports_24h}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">预警规则</p>
              <p className="stat-value text-base text-zinc-200">{stats.total_alert_rules}</p>
              <p className="text-xs text-zinc-500">活跃 {stats.active_alert_rules}</p>
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
  );
}