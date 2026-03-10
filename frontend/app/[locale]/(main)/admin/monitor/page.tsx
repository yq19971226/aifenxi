"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders } from "@/lib/api/auth";
import { fetchModelAssignments } from "@/lib/api/admin-models";
import {
  Activity,
  Brain,
  CheckCircle,
  Clock,
  AlertTriangle,
  Shield,
  Swords,
  Users,
  Lightbulb,
  Newspaper,
  TrendingUp,
  BarChart3,
  Cpu,
  Database,
  Wifi,
  RefreshCw,
  Timer,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── 智能体注册表 ──────────────────────────────────────────

interface AgentMeta {
  id: string;
  name: string;
  desc: string;
  model: string;
  icon: React.ReactNode;
  phase: string;
  modes: string[];
}

const AGENTS: AgentMeta[] = [
  { id: "technical", name: "技术分析", desc: "K线形态、指标信号、支撑压力位", model: "claude-sonnet", icon: <TrendingUp size={16} />, phase: "核心层", modes: ["超短线", "日内", "趋势"] },
  { id: "onchain", name: "链上数据", desc: "资金动向、交易所流入流出、矿工储备", model: "deepseek-v3.2-thinking", icon: <Database size={16} />, phase: "核心层", modes: ["日内", "趋势"] },
  { id: "sentiment", name: "舆情分析", desc: "恐贪指数、社交热度、流量动向", model: "grok-fast", icon: <Activity size={16} />, phase: "核心层", modes: ["趋势"] },
  { id: "orderbook", name: "订单簿", desc: "买卖盘深度、大单挂单、挂单价", model: "qwen3-max", icon: <BarChart3 size={16} />, phase: "核心层", modes: ["日内", "趋势"] },
  { id: "risk", name: "风险评估", desc: "仓位风险、止损建议、盈亏比", model: "claude-haiku", icon: <Shield size={16} />, phase: "核心层", modes: ["日内", "趋势"] },
  { id: "news_analyst", name: "新闻分析", desc: "全球加密新闻解读、监管政策影响", model: "grok-fast", icon: <Newspaper size={16} />, phase: "增强层", modes: ["日内", "趋势"] },
  { id: "calendar", name: "日历事件", desc: "代币解锁、上线、减半等事件影响评估", model: "grok-fast", icon: <Clock size={16} />, phase: "增强层", modes: ["日内", "趋势"] },
  { id: "reflection", name: "反思复盘", desc: "回顾历史判断准确率，持续自我改进", model: "deepseek-r1", icon: <Lightbulb size={16} />, phase: "增强层", modes: ["离线"] },
  { id: "adversarial", name: "对抗推演", desc: "站在庄家视角反推下一步操盘策略", model: "deepseek-r1", icon: <Swords size={16} />, phase: "对抗层", modes: ["趋势"] },
  { id: "collusion_detector", name: "合谋检测", desc: "检测对倒交易、协作拉盘、恶意操纵", model: "claude-sonnet", icon: <Users size={16} />, phase: "对抗层", modes: ["趋势"] },
];

const MODEL_LABELS: Record<string, string> = {
  "deepseek-r1": "DeepSeek R1-671B",
  "deepseek-v3.2-thinking": "DeepSeek V3.2 Thinking",
  "claude-sonnet": "Claude Sonnet 4.5",
  "grok-fast": "Grok-4 Fast",
  "grok-code-fast": "Grok Code Fast",
  "qwen3-max": "Qwen3 Max",
  "qwen3-next-thinking": "Qwen3 Next Thinking",
  "claude-haiku": "Claude Haiku 4.5",
  deepseek: "DeepSeek V3 通用",
  "deepseek-reasoner": "DeepSeek R1",
  grok: "Grok-4 标准",
  claude: "Claude Sonnet 4.5",
  qwen: "Qwen3 Max",
  gpt4o: "GPT-4o",
  gemini: "Gemini 2.5 Pro",
  o3: "OpenAI o3",
};

const MODEL_COLORS: Record<string, string> = {
  "deepseek-r1": "text-[#00D4AA]",
  "deepseek-v3.2-thinking": "text-[#00D4AA]",
  "claude-sonnet": "text-[#D97706]",
  "grok-fast": "text-[#10A37F]",
  "grok-code-fast": "text-[#10A37F]",
  "qwen3-max": "text-[#4285F4]",
  "qwen3-next-thinking": "text-[#4285F4]",
  "claude-haiku": "text-[#D97706]",
  deepseek: "text-[#00D4AA]",
  "deepseek-reasoner": "text-[#00D4AA]",
  grok: "text-[#10A37F]",
  claude: "text-[#D97706]",
  qwen: "text-[#4285F4]",
  gpt4o: "text-[#74AA9C]",
  gemini: "text-[#8E75B2]",
  o3: "text-[#74AA9C]",
};

const PHASE_COLORS: Record<string, { bg: string; text: string }> = {
  "核心层": { bg: "bg-blue-500/10", text: "text-blue-400" },
  "增强层": { bg: "bg-zinc-500/10", text: "text-zinc-400" },
  "对抗层": { bg: "bg-red-500/10", text: "text-red-400" },
};

// ── 系统健康数据 ──────────────────────────────────────────

interface HealthData {
  status: string;
  env: string;
}

async function fetchHealth(): Promise<HealthData> {
  try {
    const url = API_BASE ? `${API_BASE}/health` : "/health";
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`health_status_${res.status}`);
    const data = await res.json();
    return data;
  } catch {
    return { status: "error", env: "unknown" };
  }
}

