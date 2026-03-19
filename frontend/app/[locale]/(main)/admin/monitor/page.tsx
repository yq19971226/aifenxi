"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { useAdminOnlineStats, useSystemHealth, useDataSourceHealth } from "@/lib/hooks/useAdminMonitor";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── 智能体注册表 ──────────────────────────────────────────

const AGENTS_CONFIG = [
  { id: "technical", modelDefault: "claude-sonnet", icon: <TrendingUp size={16} />, phase: "core", modeKeys: ["intraday", "trend"] },
  { id: "onchain", modelDefault: "deepseek-v3.2-thinking", icon: <Database size={16} />, phase: "core", modeKeys: ["intraday", "trend"] },
  { id: "sentiment", modelDefault: "grok-fast", icon: <Activity size={16} />, phase: "core", modeKeys: ["trend"] },
  { id: "orderbook", modelDefault: "qwen3-max", icon: <BarChart3 size={16} />, phase: "core", modeKeys: ["intraday", "trend"] },
  { id: "risk", modelDefault: "claude-haiku", icon: <Shield size={16} />, phase: "core", modeKeys: ["intraday", "trend"] },
  { id: "news_analyst", modelDefault: "grok-fast", icon: <Newspaper size={16} />, phase: "enhance", modeKeys: ["intraday", "trend"] },
  { id: "calendar", modelDefault: "grok-fast", icon: <Clock size={16} />, phase: "enhance", modeKeys: ["intraday", "trend"] },
  { id: "reflection", modelDefault: "deepseek-r1", icon: <Lightbulb size={16} />, phase: "enhance", modeKeys: ["offline"] },
  { id: "adversarial", modelDefault: "deepseek-r1", icon: <Swords size={16} />, phase: "adversarial", modeKeys: ["trend"] },
  { id: "collusion_detector", modelDefault: "claude-sonnet", icon: <Users size={16} />, phase: "adversarial", modeKeys: ["trend"] },
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
  "core": { bg: "bg-blue-500/10", text: "text-blue-400" },
  "enhance": { bg: "bg-zinc-500/10", text: "text-zinc-400" },
  "adversarial": { bg: "bg-red-500/10", text: "text-red-400" },
};

// ── 系统健康数据 ──────────────────────────────────────────

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
  const { data } = useAdminOnlineStats();
  const t = useTranslations("admin");

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="mb-1 text-sm font-semibold text-white">{t("monitor.onlineUsers")}</h2>
          <p className="text-xs text-zinc-500">{t("monitor.websocketSubtitle")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-xs text-zinc-500">{t("monitor.live")}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-accent">{data?.logged_in_online ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("monitor.onlineUsers")}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-zinc-300">{data?.total ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("monitor.totalConnections")}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-400">{data?.price ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("monitor.priceChannel")}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-emerald-400">{data?.alerts ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("monitor.alertChannel")}</p>
        </div>
      </div>
    </div>
  );
}

