"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Activity,
  Wifi,
  WifiOff,
  Info,
  Newspaper,
  Link2,
} from "lucide-react";
import {
  getDataSourceStatus,
  getDataSourceHealth,
  getSourceMetrics,
  toggleCombo,
  toggleExchange,
  toggleCoinGlass,
  toggleCoinGecko,
  getCoinGeckoUsage,
  updateCoinGeckoTier,
  toggleGroup,
  toggleCollector,
  listDataSourceGroups,
  testDatasourceConnection,
  type DataSourceStatusSnapshot,
  type HealthSummary,
  type DataSourceStatus,
  type RateHistoryPoint,
} from "@/lib/api/datasources";
import { RateHistoryChart } from "@/components/cards/RateHistoryChart";
import { useAuth } from "@/lib/auth-context";
import { motion } from "framer-motion";

// ── 辅助组件 ─────────────────────────────────────────────────

function StatusBadge({
  status,
  variant = "connection",
}: {
  status: DataSourceStatus | "unknown";
  variant?: "connection" | "readiness";
}) {
  const maps: Record<string, Record<string, { label: string; cls: string; icon: React.ReactNode }>> = {
    connection: {
      enabled: {
        label: "正常连接",
        cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        icon: <CheckCircle2 className="h-3 w-3" />,
      },
      disabled: {
        label: "已关闭",
        cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
        icon: <XCircle className="h-3 w-3" />,
      },
      error: {
        label: "连接错误",
        cls: "bg-red-500/20 text-red-400 border-red-500/30",
        icon: <XCircle className="h-3 w-3" />,
      },
      stale: {
        label: "数据陈旧",
        cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        icon: <Clock className="h-3 w-3" />,
      },
      unknown: {
        label: "未知",
        cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
        icon: <AlertTriangle className="h-3 w-3" />,
      },
    },
    readiness: {
      enabled: {
        label: "主源就绪",
        cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        icon: <CheckCircle2 className="h-3 w-3" />,
      },
      disabled: {
        label: "已关闭",
        cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
        icon: <XCircle className="h-3 w-3" />,
      },
      error: {
        label: "主源未就绪",
        cls: "bg-red-500/20 text-red-400 border-red-500/30",
        icon: <XCircle className="h-3 w-3" />,
      },
      stale: {
        label: "降级运行",
        cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        icon: <Clock className="h-3 w-3" />,
      },
      unknown: {
        label: "未知",
        cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
        icon: <AlertTriangle className="h-3 w-3" />,
      },
    },
  };
  const map = maps[variant] ?? maps.connection;
  const cfg = map[status] ?? map.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  loading,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !loading && !disabled && onChange(!checked)}
      disabled={loading || disabled}
      className={`relative transition-opacity ${
        loading || disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      }`}
      title={checked ? "点击关闭" : "点击开启"}
    >
      {loading ? (
        <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
      ) : checked ? (
        <ToggleRight className="h-7 w-7 text-emerald-400" />
      ) : (
        <ToggleLeft className="h-7 w-7 text-zinc-500" />
      )}
    </button>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 50
      ? "bg-yellow-500"
      : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>信号完整度</span>
        <span className="font-bold text-white">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── 交易所权重标识 ────────────────────────────────────────────

const EXCHANGE_META: Record<
  string,
  { desc: string; whyItMatters: string; impact: string }
> = {
  binance_futures: {
    desc: "全球最大合约交易所，提供实时成交、强平爆仓、资金费率、深度订单簿。",
    whyItMatters: "散户情绪和短期价格走势的核心指标来源。",
    impact: "关闭后短期价格预测准确率下降，散户情绪信号缺失。",
  },
};

// ── 数据源组元信息（新闻/链上/情绪）────────────────────────────

interface CollectorSourceInfo {
  source_id: string;
  name: string;
  enabled: boolean;
  source_type: string;
  auth_method: string;
  channels: string[];
}

interface CollectorGroup {
  group_id: string;
  name: string;
  group_type: string;
  enabled: boolean;
  sources: CollectorSourceInfo[];
}

