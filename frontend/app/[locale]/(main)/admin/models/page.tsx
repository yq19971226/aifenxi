"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  TrendingUp,
  Database,
  Activity,
  BarChart3,
  Shield,
  Newspaper,
  Clock,
  Lightbulb,
  Swords,
  Users,
  Cpu,
  Save,
  RotateCcw,
  ChevronDown,
  Check,
  AlertTriangle,
  Sparkles,
  Zap,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  fetchAvailableModels,
  fetchModelAssignments,
  updateModelAssignment,
  resetAllAssignments,
  fetchDmxapiSync,
  refreshDmxapiSync,
  type AvailableModel,
  type ModelAssignment,
  type DmxapiSyncResult,
  type DmxapiModelStatus,
} from "@/lib/api/admin-models";
import { useAuth } from "@/lib/auth-context";

/* ── 图标映射 ─────────────────────────────────────────────── */

const AGENT_ICONS: Record<string, React.ReactNode> = {
  technical: <TrendingUp size={16} />,
  onchain: <Database size={16} />,
  sentiment: <Activity size={16} />,
  orderbook: <BarChart3 size={16} />,

  risk: <Shield size={16} />,
  news_analyst: <Newspaper size={16} />,
  calendar: <Clock size={16} />,
  reflection: <Lightbulb size={16} />,
  adversarial: <Swords size={16} />,
  collusion_detector: <Users size={16} />,
  consensus_deepseek: <Sparkles size={16} />,
  consensus_grok: <Sparkles size={16} />,
  consensus_claude: <Sparkles size={16} />,
  consensus_qwen: <Sparkles size={16} />,
};