// ── 数据源健康卡片 ──
function DataSourceHealthCard() {
  const { data } = useDataSourceHealth();
  const t = useTranslations("admin");
  const sources = data?.sources || {};

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5 shadow-inner">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <Database className="text-emerald-500" size={20} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">{t("monitor.datasourceHealth")}</h2>
            <p className="text-xs text-zinc-500">{t("monitor.datasourceHealthDesc")}</p>
          </div>
        </div>
        <div className="text-right">
           <div className="text-xl font-bold text-emerald-400">{(data?.completeness_score || 0).toFixed(1)}%</div>
           <div className="text-[10px] text-zinc-600 uppercase font-bold tracking-tighter">Completeness</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(sources).slice(0, 6).map(([id, s]: [string, any]) => (
          <div key={id} className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.04] transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-tight truncate max-w-[120px]" title={id}>{id.replace('_', ' ')}</span>
              <div className={`h-1.5 w-1.5 rounded-full ${s.connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"}`} />
            </div>
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-1.5">
                  <Activity size={10} className="text-zinc-500" />
                  <span className="text-[10px] font-mono text-zinc-400">{s.message_rate?.toFixed(2) || "0.00"} msg/s</span>
               </div>
               <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                 s.status === 'enabled' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 
                 s.status === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
               }`}>
                 {s.status.toUpperCase()}
               </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 页面组件 ──────────────────────────────────────────────

export default function AdminMonitorPage() {
  const { user } = useAuth();
  const t = useTranslations("admin");
  const [monitorSymbol, setMonitorSymbol] = useState("BTCUSDT");

  const { data: health } = useSystemHealth();

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

  if (!user || user.role !== "admin") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06]">
            <Cpu className="text-zinc-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t("monitor.title")}</h1>
            <p className="text-xs text-zinc-500">
              {t("monitor.subtitle", { count: AGENTS_CONFIG.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{t("monitor.monitorSymbol")}</span>
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
            <span className="text-xs">{t("monitor.backendService")}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {isHealthy ? (
              <CheckCircle size={18} className="text-green-400" />
            ) : (
              <AlertTriangle size={18} className="text-red-400" />
            )}
            <span className={`text-lg font-bold ${isHealthy ? "text-green-400" : "text-red-400"}`}>
              {isHealthy ? t("monitor.statusOk") : t("monitor.statusError")}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {t("monitor.env")}: {health?.status === "ok" && health?.env && String(health.env).toLowerCase() !== "unknown"
              ? health.env
              : "—"}
            {health?.status !== "ok" && (
              <span className="ml-1 text-zinc-600">({t("monitor.statusError")})</span>
            )}
          </p>
        </div>

        {/* 智能体总数 */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Brain size={14} />
            <span className="text-xs">{t("monitor.agentsLabel")}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-accent">{AGENTS_CONFIG.length}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("monitor.agentsCount")}</p>
        </div>

        {/* 反思状态 */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Lightbulb size={14} />
            <span className="text-xs">{t("monitor.reflection")}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {reflectionStatus?.has_data ? (
              <>
                <CheckCircle size={18} className="text-green-400" />
                <span className="text-lg font-bold text-green-400">{t("monitor.reflectionActive")}</span>
              </>
            ) : (
              <>
                <Clock size={18} className="text-zinc-500" />
                <span className="text-lg font-bold text-zinc-500">{t("monitor.reflectionPending")}</span>
              </>
            )}
          </div>
        </div>

        {/* 防御等级 */}
        <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <Shield size={14} />
            <span className="text-xs">{t("monitor.defenseLevel")}</span>
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
            <p className="mt-1 text-xs text-red-400">{t("monitor.collusionDetected")}</p>
          )}
        </div>
      </div>

      {/* 实时状态概览 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <OnlineUsersCard />
        <DataSourceHealthCard />
      </div>

      {/* K 线采集调度器 */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="mb-1 text-sm font-semibold text-white">{t("monitor.klineScheduler")}</h2>
            <p className="text-xs text-zinc-500">
              {t("monitor.klineSchedulerDesc", { seconds: klineScheduler?.cycle_seconds ?? 300 })}
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
              {klineScheduler?.running ? t("monitor.running") : t("monitor.stopped")}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <RefreshCw size={12} />
              <span className="text-xs">{t("monitor.completedRounds")}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">
              {klineScheduler?.rounds_completed ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Database size={12} />
              <span className="text-xs">{t("monitor.collectTasks")}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">
              {klineScheduler?.last_total ?? 0}
              {(klineScheduler?.last_failed ?? 0) > 0 && (
                <span className="ml-1 text-sm text-red-400">
                  ({klineScheduler?.last_failed} {t("monitor.failed")})
                </span>
              )}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Timer size={12} />
              <span className="text-xs">{t("monitor.lastRoundTime")}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white">
              {klineScheduler?.last_elapsed_s ?? 0}s
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Clock size={12} />
              <span className="text-xs">{t("monitor.lastCollect")}</span>
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
            <p className="mb-2 text-xs text-zinc-500">{t("monitor.collectSymbols")}</p>
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
            <p className="mt-2 mb-1 text-xs text-zinc-500">{t("monitor.collectIntervals")}</p>
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
        <h2 className="mb-1 text-sm font-semibold text-white">{t("monitor.agentsList")}</h2>
        <p className="mb-4 text-xs text-zinc-500">{t("monitor.agentsListDesc", { count: AGENTS_CONFIG.length })}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-zinc-500">
                <th className="pb-3 pr-4">{t("monitor.agentHeader")}</th>
                <th className="pb-3 pr-4">{t("monitor.layer")}</th>
                <th className="pb-3 pr-4">{t("monitor.aiModel")}</th>
                <th className="pb-3">{t("monitor.analysisFrequency")}</th>
              </tr>
            </thead>
            <tbody>
              {AGENTS_CONFIG.map((agent) => {
                const phaseColor = PHASE_COLORS[agent.phase] || PHASE_COLORS["core"];
                const actualModel = assignmentMap[agent.id] || agent.modelDefault;
                const isCustom = assignmentMap[agent.id] && assignmentMap[agent.id] !== agent.modelDefault;
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
                          <span className="font-medium text-white">{t(`monitor.agents.${agent.id}.name`)}</span>
                          <p className="text-xs text-zinc-500 mt-0.5">{t(`monitor.agents.${agent.id}.desc`)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${phaseColor.bg} ${phaseColor.text}`}>
                        {t(`monitor.phases.${agent.phase}`)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${modelColor}`}>
                          {MODEL_LABELS[actualModel] ?? actualModel}
                        </span>
                        {isCustom && (
                          <span className="rounded bg-amber-500/20 px-1 py-0.5 text-xs text-amber-400">
                            {t("monitor.custom")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        {agent.modeKeys.map((m) => (
                          <span
                            key={m}
                            className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-zinc-400"
                          >
                            {t(`monitor.modes.${m}`)}
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
        <h2 className="mb-1 text-sm font-semibold text-white">{t("monitor.analysisModes")}</h2>
        <p className="mb-4 text-xs text-zinc-500">{t("monitor.analysisModesDesc")}</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ModeCard
            mode={t("monitor.modes.intraday")}
            label={t("monitor.modeLabels.intraday")}
            count={6}
            agents={[t("monitor.agents.technical.name"), t("monitor.agents.onchain.name"), t("monitor.agents.risk.name"), t("monitor.agents.orderbook.name"), t("monitor.agents.news_analyst.name"), t("monitor.agents.calendar.name"), "+" + t("monitor.agents.reflection.name")]}
            color="text-zinc-400"
          />
          <ModeCard
            mode={t("monitor.modes.trend")}
            label={t("monitor.modeLabels.trend")}
            count={10}
            agents={[
              t("monitor.agents.technical.name"), t("monitor.agents.onchain.name"), t("monitor.agents.risk.name"), t("monitor.agents.orderbook.name"),
              t("monitor.agents.sentiment.name"), t("monitor.agents.news_analyst.name"), t("monitor.agents.calendar.name"), t("monitor.agents.adversarial.name"), t("monitor.agents.collusion_detector.name"),
              "+" + t("monitor.agents.reflection.name"),
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
  const t = useTranslations("admin");
  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${color}`}>{mode}</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-zinc-400">
          {t("monitor.agentsCountLabel", { count })}
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