const GROUP_META: Record<string, {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  desc: string;
  sources: Record<string, { desc: string; impact: string; cost: string }>;
}> = {
  news_sources: {
    icon: <Newspaper className="h-5 w-5 text-amber-400" />,
    color: "amber",
    bgColor: "bg-amber-500/20",
    desc: "新闻资讯采集，为 NewsAnalystAgent 和 SentimentAgent 提供实时新闻数据。",
    sources: {
      finnhub_news: {
        desc: "主流财经媒体加密新闻（CNBC/Bloomberg/Reuters），支持加密概念股新闻。",
        impact: "关闭后主流财经新闻源缺失，仅剩 BlockBeats 中文新闻。",
        cost: "免费，需 Finnhub API Key",
      },
      blockbeats: {
        desc: "华语区最大区块链媒体，提供快讯和深度文章，中文原生。",
        impact: "关闭后中文新闻源缺失，影响华语市场情绪判断。",
        cost: "完全免费，无需 API Key",
      },
    },
  },
  onchain_sources: {
    icon: <Link2 className="h-5 w-5 text-cyan-400" />,
    color: "cyan",
    bgColor: "bg-cyan-500/20",
    desc: "链上数据采集，为 OnchainAgent 提供交易所净流入、活跃地址、巨鲸动向等指标。",
    sources: {
      cryptoquant: {
        desc: "链上主数据源，负责交易所流入流出、储备、活跃地址、矿工与 MVRV 等主链路指标。",
        impact: "关闭后链上主事实源缺失，OnchainAgent 将退化为辅助来源与旧缓存。",
        cost: "Professional $109/月起",
      },
      alternative_me: {
        desc: "恐慌贪婪指数（0-100），反映市场整体情绪。",
        impact: "关闭后恐慌贪婪指数不可用。",
        cost: "完全免费",
      },
      glassnode: {
        desc: "MVRV、NVT、S2F、活跃地址、交易所流量等链上指标。",
        impact: "关闭后链上估值和资金流向分析不可用。",
        cost: "需 GlassNode API Key",
      },
    },
  },
};

const PRIMARY_SOURCE_META: Record<
  string,
  { icon: React.ReactNode; tone: string; desc: string; impact: string }
> = {
  market: {
    icon: <Wifi className="h-5 w-5 text-blue-400" />,
    tone: "bg-blue-500/20",
    desc: "Binance 负责价格、K线与实时成交，是分析主链路。",
    impact: "缺失时会直接影响价格快照与多周期结构判断。",
  },
  derivatives: {
    icon: <Activity className="h-5 w-5 text-violet-400" />,
    tone: "bg-violet-500/20",
    desc: "CoinGlass 负责衍生品增强视图，覆盖 OI、资金流和清算结构。",
    impact: "缺失时衍生品增强信号会降级为 Binance 基础合约缓存。",
  },
  onchain: {
    icon: <Link2 className="h-5 w-5 text-cyan-400" />,
    tone: "bg-cyan-500/20",
    desc: "CryptoQuant 域用于链上资金流、活跃度与交易所净流入。",
    impact: "缺失时链上证据链会退化，趋势与共识解释力下降。",
  },
  macro: {
    icon: <Info className="h-5 w-5 text-amber-400" />,
    tone: "bg-amber-500/20",
    desc: "FRED 是目标宏观主源，当前运行期仍保留 CoinGecko Global 兼容补位。",
    impact: "缺失时宏观背景和风险偏好评估会变弱。",
  },
};

// ── 主页面 ────────────────────────────────────────────────────