interface KlineSchedulerStatus {
  running: boolean;
  symbols: string[];
  intervals: string[];
  cycle_seconds: number;
  rounds_completed: number;
  last_collect_at: string | null;
  last_total: number;
  last_failed: number;
  last_elapsed_s: number;
  message?: string;
}

async function fetchKlineScheduler(): Promise<KlineSchedulerStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/system/kline-scheduler`, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

interface ReflectionStatus {
  has_data: boolean;
  symbol: string;
}

async function fetchReflectionStatus(symbol: string): Promise<ReflectionStatus> {
  try {
    const res = await fetch(
      `${API_BASE}/api/reflection/context?symbol=${symbol}`,
      { headers: authHeaders() }
    );
    if (!res.ok) return { has_data: false, symbol };
    const data = await res.json();
    return { has_data: data.has_context ?? false, symbol };
  } catch {
    return { has_data: false, symbol };
  }
}

interface DefenseStatus {
  alert_level: string;
  collusion_detected: boolean;
}

async function fetchDefenseStatus(symbol: string): Promise<DefenseStatus> {
  try {
    const res = await fetch(
      `${API_BASE}/api/defense/alert-level?symbol=${symbol}`,
      { headers: authHeaders() }
    );
    if (!res.ok) return { alert_level: "none", collusion_detected: false };
    const data = await res.json();
    return {
      alert_level: data.alert_level ?? "none",
      collusion_detected: data.collusion_detected ?? false,
    };
  } catch {
    return { alert_level: "none", collusion_detected: false };
  }
}

// ── 在线用户卡片 ────────────────────────────────────────

function OnlineUsersCard() {
  const { data } = useQuery({
    queryKey: ["admin-online-stats"],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/stats/online`, { headers: authHeaders() });
        if (!res.ok) return { total: 0, price: 0, alerts: 0 };
        const d = await res.json();
        return { total: d.count ?? 0, price: d.price ?? 0, alerts: d.alerts ?? 0 };
      } catch {
        return { total: 0, price: 0, alerts: 0 };
      }
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="mb-1 text-sm font-semibold text-white">在线用户</h2>
          <p className="text-xs text-zinc-500">WebSocket 实时连接（30s 刷新）</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-xs text-zinc-500">实时</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-accent">{data?.total ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">总连接</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-400">{data?.price ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">价格频道</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-emerald-400">{data?.alerts ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">预警频道</p>
        </div>
      </div>
    </div>
  );
}

// ── 页面组件 ──────────────────────────────────────────────

export default function AdminMonitorPage() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return null;
  const [monitorSymbol, setMonitorSymbol] = useState("BTCUSDT");

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
  });

  const { data: modelAssignments } = useQuery({
    queryKey: ["model-assignments"],
    queryFn: fetchModelAssignments,
    refetchInterval: 30_000,
  });

  // 构建 agent_id → 实际 model_key 的映射
  const assignmentMap: Record<string, string> = {};
  if (modelAssignments) {
    for (const a of modelAssignments) {
      assignmentMap[a.agent_id] = a.current_model_key;
    }
  }

  const { data: reflectionStatus } = useQuery({
    queryKey: ["reflection-status", monitorSymbol],
    queryFn: () => fetchReflectionStatus(monitorSymbol),
    refetchInterval: 60_000,
  });

  const { data: defenseStatus } = useQuery({
    queryKey: ["defense-status", monitorSymbol],
    queryFn: () => fetchDefenseStatus(monitorSymbol),
    refetchInterval: 30_000,
  });

  const { data: klineScheduler } = useQuery({
    queryKey: ["kline-scheduler"],
    queryFn: fetchKlineScheduler,
    refetchInterval: 15_000,
  });

  const isHealthy = health?.status === "ok";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06]">
            <Cpu className="text-zinc-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">系统监控</h1>
            <p className="text-xs text-zinc-500">
              {AGENTS.length} 个 AI 智能体 · 多维度市场分析
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">监控币种</span>
          <select
            value={monitorSymbol}
            onChange={(e) => setMonitorSymbol(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-indigo-500/40"
          >
            {(klineScheduler?.symbols ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 系统状态卡片 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {/* 后端健康 */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Wifi size={14} />
            <span className="text-xs">后端服务</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {isHealthy ? (
              <CheckCircle size={18} className="text-green-400" />
            ) : (
              <AlertTriangle size={18} className="text-red-400" />
            )}
            <span className={`text-lg font-bold ${isHealthy ? "text-green-400" : "text-red-400"}`}>
              {isHealthy ? "正常" : "异常"}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            环境: {health?.status === "ok" && health?.env && String(health.env).toLowerCase() !== "unknown"
              ? health.env
              : "—"}
            {health?.status !== "ok" && (
              <span className="ml-1 text-zinc-600">(无法连接)</span>
            )}
          </p>
        </div>

        {/* 智能体总数 */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Brain size={14} />
            <span className="text-xs">智能体</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-accent">{AGENTS.length}</p>
          <p className="mt-1 text-xs text-zinc-500">核心5 + 增强3 + 对抗2</p>
        </div>

        {/* 反思状态 */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Lightbulb size={14} />
            <span className="text-xs">反思注入</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {reflectionStatus?.has_data ? (
              <>
                <CheckCircle size={18} className="text-green-400" />
                <span className="text-lg font-bold text-green-400">活跃</span>
              </>
            ) : (
              <>
                <Clock size={18} className="text-zinc-500" />
                <span className="text-lg font-bold text-zinc-500">待触发</span>
              </>
            )}
          </div>
        </div>

        {/* 防御等级 */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Shield size={14} />
            <span className="text-xs">防御等级</span>
          </div>
          <p className={`mt-2 text-lg font-bold ${
            defenseStatus?.alert_level === "high" || defenseStatus?.alert_level === "critical"
              ? "text-red-400"
              : defenseStatus?.alert_level === "medium"
              ? "text-yellow-400"
              : "text-green-400"
          }`}>
            {(defenseStatus?.alert_level || "none").toUpperCase()}
          </p>
          {defenseStatus?.collusion_detected && (
            <p className="mt-1 text-xs text-red-400">合谋检测异常</p>
          )}
        </div>
      </div>

      {/* 在线用户 */}
      <OnlineUsersCard />

      {/* K 线采集调度器 */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="mb-1 text-sm font-semibold text-white">K 线数据采集</h2>
            <p className="text-xs text-zinc-500">
              自动从 Binance 拉取 K 线数据并缓存，每 {klineScheduler?.cycle_seconds ?? 300} 秒一轮
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              klineScheduler?.running
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                klineScheduler?.running ? "bg-green-400" : "bg-red-400"
              }`} />
              {klineScheduler?.running ? "运行中" : "已停止"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <RefreshCw size={12} />
              <span className="text-xs">已完成轮次</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">
              {klineScheduler?.rounds_completed ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Database size={12} />
              <span className="text-xs">采集任务</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">
              {klineScheduler?.last_total ?? 0}
              {(klineScheduler?.last_failed ?? 0) > 0 && (
                <span className="ml-1 text-sm text-red-400">
                  ({klineScheduler?.last_failed} 失败)
                </span>
              )}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Timer size={12} />
              <span className="text-xs">上轮耗时</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">
              {klineScheduler?.last_elapsed_s ?? 0}s
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Clock size={12} />
              <span className="text-xs">上次采集</span>
            </div>
            <p className="mt-1 text-sm font-medium text-white">
              {klineScheduler?.last_collect_at
                ? new Date(klineScheduler.last_collect_at).toLocaleTimeString("zh-CN")
                : "—"}
            </p>
          </div>
        </div>

        {klineScheduler?.symbols && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-zinc-500">采集币种</p>
            <div className="flex flex-wrap gap-1.5">
              {klineScheduler.symbols.map((s) => (
                <span
                  key={s}
                  className="rounded bg-white/[0.06] px-2 py-0.5 text-xs text-zinc-400"
                >
                  {s}
                </span>
              ))}
            </div>
            <p className="mt-2 mb-1 text-xs text-zinc-500">采集周期</p>
            <div className="flex flex-wrap gap-1.5">
              {klineScheduler.intervals.map((i) => (
                <span
                  key={i}
                  className="rounded bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-400"
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 智能体列表 */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5">
        <h2 className="mb-1 text-sm font-semibold text-white">AI 智能体一览</h2>
        <p className="mb-4 text-xs text-zinc-500">系统内置 {AGENTS.length} 个 AI 智能体，从不同维度分析市场并给出综合建议</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-zinc-500">
                <th className="pb-3 pr-4">智能体</th>
                <th className="pb-3 pr-4">层级</th>
                <th className="pb-3 pr-4">AI 模型</th>
                <th className="pb-3">分析频率</th>
              </tr>
            </thead>
            <tbody>
              {AGENTS.map((agent) => {
                const phaseColor = PHASE_COLORS[agent.phase] || PHASE_COLORS["核心层"];
                const actualModel = assignmentMap[agent.id] || agent.model;
                const isCustom = assignmentMap[agent.id] && assignmentMap[agent.id] !== agent.model;
                const modelColor = MODEL_COLORS[actualModel] || "text-zinc-400";
                return (
                  <tr
                    key={agent.id}
                    className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">{agent.icon}</span>
                        <div>
                          <span className="font-medium text-white">{agent.name}</span>
                          <p className="text-xs text-zinc-500 mt-0.5">{agent.desc}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${phaseColor.bg} ${phaseColor.text}`}>
                        {agent.phase}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${modelColor}`}>
                          {MODEL_LABELS[actualModel] ?? actualModel}
                        </span>
                        {isCustom && (
                          <span className="rounded bg-amber-500/20 px-1 py-0.5 text-xs text-amber-400">
                            自定义
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        {agent.modes.map((m) => (
                          <span
                            key={m}
                            className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-zinc-400"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分析模式说明 */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5">
        <h2 className="mb-1 text-sm font-semibold text-white">分析模式</h2>
        <p className="mb-4 text-xs text-zinc-500">系统会根据市场情况自动选择合适的分析模式，调度不同数量的智能体</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ModeCard
            mode="超短线"
            label="秒级判断，适合短线交易"
            count={1}
            agents={["技术分析"]}
            color="text-blue-400"
          />
          <ModeCard
            mode="日内"
            label="分钟级分析，适合日内波段"
            count={6}
            agents={["技术分析", "链上数据", "风险评估", "订单簿", "新闻分析", "日历事件", "+反思注入"]}
            color="text-zinc-400"
          />
          <ModeCard
            mode="趋势"
            label="全维度深度分析，适合中长线布局"
            count={10}
            agents={[
              "技术分析", "链上数据", "风险评估", "订单簿",
              "舆情分析", "新闻分析", "日历事件", "对抗推演", "合谋检测",
              "+反思注入",
            ]}
            color="text-orange-400"
          />
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  label,
  count,
  agents,
  color,
}: {
  mode: string;
  label: string;
  count: number;
  agents: string[];
  color: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${color}`}>{mode}</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-zinc-400">
          {count} 智能体
        </span>
      </div>
      <p className="mb-2 text-xs text-zinc-500">{label}</p>
      <div className="flex flex-wrap gap-1">
        {agents.map((a) => (
          <span
            key={a}
            className={`rounded px-1.5 py-0.5 text-xs ${
              a.startsWith("+")
                ? "bg-white/[0.06] text-zinc-400"
                : "bg-white/[0.06] text-zinc-400"
            }`}
          >
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}
