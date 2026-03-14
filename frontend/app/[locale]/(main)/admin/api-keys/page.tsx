"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  fetchConfigs,
  createConfig,
  updateConfig,
  testConnection,
  type SystemConfig,
} from "@/lib/api/configs";
import {
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  Loader2,
  Save,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

// ── API Key 定义 ─────────────────────────────────────────────

interface ApiKeyDef {
  key: string;
  name: string;
  provider: string;
  description: string;
  howToGet: string;
  registerUrl: string;
  cost: string;
  required: boolean;
  category: string;
}

const API_KEYS: ApiKeyDef[] = [
  {
    key: "dmx_api_key",
    name: "AI 分析密钥",
    provider: "DMXAPI",
    description: "驱动所有 AI 智能体的核心密钥，没有它系统无法进行任何分析。",
    howToGet: "注册 → 充值 → 复制 API Key",
    registerUrl: "https://www.dmxapi.cn",
    cost: "按量付费",
    required: true,
    category: "ai_model",
  },
  {
    key: "finnhub_api_key",
    name: "新闻 + 美股数据密钥",
    provider: "Finnhub",
    description: "获取加密货币主流财经新闻、加密概念股财报日历、美股报价、内部人交易等。",
    howToGet: "注册账号 → Dashboard → 复制 API Key",
    registerUrl: "https://finnhub.io/register",
    cost: "免费",
    required: false,
    category: "data_source",
  },
  {
    key: "coinglass_api_key",
    name: "合约数据密钥",
    provider: "CoinGlass",
    description: "全市场爆仓热图、资金费率聚合、MVRV 估值指标。",
    howToGet: "注册账号 → 进入 Open API 页面 → 创建 API Key",
    registerUrl: "https://www.coinglass.com/pricing",
    cost: "Startup $29/月起",
    required: false,
    category: "data_source",
  },
  {
    key: "alphanode_api_key",
    name: "CoinGlass 代理密钥",
    provider: "AlphaNode",
    description: "CoinGlass REST 代理通道密钥，用于 proxy > official 双通道中的代理主通道。",
    howToGet: "向 AlphaNode 服务方获取代理访问 Key",
    registerUrl: "https://api.alphanode.work",
    cost: "按代理服务约定",
    required: false,
    category: "data_source",
  },
  {
    key: "cryptoquant_api_key",
    name: "链上主源密钥",
    provider: "CryptoQuant",
    description: "CryptoQuant 链上主数据源密钥，用于交易所流量、储备、地址与 MVRV 等指标采集。",
    howToGet: "注册账号 → API 页面 → 创建或复制 API Key",
    registerUrl: "https://cryptoquant.com/docs",
    cost: "Professional $109/月起",
    required: false,
    category: "data_source",
  },
  {
    key: "fred_api_key",
    name: "宏观主源密钥",
    provider: "FRED",
    description: "FRED 宏观主数据源密钥，用于 CPI、失业率、联邦基金利率、GDP 等官方序列采集。",
    howToGet: "登录 FRED 账号 → API Keys 页面生成 Key",
    registerUrl: "https://fred.stlouisfed.org/docs/api/api_key.html",
    cost: "免费",
    required: false,
    category: "data_source",
  },
  {
    key: "glassnode_api_key",
    name: "链上数据密钥",
    provider: "GlassNode",
    description: "MVRV、NVT、S2F、活跃地址、交易所流量等链上指标。",
    howToGet: "注册账号 → 选择套餐 → API 管理 → 复制 Key",
    registerUrl: "https://studio.glassnode.com/settings/api",
    cost: "免费层可用，高级指标需付费",
    required: false,
    category: "data_source",
  },
  {
    key: "coingecko_api_key",
    name: "基本面数据密钥",
    provider: "CoinGecko",
    description: "市值、社区情绪、开发者活跃度、全局宏观、热门趋势。",
    howToGet: "注册账号 → Developer Dashboard → 复制 API Key",
    registerUrl: "https://www.coingecko.com/en/api/pricing",
    cost: "Demo 免费，Basic $35/月起",
    required: false,
    category: "data_source",
  },
  {
    key: "telegram_bot_token",
    name: "Telegram 机器人",
    provider: "Telegram",
    description: "通过 Telegram 接收预警推送消息。",
    howToGet: "在 Telegram 搜索 @BotFather → /newbot → 复制 Token",
    registerUrl: "https://t.me/BotFather",
    cost: "免费",
    required: false,
    category: "notification",
  },
  {
    key: "resend_api_key",
    name: "邮件服务密钥",
    provider: "Resend",
    description: "通过邮件接收预警推送消息（推荐，优先于 SendGrid）。",
    howToGet: "注册账号 → API Keys → Create API Key",
    registerUrl: "https://resend.com/",
    cost: "免费 3000封/月",
    required: false,
    category: "notification",
  },
  {
    key: "sendgrid_api_key",
    name: "邮件服务密钥（备选）",
    provider: "SendGrid",
    description: "通过邮件接收预警推送消息（已配置 Resend 时可不填）。",
    howToGet: "注册账号 → Settings → API Keys → Create API Key",
    registerUrl: "https://signup.sendgrid.com/",
    cost: "免费层可用",
    required: false,
    category: "notification",
  },
  {
    key: "oxapay_merchant_key",
    name: "支付网关密钥",
    provider: "Oxapay",
    description: "接受 USDT 加密货币支付（会员订阅用），支持 TRC-20/ERC-20/BEP-20。",
    howToGet: "注册商户账号 → 创建 Merchant API → 复制 Merchant Key",
    registerUrl: "https://oxapay.com/",
    cost: "0.4% 起",
    required: false,
    category: "payment",
  },
  {
    key: "deepseek_factor_api_key",
    name: "因子训练 AI 密钥",
    provider: "DeepSeek",
    description: "独立的 DeepSeek V3.2 官方 API Key，用于因子学习模块的 AI 训练。与主分析系统的 DMXAPI 完全独立。",
    howToGet: "注册账号 → 充值 → API Keys 页面复制 Key",
    registerUrl: "https://platform.deepseek.com/api_keys",
    cost: "按量付费（极低价）",
    required: false,
    category: "ai_training",
  },
];

// ── 分组 ─────────────────────────────────────────────────────

const GROUPS = [
  { id: "core", label: "核心（必填）", filter: (k: ApiKeyDef) => k.required },
  { id: "data", label: "数据源（按需填写）", filter: (k: ApiKeyDef) => !k.required && k.category === "data_source" },
  { id: "ai", label: "AI 训练（可选）", filter: (k: ApiKeyDef) => k.category === "ai_training" },
  { id: "notif", label: "推送通知（可选）", filter: (k: ApiKeyDef) => k.category === "notification" },
  { id: "pay", label: "支付（可选）", filter: (k: ApiKeyDef) => k.category === "payment" },
];

// ── 单个 Key 卡片 ────────────────────────────────────────────

function ApiKeyCard({
  def,
  existingValue,
  editValue,
  onChange,
  onSave,
  onTest,
  saving,
  saved,
  testing,
  testResult,
}: {
  def: ApiKeyDef;
  existingValue: string | null;
  editValue: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onTest: () => void;
  saving: boolean;
  saved: boolean;
  testing: boolean;
  testResult: { success: boolean; message: string } | null;
}) {
  const [showKey, setShowKey] = useState(false);
  const isConfigured = existingValue !== null && existingValue.length > 0;
  const hasChanged = isConfigured ? editValue !== existingValue : editValue.trim().length > 0;
  const canTest = editValue.trim().length > 0;
  const isVerifiedUnsaved = !isConfigured && canTest && !!testResult?.success;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-5 transition-colors ${
        isConfigured
          ? "border-bull/30 bg-bull/5 shadow-[inset_0_0_10px_rgba(52,211,153,0.05)]"
          : def.required
          ? "border-amber-500/30 bg-amber-500/5 shadow-[inset_0_0_10px_rgba(245,158,11,0.05)]"
          : "border-border bg-bg-surface/30"
      }`}
    >
      {/* 顶部：名称 + 状态 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-zinc-100 text-sm tracking-wide">{def.name}</span>
            <span className="text-[10px] font-bold font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-bg-elevated text-zinc-400 border border-border">
              {def.provider}
            </span>
            {def.required && (
              <span className="text-[10px] font-bold font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-bear/20 text-bear border border-bear/30">
                必填
              </span>
            )}
            <span className={`text-[10px] font-bold font-mono tracking-widest uppercase px-2 py-0.5 rounded border ${
              def.cost === "免费"
                ? "bg-bull/20 text-bull border-bull/30"
                : "bg-amber-500/20 text-amber-500 border-amber-500/30"
            }`}>
              {def.cost}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{def.description}</p>
        </div>
        <div className="ml-3 shrink-0 flex items-center justify-end">
          {isConfigured ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono tracking-widest uppercase text-bull px-2.5 py-1 rounded bg-bull/10 border border-bull/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已配置
            </span>
          ) : isVerifiedUnsaved ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono tracking-widest uppercase text-amber-500 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20">
              <Wifi className="h-3.5 w-3.5" />
              已验证未保存
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono tracking-widest uppercase text-zinc-500 px-2.5 py-1 rounded bg-bg-elevated border border-border">
              <XCircle className="h-3.5 w-3.5" />
              未配置
            </span>
          )}
        </div>
      </div>

      {/* 获取步骤 */}
      <div className="mb-4 rounded-xl bg-bg-elevated/50 p-4 border border-border/50 col-span-2">
        <div className="flex items-start gap-3">
          <Key className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold font-mono tracking-widest uppercase text-zinc-400 mb-2">如何获取</div>
            <div className="text-xs text-zinc-300 leading-relaxed font-mono bg-bg-surface px-2 py-1 rounded inline-block border border-border/50">{def.howToGet}</div>
            <div className="mt-3">
              <a
                href={def.registerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-bold font-mono tracking-[0.1em] uppercase text-indigo-400 hover:text-indigo-300 transition-colors"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                前往 {def.provider} 注册
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 输入框 + 测试 + 保存 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={editValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={isConfigured ? "已配置（输入新值可覆盖）" : "粘贴你的 API Key…"}
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              title={showKey ? "隐藏" : "显示"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={onTest}
            disabled={testing || !canTest}
            className="btn-secondary !py-2.5 !px-4 flex items-center justify-center gap-2 text-[11px]"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            ) : (
              <Wifi className="h-4 w-4 text-indigo-400" />
            )}
            <span className="font-bold font-mono tracking-widest uppercase text-zinc-300">{testing ? "测试中" : "测试连接"}</span>
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !hasChanged}
            className={`btn-primary !py-2.5 !px-6 flex items-center justify-center gap-2 text-[11px] ${saved ? '!bg-bull !text-black !border-bull' : ''}`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin opacity-70" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="font-bold font-mono tracking-widest uppercase">{saving ? "保存中" : saved ? "已保存" : "保存"}</span>
          </button>
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div
            className={`rounded-lg px-3 py-2 text-xs font-mono font-bold col-span-2 mt-2 ${
              testResult.success
                ? "bg-bull/10 text-bull border border-bull/30"
                : "bg-bear/10 text-bear border border-bear/30"
            }`}
          >
            {testResult.success ? "✓ " : "✗ "}
            {testResult.message}
          </div>
        )}
        {isVerifiedUnsaved && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-mono font-bold text-amber-500 col-span-2 mt-2">
            当前只完成了连接验证，还没有写入系统配置。请继续点击“保存”。
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return null;
  const queryClient = useQueryClient();
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const {
    data: configs = [],
    isLoading: configsLoading,
  } = useQuery<SystemConfig[]>({
    queryKey: ["adminConfigs"],
    queryFn: () => fetchConfigs(),
    enabled: true,
  });

  const configMap = useMemo(() => {
    const map = new Map<string, SystemConfig>();
    for (const c of configs) map.set(c.config_key, c);
    return map;
  }, [configs]);

  // 初始化编辑值（密钥类不填入掩码值，避免用掩码值误测）
  if (!initialized && configs.length > 0) {
    const initial: Record<string, string> = {};
    const secretKeys = new Set(API_KEYS.map((k) => k.key));
    for (const c of configs) {
      if (secretKeys.has(c.config_key) && c.value.startsWith("****")) {
        initial[c.config_key] = "";
      } else {
        initial[c.config_key] = c.value;
      }
    }
    setEditValues(initial);
    setInitialized(true);
  }

  const handleTest = useCallback(
    async (def: ApiKeyDef) => {
      const value = editValues[def.key]?.trim();
      if (!value) return;

      setTestingKey(def.key);
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[def.key];
        return next;
      });

      try {
        const result = await testConnection(def.key, value);
        setTestResults((prev) => ({ ...prev, [def.key]: result }));
        if (result.success) {
          showToast(`${def.name} 连接测试成功`, "ok");
        } else {
          showToast(`${def.name} 连接测试失败: ${result.message}`, "err");
        }
      } catch (e: any) {
        const errorMsg = e.message || "测试失败";
        setTestResults((prev) => ({
          ...prev,
          [def.key]: { success: false, message: errorMsg },
        }));
        showToast(`${def.name} 测试失败: ${errorMsg}`, "err");
      } finally {
        setTestingKey(null);
      }
    },
    [editValues]
  );

  const handleSave = useCallback(
    async (def: ApiKeyDef) => {
      const value = editValues[def.key]?.trim();
      if (!value) return;

      setSavingKey(def.key);
      try {
        const existing = configMap.get(def.key);
        if (existing) {
          await updateConfig(def.key, { value });
        } else {
          await createConfig({
            config_key: def.key,
            value,
            category: def.category,
            description: def.description,
            is_secret: true,
          });
        }
        setSavedKeys((prev) => new Set(prev).add(def.key));
        setTimeout(() => setSavedKeys((prev) => {
          const next = new Set(prev);
          next.delete(def.key);
          return next;
        }), 3000);
        showToast(`${def.name} 保存成功`, "ok");
        setInitialized(false);
        queryClient.invalidateQueries({ queryKey: ["adminConfigs"] });
      } catch (e: any) {
        showToast(e.message || "保存失败", "err");
      } finally {
        setSavingKey(null);
      }
    },
    [editValues, configMap, queryClient]
  );

  // 统计
  const configuredCount = API_KEYS.filter((k) => configMap.has(k.key)).length;
  const requiredConfigured = API_KEYS.filter((k) => k.required && configMap.has(k.key)).length;
  const requiredTotal = API_KEYS.filter((k) => k.required).length;

  if (configsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-zinc-200 p-6 space-y-6">
      {/* 顶部 */}
      <div className="card-surface p-6 rounded-xl border border-border">
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-3">
          <Key className="h-5 w-5 text-indigo-400" />
          API 密钥管理
        </h1>
        <p className="mt-2 text-[13px] text-zinc-400">
          配置各项服务的 API 密钥以启用完整的数据采集分析能力。
        </p>
      </div>

      {/* 进度条 */}
      <div className="card-surface p-6 rounded-xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-bold font-mono tracking-widest text-zinc-400 uppercase">配置进度</span>
          <span className="text-sm font-bold font-mono text-zinc-100">{configuredCount} <span className="text-zinc-600 font-normal">/</span> {API_KEYS.length}</span>
        </div>
        <div className="h-2 rounded-full bg-bg-elevated overflow-hidden border border-border/50">
          <div
            className={`h-full rounded-full transition-all duration-500 shadow-inner ${
              requiredConfigured >= requiredTotal ? "bg-bull/80 shadow-[inset_0_0_10px_rgba(52,211,153,0.5)]" : "bg-amber-500/80 shadow-[inset_0_0_10px_rgba(245,158,11,0.5)]"
            }`}
            style={{ width: `${(configuredCount / API_KEYS.length) * 100}%` }}
          />
        </div>
        <div className="mt-4 flex items-center gap-4 text-[11px] text-zinc-500 font-bold tracking-wide">
          <span className={requiredConfigured >= requiredTotal ? "text-bull" : "text-amber-500"}>
            {requiredConfigured >= requiredTotal
              ? "✓ 核心密钥已配置"
              : `核心密钥 ${requiredConfigured}/${requiredTotal}，请先配置必填项`}
          </span>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-400">其余数据源可按需补充</span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-bold shadow-md ${
            toast.type === "ok"
              ? "bg-bull/20 text-bull border border-bull/30"
              : "bg-bear/20 text-bear border border-bear/30"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* 分组展示 */}
      <div className="space-y-8">
        {GROUPS.map((group) => {
          const items = API_KEYS.filter(group.filter);
          if (items.length === 0) return null;

          return (
            <div key={group.id} className="space-y-4">
              <h2 className="text-[11px] font-bold font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-4">
                {group.label}
                <div className="h-px flex-1 bg-border/50" />
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {items.map((def) => (
                  <ApiKeyCard
                    key={def.key}
                    def={def}
                    existingValue={configMap.get(def.key)?.value ?? null}
                    editValue={editValues[def.key] ?? ""}
                    onChange={(v) => setEditValues((prev) => ({ ...prev, [def.key]: v }))}
                    onSave={() => handleSave(def)}
                    onTest={() => handleTest(def)}
                    saving={savingKey === def.key}
                    saved={savedKeys.has(def.key)}
                    testing={testingKey === def.key}
                    testResult={testResults[def.key] ?? null}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部说明 */}
      <div className="card-surface p-6 rounded-xl border border-border">
        <h3 className="mb-6 text-[11px] font-bold font-mono tracking-[0.2em] uppercase text-zinc-500">
          常见问题
        </h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 text-xs text-zinc-400 leading-relaxed">
          <div className="flex items-start gap-4">
             <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-zinc-500 font-mono font-bold text-[10px] border border-border">
               01
             </div>
             <div>
               <span className="text-zinc-200 font-bold block mb-1.5 text-[13px]">必须全部填完才能用吗？</span>
               不需要。只有标了 <span className="text-bear font-bold">必填</span> 的项是保证系统基础运作的（例如 AI 的调用）。其他数据源都是按需开启的模块。没有填的数据源系统会自动跳过分析流程。
             </div>
          </div>
          <div className="flex items-start gap-4">
             <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-zinc-500 font-mono font-bold text-[10px] border border-border">
               02
             </div>
             <div>
               <span className="text-zinc-200 font-bold block mb-1.5 text-[13px]">填了 Key 后需要重启吗？</span>
               不需要。配置保存后立即写入系统全局内存并且生效，下一个周期的计划任务或实时分析引擎将会读取并应用新的 API 认证。
             </div>
          </div>
          <div className="flex items-start gap-4">
             <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-zinc-500 font-mono font-bold text-[10px] border border-border">
               03
             </div>
             <div>
               <span className="text-zinc-200 font-bold block mb-1.5 text-[13px]">如何防止 Key 泄露？</span>
               系统后端会对接收到的秘钥进行一次性注入，并且前端的读取接口是经过掩码脱敏处理过的 `****` 格式，在此页面不会明文显示已保存的 Key。
             </div>
          </div>
          <div className="flex items-start gap-4">
             <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-zinc-500 font-mono font-bold text-[10px] border border-border">
               04
             </div>
             <div>
               <span className="text-zinc-200 font-bold block mb-1.5 text-[13px]">免费套餐可以支撑分析吗？</span>
               系统内置免费的数据链路涵盖了很大一部分的信息收集（如 Binance OCO/Orderbooks 等核心基础属性），即使全是免费的第三方 API，也足够系统完成轻量化的行情简读。
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