export default function AdminDataSourcesPage() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<DataSourceStatusSnapshot | null>(null);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [rateHistories, setRateHistories] = useState<Record<string, RateHistoryPoint[]>>({});
  const [collectorGroups, setCollectorGroups] = useState<CollectorGroup[]>([]);
  const [geckoUsage, setGeckoUsage] = useState<{ tier: string; used: number; limit: number; remaining: number; usage_pct: number } | null>(null);
  const [geckoTierSaving, setGeckoTierSaving] = useState(false);
  const [testingSource, setTestingSource] = useState<string | null>(null);

  const handleTestConnection = async (sourceId: string) => {
    setTestingSource(sourceId);
    try {
      const res = await testDatasourceConnection(sourceId);
      showToast(res.message, res.success ? "ok" : "err");
    } catch (e: any) {
      showToast(e.message || "测试失败", "err");
    } finally {
      setTestingSource(null);
    }
  };

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [snap, hlth, grpData] = await Promise.all([
        getDataSourceStatus(),
        getDataSourceHealth().catch(() => null),
        listDataSourceGroups().catch(() => null),
      ]);
      setSnapshot(snap);
      if (hlth) setHealth(hlth);
      if (grpData?.groups) {
        const targetIds = new Set(Object.keys(GROUP_META));
        setCollectorGroups(
          grpData.groups.filter((g: CollectorGroup) => targetIds.has(g.group_id))
        );
      }
      // CoinGecko usage
      getCoinGeckoUsage().then(setGeckoUsage).catch(() => {});
    } catch {
      showToast("刷新失败", "err");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggleCombo = async (enabled: boolean) => {
    setLoadingKey("combo");
    try {
      const res = await toggleCombo(enabled);
      if (res.success) {
        showToast(
          `交易所直连组合已${enabled ? "开启" : "关闭"}`,
          "ok"
        );
        await refresh();
      } else {
        showToast(res.message, "err");
      }
    } catch (e: any) {
      showToast(e.message || "操作失败", "err");
    } finally {
      setLoadingKey(null);
    }
  };

  const handleToggleExchange = async (sourceId: string, enabled: boolean) => {
    setLoadingKey(sourceId);
    try {
      const res = await toggleExchange(sourceId, enabled);
      if (res.success) {
        showToast(
          `${sourceId} 已${enabled ? "开启" : "关闭"}，信号完整度: ${Math.round((res.completeness_score ?? 0) * 100)}%`,
          "ok"
        );
        await refresh();
      } else {
        showToast(res.message, "err");
      }
    } catch (e: any) {
      showToast(e.message || "操作失败", "err");
    } finally {
      setLoadingKey(null);
    }
  };

  const handleToggleCoinGecko = async (enabled: boolean) => {
    setLoadingKey("coingecko");
    try {
      const res = await toggleCoinGecko(enabled);
      if (res.success) {
        showToast(`CoinGecko 已${enabled ? "开启" : "关闭"}`, "ok");
        await refresh();
      } else {
        showToast(res.message, "err");
      }
    } catch (e: any) {
      showToast(e.message || "操作失败", "err");
    } finally {
      setLoadingKey(null);
    }
  };

  const handleGeckoTierChange = async (tier: string) => {
    setGeckoTierSaving(true);
    try {
      const res = await updateCoinGeckoTier(tier);
      showToast(res.message, "ok");
      await refresh();
    } catch (e: any) {
      showToast(e.message || "切换套餐失败", "err");
    } finally {
      setGeckoTierSaving(false);
    }
  };

  const handleToggleCoinGlass = async (enabled: boolean) => {
    setLoadingKey("coinglass");
    try {
      const res = await toggleCoinGlass(enabled);
      if (res.success) {
        showToast(`CoinGlass 已${enabled ? "开启" : "关闭"}`, "ok");
        await refresh();
      } else {
        showToast(res.message, "err");
      }
    } catch (e: any) {
      showToast(e.message || "操作失败", "err");
    } finally {
      setLoadingKey(null);
    }
  };

  const handleToggleGroup = async (groupId: string, enabled: boolean) => {
    setLoadingKey(`group:${groupId}`);
    try {
      const res = await toggleGroup(groupId, enabled);
      if (res.success) {
        showToast(res.message, "ok");
        await refresh();
      } else {
        showToast(res.message, "err");
      }
    } catch (e: any) {
      showToast(e.message || "操作失败", "err");
    } finally {
      setLoadingKey(null);
    }
  };

  const handleToggleCollector = async (groupId: string, sourceId: string, enabled: boolean) => {
    setLoadingKey(`col:${sourceId}`);
    try {
      const res = await toggleCollector(groupId, sourceId, enabled);
      if (res.success) {
        showToast(res.message, "ok");
        await refresh();
      } else {
        showToast(res.message, "err");
      }
    } catch (e: any) {
      showToast(e.message || "操作失败", "err");
    } finally {
      setLoadingKey(null);
    }
  };

  const getSourceHealth = (sourceId: string) =>
    health?.sources?.[sourceId] ?? null;

  if (!user || user.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white p-6">
      {/* 顶部 */}
      <motion.div
        className="mb-6 flex items-center justify-between"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-lg font-semibold text-zinc-200">数据源管理</h1>
          <p className="mt-1 text-sm text-zinc-400">
            管理实时数据采集来源，控制各交易所连接开关和监控健康状态。
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="btn-secondary flex items-center gap-2 font-medium px-4"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </motion.div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
            toast.type === "ok"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "bg-red-500/20 text-red-300 border border-red-500/30"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="space-y-8 mt-2">
        <div className="card p-6 shadow-md border border-border">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-bold font-mono uppercase tracking-widest text-zinc-100 mb-1">四大主数据源</h2>
              <p className="text-sm text-zinc-400">按 market / derivatives / onchain / macro 四个主域展示当前运行态。</p>
            </div>
            <div className="w-full max-w-sm rounded-xl bg-bg-surface/50 border border-border p-5">
              <ScoreBar score={snapshot?.domain_completeness ?? 0} />
              <p className="mt-4 text-[11px] font-mono tracking-wide text-zinc-500">
                {snapshot?.missing_domains?.length ? `缺失主域：${snapshot.missing_domains.join(" / ")}` : "主域已齐备，或处于可兼容降级态。"}
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {(snapshot?.primary_sources ?? []).map((source) => {
              const meta = PRIMARY_SOURCE_META[source.domain] ?? PRIMARY_SOURCE_META.macro;
              const isFredPrimary = source.source_id === "fred";
              const primaryTestSourceId = source.source_id === "fred" || source.source_id === "cryptoquant"
                ? source.source_id
                : null;
              return (
                <div key={source.domain} className="card-surface rounded-xl border border-border p-5 transition-colors hover:border-border/80">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-inner ${meta.tone}`}>{meta.icon}</div>
                      <div>
                        <div className="text-sm font-bold text-zinc-100">{source.name}</div>
                        <div className="text-xs font-mono tracking-widest uppercase text-zinc-500 mt-0.5">{source.domain} <span className="text-zinc-500 mx-1">/</span> {source.owner}</div>
                      </div>
                    </div>
                    <StatusBadge status={source.status} variant="readiness" />
                  </div>
                  <p className="mt-4 text-xs text-zinc-400 leading-relaxed">{meta.desc}</p>
                  
                  <div className="mt-5 rounded-lg bg-bg-elevated/50 p-3 flex items-center justify-between text-xs border border-border/50">
                    <span className="text-zinc-500 font-mono tracking-widest uppercase">缓存覆盖</span>
                    <span className="text-zinc-200 font-medium font-mono">
                      <span className="text-accent">{source.ready_count}</span> <span className="text-zinc-400 mx-1">/</span> {source.target_count}
                    </span>
                  </div>
                  
                  <p className="mt-3 text-[11px] font-mono tracking-wide text-zinc-500">{source.detail}</p>
                  {source.enabled && source.status !== "enabled" && (
                    <p className="mt-2 text-[11px] text-amber-500/70 border-l-[3px] border-amber-500/30 pl-2 py-0.5">
                      测试连接只验证 API 可达；主卡片状态取决于首轮采集与缓存落地。
                    </p>
                  )}
                  {(isFredPrimary || primaryTestSourceId) && (
                    <div className="mt-5 flex flex-wrap items-center gap-3 pt-4 border-t border-border">
                      {isFredPrimary && (
                        <div className="flex items-center gap-3">
                          <Toggle
                            checked={source.enabled}
                            onChange={(v) => handleToggleGroup("fred_source", v)}
                            loading={loadingKey === "group:fred_source"}
                          />
                          <span className="text-xs font-bold font-mono tracking-widest uppercase text-zinc-500">
                            {source.enabled ? "主源已开启" : "主源已关闭"}
                          </span>
                        </div>
                      )}
                      {primaryTestSourceId && (
                        <button
                          onClick={() => handleTestConnection(primaryTestSourceId)}
                          disabled={testingSource === primaryTestSourceId}
                          className="btn-secondary ml-auto !py-1.5 !px-3 font-medium text-xs flex items-center gap-2"
                        >
                          {testingSource === primaryTestSourceId ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Activity className="h-3.5 w-3.5" />
                          )}
                          测试连接
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 兼容运行组分隔 ── */}
        <div className="flex items-center gap-4 py-4 opacity-70">
          <div className="flex-1 border-t border-border" />
          <span className="shrink-0 text-xs font-bold font-mono tracking-[0.2em] uppercase text-zinc-400">兼容运行组 · 旧数据源管理视图</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* ── CoinGlass_Source 卡片 ── */}
        <div className="card-surface p-6 rounded-xl border border-border transition-colors hover:border-border/80">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-elevated/50 shadow-inner border border-border">
                  <Activity className="h-5 w-5 text-zinc-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">
                    CoinGlass_Source
                  </h2>
                  <span className="text-xs font-mono tracking-widest uppercase text-zinc-500 mt-0.5 block">付费数据源</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-bg-surface/50 border border-border p-4">
                  <div className="text-[11px] font-bold font-mono tracking-widest uppercase text-zinc-500 mb-2">当前套餐</div>
                  <div className="font-bold text-zinc-200 capitalize">
                    {snapshot?.coinglass_tier ?? "—"}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500 leading-relaxed">
                    套餐等级决定可访问的数据频道范围。如需升级，请前往 CoinGlass 官网后在系统配置中更新 API Key。
                  </div>
                </div>
                <div className="rounded-xl bg-bg-surface/50 border border-border p-4">
                  <div className="text-[11px] font-bold font-mono tracking-widest uppercase text-zinc-500 mb-2">数据内容</div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">
                    全市场爆仓聚合、大额资金流向、持仓量变化（OI Change）、
                    资金费率汇总（Funding Rate）、主力买卖量（Taker Volume）。
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-amber-500/10 border-l-[3px] border-amber-500/50 px-4 py-3 text-[11px] text-amber-500/80">
                <strong className="text-amber-500">关闭后影响：</strong>
                依赖 CoinGlass 的分析指标（如全市场爆仓热图、资金费率聚合）将停止更新，
                相关分析结果可能变为空或使用旧缓存数据。
              </div>
            </div>

            <div className="ml-8 flex flex-col items-end gap-3 min-w-[120px]">
              <div className="flex flex-col items-center gap-2">
                <Toggle
                  checked={snapshot?.coinglass_enabled ?? false}
                  onChange={handleToggleCoinGlass}
                  loading={loadingKey === "coinglass"}
                />
                <StatusBadge
                  status={
                    snapshot?.coinglass_enabled
                      ? (getSourceHealth("coinglass")?.status ?? "enabled")
                      : "disabled"
                  }
                />
              </div>
              <button
                onClick={() => handleTestConnection("coinglass_rest")}
                disabled={testingSource === "coinglass_rest"}
                className="btn-secondary !py-1.5 !px-3 mt-2 w-full flex items-center justify-center gap-2 text-xs"
              >
                {testingSource === "coinglass_rest" ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5" />
                )}
                <span className="font-medium font-mono text-zinc-400">测试连接</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── CoinGecko_Source 卡片 ── */}
        <div className="card-surface p-6 rounded-xl border border-border transition-colors hover:border-border/80">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 shadow-inner border border-orange-500/20">
                  <Activity className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">
                    CoinGecko_Source
                  </h2>
                  <span className="text-xs font-mono tracking-widest uppercase text-zinc-500 mt-0.5 block">基本面数据源</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-bg-surface/50 border border-border p-4">
                  <div className="text-[11px] font-bold font-mono tracking-widest uppercase text-zinc-500 mb-2">当前套餐</div>
                  <select
                    value={snapshot?.coingecko_tier ?? "demo"}
                    onChange={(e) => handleGeckoTierChange(e.target.value)}
                    disabled={geckoTierSaving}
                    className="input w-full !h-8 !py-1 !px-2 !text-xs font-medium bg-bg-elevated"
                  >
                    <option value="demo">Demo（免费）</option>
                    <option value="basic">Basic（$35/月）</option>
                    <option value="analyst">Analyst（$129/月）</option>
                    <option value="lite">Lite（$499/月）</option>
                  </select>
                  <div className="mt-2 text-[11px] text-zinc-500">
                    套餐等级决定采集频率和月度额度。
                  </div>
                </div>
                <div className="rounded-xl bg-bg-surface/50 border border-border p-4">
                  <div className="text-[11px] font-bold font-mono tracking-widest uppercase text-zinc-500 mb-2 flex items-center justify-between">
                    <span>月度额度</span>
                    {geckoUsage && (
                      <span className="text-zinc-400 font-mono">{geckoUsage.usage_pct}%</span>
                    )}
                  </div>
                  {geckoUsage ? (
                    <>
                      <div className="font-bold font-mono text-zinc-200">
                        {geckoUsage.used.toLocaleString()} <span className="text-zinc-400 mx-1">/</span> {geckoUsage.limit.toLocaleString()}
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-bg-elevated overflow-hidden border border-border/50">
                        <div
                          className={`h-full rounded-full transition-all ${
                            geckoUsage.usage_pct > 80 ? "bg-bear shadow-[0_0_8px_rgba(248,113,113,0.5)]" : geckoUsage.usage_pct > 50 ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-bull shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                          }`}
                          style={{ width: `${Math.min(geckoUsage.usage_pct, 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                        剩余: <span className="text-zinc-400">{geckoUsage.remaining.toLocaleString()}</span> 次
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-zinc-500 animate-pulse mt-2 py-1">加载用量数据中…</div>
                  )}
                </div>
                <div className="rounded-xl bg-bg-surface/50 border border-border p-4">
                  <div className="text-[11px] font-bold font-mono tracking-widest uppercase text-zinc-500 mb-2">数据内容</div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">
                    市值/供应量/ATH/ATL、社区情绪（Reddit/Telegram/投票）、
                    开发者活跃度（GitHub Commits/Stars）、全局宏观、热门趋势。
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-amber-500/10 border-l-[3px] border-amber-500/50 px-4 py-3 text-[11px] text-amber-500/80">
                <strong className="text-amber-500">关闭后影响：</strong>
                市值、社区情绪、开发者活跃度等基本面数据停止更新，
                相关分析维度将缺失或使用旧缓存数据。
              </div>
            </div>

            <div className="ml-8 flex flex-col items-end gap-3 min-w-[120px]">
               <div className="flex flex-col items-center gap-2">
                <Toggle
                  checked={snapshot?.coingecko_enabled ?? false}
                  onChange={handleToggleCoinGecko}
                  loading={loadingKey === "coingecko"}
                />
                <StatusBadge
                  status={
                    snapshot?.coingecko_enabled
                      ? (getSourceHealth("coingecko")?.status ?? "enabled")
                      : "disabled"
                  }
                />
              </div>
              <button
                onClick={() => handleTestConnection("coingecko")}
                disabled={testingSource === "coingecko"}
                className="btn-secondary !py-1.5 !px-3 mt-2 w-full flex items-center justify-center gap-2 text-xs"
              >
                {testingSource === "coingecko" ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5" />
                )}
                <span className="font-medium font-mono text-zinc-400">测试连接</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Exchange_Direct_Combo 卡片 ── */}
        <div className="card-surface p-6 rounded-xl border border-border transition-colors hover:border-border/80">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 shadow-inner border border-blue-500/20">
                <Wifi className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-100">
                  Exchange_Direct_Combo
                </h2>
                <span className="text-xs font-mono tracking-widest uppercase text-zinc-500 mt-0.5 block">免费交易所直连 <span className="text-zinc-500 mx-1">/</span> Binance Futures</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 min-w-[120px]">
              <div className="flex flex-col items-center gap-2">
                <Toggle
                  checked={snapshot?.combo_enabled ?? false}
                  onChange={handleToggleCombo}
                  loading={loadingKey === "combo"}
                />
                <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">
                  {snapshot?.combo_enabled ? "组合已开启" : "组合已关闭"}
                </span>
              </div>
              <button
                onClick={() => handleTestConnection("binance_futures")}
                disabled={testingSource === "binance_futures"}
                className="btn-secondary !py-1.5 !px-3 mt-1 w-full flex items-center justify-center gap-2 text-xs"
              >
                {testingSource === "binance_futures" ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5" />
                )}
                <span className="font-medium font-mono text-zinc-400">测试连接</span>
              </button>
            </div>
          </div>

          {/* 信号完整度评分 */}
          <div className="mb-6 rounded-xl bg-bg-surface/50 border border-border p-5">
            <ScoreBar score={snapshot?.completeness_score ?? 0} />
            <p className="mt-4 text-[11px] font-mono tracking-wide text-zinc-500">
              <strong className="text-zinc-400">完整度</strong> = Binance Futures 连接状态。关闭后 K线/成交/爆仓/订单簿等核心数据停止采集。
            </p>
          </div>

          {/* 组合关闭提示 */}
          {!snapshot?.combo_enabled && (
             <div className="mb-6 flex items-center gap-3 rounded-lg border-l-[3px] border-amber-500/50 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-500/80">
              <WifiOff className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <strong className="text-amber-500">组合已关闭：</strong>
                Binance Futures 数据采集已停止。开启后将自动恢复连接。
              </span>
            </div>
          )}

          {/* 各交易所子卡片 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {snapshot?.exchanges.map((exchange) => {
              const meta = EXCHANGE_META[exchange.source_id];
              const hlth = getSourceHealth(exchange.source_id);
              const isExpanded = expandedSource === exchange.source_id;

              return (
                <div
                  key={exchange.source_id}
                  className={`rounded-xl border p-5 transition-colors ${
                    exchange.status === "enabled"
                      ? "border-bull/20 bg-bull/5 shadow-[inset_0_0_10px_rgba(52,211,153,0.05)]"
                      : exchange.status === "error"
                      ? "border-bear/20 bg-bear/5 shadow-[inset_0_0_10px_rgba(248,113,113,0.05)]"
                      : exchange.status === "stale"
                      ? "border-amber-500/20 bg-amber-500/5 shadow-[inset_0_0_10px_rgba(245,158,11,0.05)]"
                      : "border-border bg-bg-surface/30"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-zinc-200 text-sm">
                          {exchange.name}
                        </span>
                        <span className="text-[10px] font-bold font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-bg-elevated text-zinc-500 border border-border">
                          权重 {Math.round(exchange.weight * 100)}%
                        </span>
                      </div>
                      <div className="mt-3">
                        <StatusBadge status={exchange.status} />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-4">
                      <Toggle
                        checked={exchange.enabled}
                        onChange={(v) =>
                          handleToggleExchange(exchange.source_id, v)
                        }
                        loading={loadingKey === exchange.source_id}
                        disabled={!snapshot?.combo_enabled && !exchange.enabled}
                      />
                    </div>
                  </div>

                  {/* 健康指标 */}
                  {hlth && exchange.enabled && (
                    <div className="mt-5 grid grid-cols-2 gap-3 p-3 rounded-lg bg-bg-elevated/50 border border-border/50">
                      <div className="text-[10px] font-mono tracking-widest uppercase text-zinc-500 flex flex-col gap-1">
                        消息速率
                        <span className="text-sm font-bold text-zinc-200 font-mono">
                          {hlth.message_rate.toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal">条/秒</span>
                        </span>
                      </div>
                      <div className="text-[10px] font-mono tracking-widest uppercase text-zinc-500 flex flex-col gap-1">
                        重连次数
                        <span className="text-sm font-bold text-zinc-200 font-mono">{hlth.reconnect_count}</span>
                      </div>
                       <div className="text-[10px] font-mono tracking-widest uppercase text-zinc-500 flex flex-col gap-1">
                        熔断状态
                        <span
                          className={
                            hlth.circuit_breaker_state === "closed"
                              ? "text-bull text-xs font-bold"
                              : hlth.circuit_breaker_state === "open"
                              ? "text-bear text-xs font-bold"
                              : "text-amber-500 text-xs font-bold"
                          }
                        >
                          {hlth.circuit_breaker_state === "closed"
                            ? "正常"
                            : hlth.circuit_breaker_state === "open"
                            ? "熔断中"
                            : "探测恢复中"}
                        </span>
                      </div>
                      {hlth.last_message_at && (
                        <div className="text-[10px] font-mono tracking-widest uppercase text-zinc-500 flex flex-col gap-1">
                          最后数据
                          <span className="text-xs font-mono text-zinc-400">
                            {new Date(hlth.last_message_at).toLocaleTimeString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 展开说明 */}
                  {meta && (
                     <div className="mt-4 pt-4 border-t border-border/50">
                      <button
                        onClick={async () => {
                          const nextId = isExpanded ? null : exchange.source_id;
                          setExpandedSource(nextId);
                          if (nextId && !rateHistories[nextId]) {
                            try {
                              const m = await getSourceMetrics(nextId);
                              setRateHistories((prev) => ({ ...prev, [nextId]: m.rate_history }));
                            } catch {}
                          }
                        }}
                        className="flex items-center gap-2 text-[11px] font-bold font-mono tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors"
                      >
                        <Info className="h-3 w-3" />
                        {isExpanded ? "收起说明" : "查看说明"}
                      </button>
                      {isExpanded && (
                        <div className="mt-4 space-y-2 rounded-xl bg-bg-surface/50 border border-border p-4 text-xs text-zinc-400">
                          <div>
                            <span className="text-zinc-300 font-medium">数据内容：</span>
                            {meta.desc}
                          </div>
                          <div>
                            <span className="text-zinc-300 font-medium">分析价值：</span>
                            {meta.whyItMatters}
                          </div>
                          <div className="text-yellow-500/80">
                            <span className="font-medium">关闭影响：</span>
                            {meta.impact}
                          </div>
                          {/* 消息速率趋势图 */}
                          <div className="mt-3">
                            <div className="text-zinc-300 font-medium mb-1">消息速率趋势（最近 1 小时）</div>
                            <RateHistoryChart data={rateHistories[exchange.source_id] ?? []} height={100} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 新闻 / 链上 / 情绪数据源组 ── */}
        {collectorGroups.map((group) => {
          const meta = GROUP_META[group.group_id];
          if (!meta) return null;
          return (
            <div key={group.group_id} className="card-surface p-6 rounded-xl border border-border transition-colors hover:border-border/80">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-inner border border-border ${meta.bgColor}`}>
                    {meta.icon}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100">{group.name}</h2>
                    <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500 mt-1 block">
                      {group.group_type === "paid" ? "付费数据源" : "免费数据源"} <span className="text-zinc-500 mx-1">/</span> {group.sources.length} 个采集器
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Toggle
                    checked={group.enabled}
                    onChange={(v) => handleToggleGroup(group.group_id, v)}
                    loading={loadingKey === `group:${group.group_id}`}
                  />
                  <span className="text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500">
                    {group.enabled ? "组已开启" : "组已关闭"}
                  </span>
                </div>
              </div>

              <p className="mb-6 text-xs text-zinc-400 leading-relaxed">{meta.desc}</p>

              {!group.enabled && (
                <div className="mb-6 flex items-center gap-3 rounded-lg border-l-[3px] border-amber-500/50 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-500/80">
                  <WifiOff className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    <strong className="text-amber-500">组已关闭：</strong>
                    该组内所有采集器已停止采集。开启组后已启用的采集器将自动恢复。
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.sources.map((src) => {
                  const srcMeta = meta.sources[src.source_id];
                  const isExpSrc = expandedSource === `col:${src.source_id}`;
                  return (
                    <div
                      key={src.source_id}
                      className={`rounded-xl border p-5 transition-colors ${
                        src.enabled && group.enabled
                          ? "border-bull/20 bg-bull/5 shadow-[inset_0_0_10px_rgba(52,211,153,0.05)]"
                          : "border-border bg-bg-surface/30"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-zinc-200 text-sm">{src.name}</span>
                            {src.auth_method === "api_key" && (
                              <span className="text-[10px] font-bold font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-border">
                                需 API Key
                              </span>
                            )}
                            {src.auth_method === "none" && (
                              <span className="text-[10px] font-bold font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-bull/20 text-bull border border-border">
                                免费
                              </span>
                            )}
                          </div>
                          <div className="mt-3">
                            <StatusBadge status={src.enabled && group.enabled ? "enabled" : "disabled"} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3 ml-4 min-w-[80px]">
                          <Toggle
                            checked={src.enabled}
                            onChange={(v) => handleToggleCollector(group.group_id, src.source_id, v)}
                            loading={loadingKey === `col:${src.source_id}`}
                            disabled={!group.enabled && !src.enabled}
                          />
                          <button
                            onClick={() => handleTestConnection(src.source_id)}
                            disabled={testingSource === src.source_id}
                            className="btn-secondary !py-1 !px-2 w-full flex items-center justify-center gap-1.5 text-[11px]"
                          >
                            {testingSource === src.source_id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Activity className="h-3.5 w-3.5" />
                            )}
                            <span className="font-medium font-mono text-zinc-400">测试</span>
                          </button>
                        </div>
                      </div>

                      {srcMeta && (
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <button
                            onClick={() => setExpandedSource(isExpSrc ? null : `col:${src.source_id}`)}
                            className="flex items-center gap-2 text-[11px] font-bold font-mono tracking-[0.2em] uppercase text-zinc-500 hover:text-white transition-colors"
                          >
                            <Info className="h-3 w-3" />
                            {isExpSrc ? "收起说明" : "查看说明"}
                          </button>
                          {isExpSrc && (
                            <div className="mt-4 space-y-2 rounded-xl bg-bg-surface/50 border border-border p-4 text-xs text-zinc-400">
                              <div>
                                <span className="text-zinc-300 font-bold">数据内容：</span>
                                {srcMeta.desc}
                              </div>
                              <div>
                                <span className="text-zinc-300 font-bold">费用：</span>
                                {srcMeta.cost}
                              </div>
                              <div className="text-amber-500/80">
                                <span className="font-bold text-amber-500">关闭影响：</span>
                                {srcMeta.impact}
                              </div>
                              <div>
                                <span className="text-zinc-300 font-bold">频道：</span>
                                {src.channels.join(", ")}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── 状态颜色说明 ── */}
        <div className="card-surface p-6 rounded-xl border border-border">
          <h3 className="mb-4 text-[11px] font-bold font-mono tracking-[0.2em] uppercase text-zinc-500">状态颜色说明</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              {
                status: "enabled" as DataSourceStatus,
                tip: "数据源正常实时采集，一切正常。",
              },
              {
                status: "disabled" as DataSourceStatus,
                tip: "管理员手动关闭，未采集数据。如需恢复请手动开启。",
              },
              {
                status: "error" as DataSourceStatus,
                tip: "连接失败，系统正在自动重连（最多 10 次）。持续超过 10 分钟请检查网络。",
              },
              {
                status: "stale" as DataSourceStatus,
                tip: "连接存在但超过 60 秒未收到新数据。通常自动恢复，若持续请尝试关闭再开启。",
              },
            ].map(({ status, tip }) => (
              <div key={status} className="space-y-3 p-4 rounded-xl border border-border/50 bg-bg-surface/30">
                <StatusBadge status={status} />
                <p className="text-[11px] text-zinc-500 leading-relaxed font-mono">{tip}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 熔断器说明 ── */}
         <div className="card-surface p-6 rounded-xl border border-border">
          <h3 className="mb-4 text-[11px] font-bold font-mono tracking-[0.2em] uppercase text-zinc-500">熔断器说明</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
             <div className="rounded-xl bg-bg-surface/50 border border-border p-4">
              <span className="font-bold font-mono text-[11px] tracking-widest uppercase text-bull">正常 <span className="text-zinc-400 font-normal">/</span> closed</span>
              <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed font-mono">数据源连接稳定，正常采集数据。</p>
            </div>
             <div className="rounded-xl bg-bg-surface/50 border border-border p-4">
              <span className="font-bold font-mono text-[11px] tracking-widest uppercase text-bear">熔断中 <span className="text-zinc-400 font-normal">/</span> open</span>
              <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed font-mono">连续 3 次健康检查失败后自动触发，暂停采集。每 120 秒自动尝试恢复。</p>
            </div>
             <div className="rounded-xl bg-bg-surface/50 border border-border p-4">
              <span className="font-bold font-mono text-[11px] tracking-widest uppercase text-amber-500">探测恢复 <span className="text-zinc-400 font-normal">/</span> half_open</span>
              <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed font-mono">正在尝试重新连接，若成功则恢复正常，若失败则重新熔断。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