const PHASE_COLORS: Record<string, { bg: string; text: string }> = {
  "核心" : { bg: "bg-blue-500/10", text: "text-blue-400" },
  "增强" : { bg: "bg-zinc-500/10", text: "text-zinc-400" },
  "对抗" : { bg: "bg-red-500/10", text: "text-red-400" },
  "共识引擎": { bg: "bg-amber-500/10", text: "text-amber-400" },
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

/* ── 模型选择下拉 ────────────────────────────────────────── */

function ModelSelect({
  value,
  defaultValue,
  models,
  onChange,
}: {
  value: string;
  defaultValue: string;
  models: AvailableModel[];
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.model_key === value);
  const isCustom = value !== defaultValue;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors min-w-[200px] ${
          isCustom
            ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
            : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
        }`}
      >
        <span className={`font-medium ${MODEL_COLORS[value] || "text-zinc-300"}`}>
          {current?.display_name ?? value}
        </span>
        {isCustom && (
          <span className="rounded bg-amber-500/20 px-1 py-0.5 text-xs text-amber-400">
            自定义
          </span>
        )}
        <ChevronDown size={12} className="ml-auto text-zinc-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-[320px] rounded-lg border border-white/[0.08] bg-[#0F1422] p-2 shadow-2xl">
            {models.map((m) => (
              <button
                key={m.model_key}
                onClick={() => {
                  onChange(m.model_key);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] ${
                  m.model_key === value ? "bg-white/[0.06]" : ""
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {m.model_key === value ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Zap size={14} className="text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${MODEL_COLORS[m.model_key] || "text-zinc-300"}`}>
                      {m.display_name}
                    </span>
                    {m.model_key === defaultValue && (
                      <span className="rounded bg-blue-500/20 px-1 py-0.5 text-xs text-blue-400">
                        默认
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{m.description}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    费用: ${m.pricing.input}/千输入 · ${m.pricing.output}/千输出
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── 页面主体 ─────────────────────────────────────────────── */

export default function AdminModelsPage() {
  const { user } = useAuth();
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [assignments, setAssignments] = useState<ModelAssignment[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [dmxapiSync, setDmxapiSync] = useState<DmxapiSyncResult | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [m, a] = await Promise.all([fetchAvailableModels(), fetchModelAssignments()]);
      setModels(m);
      setAssignments(a);
      setPendingChanges({});
      setError("");
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleModelChange = (agentId: string, modelKey: string) => {
    const original = assignments.find((a) => a.agent_id === agentId);
    if (original && original.current_model_key === modelKey) {
      const next = { ...pendingChanges };
      delete next[agentId];
      setPendingChanges(next);
    } else {
      setPendingChanges((prev) => ({ ...prev, [agentId]: modelKey }));
    }
    setSuccessMsg("");
  };

  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) return;
    setSaving(true);
    setError("");
    try {
      for (const [agentId, modelKey] of Object.entries(pendingChanges)) {
        await updateModelAssignment(agentId, modelKey);
      }
      setSuccessMsg(`已保存 ${Object.keys(pendingChanges).length} 项模型变更`);
      await loadData();
    } catch (e: any) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    if (!confirm("确定恢复所有智能体的默认模型分配？")) return;
    setSaving(true);
    try {
      await resetAllAssignments();
      setSuccessMsg("已恢复所有默认模型分配");
      await loadData();
    } catch (e: any) {
      setError(e.message || "重置失败");
    } finally {
      setSaving(false);
    }
  };

  const hasCustom = assignments.some((a) => a.is_custom);
  const changeCount = Object.keys(pendingChanges).length;

  // DMXAPI 模型可用性映射
  const dmxapiStatusMap: Record<string, DmxapiModelStatus> = {};
  if (dmxapiSync) {
    for (const r of dmxapiSync.results) {
      dmxapiStatusMap[r.model_key] = r;
    }
  }

  const handleDmxapiSync = async (force = false) => {
    setSyncLoading(true);
    setSyncError("");
    try {
      const result = force ? await refreshDmxapiSync() : await fetchDmxapiSync();
      setDmxapiSync(result);
    } catch (e: any) {
      setSyncError(e.message || "DMXAPI 同步失败");
    } finally {
      setSyncLoading(false);
    }
  };

  // 按 phase 分组
  const grouped: Record<string, ModelAssignment[]> = {};
  for (const a of assignments) {
    if (!grouped[a.phase]) grouped[a.phase] = [];
    grouped[a.phase].push(a);
  }

  if (!user || user.role !== "admin") return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06]">
            <Cpu className="text-zinc-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AI 模型分工</h1>
            <p className="text-xs text-zinc-500">
              自定义每个智能体使用的 AI 模型，模型出问题时可快速切换
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasCustom && (
            <button
              onClick={handleResetAll}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.04] disabled:opacity-50"
            >
              <RotateCcw size={12} />
              恢复默认
            </button>
          )}
          <button
            onClick={() => handleDmxapiSync(false)}
            disabled={syncLoading}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncLoading ? "animate-spin" : ""} />
            {syncLoading ? "同步中..." : "同步 DMXAPI"}
          </button>
          <button
            onClick={handleSave}
            disabled={changeCount === 0 || saving}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
              changeCount > 0
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-white/[0.06] text-zinc-500"
            }`}
          >
            <Save size={12} />
            {saving ? "保存中..." : changeCount > 0 ? `保存 (${changeCount})` : "保存"}
          </button>
        </div>
      </div>

      {/* 提示信息 */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-400">
          {successMsg}
        </div>
      )}
      {changeCount > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-400 flex items-center gap-2">
          <AlertTriangle size={14} />
          有 {changeCount} 项未保存的模型变更，点击「保存」生效
        </div>
      )}
      {syncError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          DMXAPI 同步失败: {syncError}
        </div>
      )}

      {/* DMXAPI 同步状态概览 */}
      {dmxapiSync && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wifi size={14} className="text-emerald-400" />
              <span className="text-sm font-medium text-white">DMXAPI 模型可用性</span>
              <span className="text-xs text-zinc-500">
                DMXAPI 共 {dmxapiSync.dmxapi_total_models} 个模型
              </span>
            </div>
            <button
              onClick={() => handleDmxapiSync(true)}
              disabled={syncLoading}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw size={12} className={syncLoading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-400">
              ✅ {dmxapiSync.system_available} 个可用
            </span>
            {dmxapiSync.system_unavailable > 0 && (
              <span className="text-red-400 font-medium">
                ❌ {dmxapiSync.system_unavailable} 个已下架
              </span>
            )}
          </div>
          {dmxapiSync.system_unavailable > 0 && (
            <div className="mt-3 space-y-2">
              {dmxapiSync.results
                .filter((r) => !r.available)
                .map((r) => (
                  <div
                    key={r.model_key}
                    className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <WifiOff size={12} className="text-red-400" />
                      <span className="text-xs font-medium text-red-300">
                        {r.display_name}
                      </span>
                      <span className="text-xs text-red-400/60 font-mono">{r.model_name}</span>
                    </div>
                    {r.suggestions.length > 0 && (
                      <div className="mt-1">
                        <span className="text-xs text-zinc-500">可能的替代: </span>
                        <span className="text-xs text-zinc-400">
                          {r.suggestions.slice(0, 5).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 分组展示 */}
      {Object.entries(grouped).map(([phase, items]) => {
        const phaseColor = PHASE_COLORS[phase] || PHASE_COLORS["核心"];
        return (
          <div key={phase} className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${phaseColor.bg} ${phaseColor.text}`}>
                {phase}
              </span>
              <span className="text-xs text-zinc-500">{items.length} 个智能体</span>
            </div>
            <div className="space-y-2">
              {items.map((item) => {
                const effectiveModel =
                  pendingChanges[item.agent_id] ?? item.current_model_key;
                const hasPending = item.agent_id in pendingChanges;
                return (
                  <div
                    key={item.agent_id}
                    className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                      hasPending
                        ? "bg-amber-500/5 border border-amber-500/20"
                        : "bg-white/[0.02] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-zinc-400 shrink-0">
                        {AGENT_ICONS[item.agent_id] || <Brain size={16} />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">
                            {item.agent_name}
                          </span>
                          {item.is_custom && !hasPending && (
                            <span className="rounded bg-amber-500/20 px-1 py-0.5 text-xs text-amber-400">
                              已自定义
                            </span>
                          )}
                          {hasPending && (
                            <span className="rounded bg-amber-500/30 px-1 py-0.5 text-xs text-amber-300 animate-pulse">
                              待保存
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">
                          {item.agent_desc}
                        </p>
                      </div>
                    </div>
                    <ModelSelect
                      value={effectiveModel}
                      defaultValue={item.default_model_key}
                      models={models}
                      onChange={(key) => handleModelChange(item.agent_id, key)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 模型说明卡片 */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0F1422] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">可用模型一览</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {models.map((m) => (
            <div
              key={m.model_key}
              className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${MODEL_COLORS[m.model_key] || "text-zinc-300"}`}>
                  {m.display_name}
                </span>
                <div className="flex items-center gap-2">
                  {dmxapiStatusMap[m.model_key] && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      dmxapiStatusMap[m.model_key].available
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}>
                      {dmxapiStatusMap[m.model_key].available ? "在线" : "已下架"}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500 font-mono">{m.model_name}</span>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mb-2">{m.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {m.strengths.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-zinc-400"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-zinc-500 whitespace-nowrap ml-2">
                  ${m.pricing.input}/${m.pricing.output}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
