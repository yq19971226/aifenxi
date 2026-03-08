"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchCurrentUser, type UserInfo } from "@/lib/api/auth";
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
    key: "cryptopanic_api_token",
    name: "新闻数据密钥",
    provider: "CryptoPanic",
    description: "获取全球加密货币新闻，为 NewsAnalystAgent 提供英文新闻数据。",
    howToGet: "注册账号 → 进入 API 页面 → 复制 Auth Token",
    registerUrl: "https://cryptopanic.com/developers/api/",
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
    key: "sendgrid_api_key",
    name: "邮件推送密钥",
    provider: "SendGrid",
    description: "通过邮件接收预警推送消息。",
    howToGet: "注册账号 → Settings → API Keys → Create API Key",
    registerUrl: "https://signup.sendgrid.com/",
    cost: "免费层可用",
    required: false,
    category: "notification",
  },
  {
    key: "nowpayments_api_key",
    name: "支付网关密钥",
    provider: "NOWPayments",
    description: "接受 USDT 加密货币支付（会员订阅用）。",
    howToGet: "注册商户账号 → Store Settings → API Keys",
    registerUrl: "https://nowpayments.io/",
    cost: "按交易收费",
    required: false,
    category: "payment",
  },
];

// ── 分组 ─────────────────────────────────────────────────────

const GROUPS = [
  { id: "core", label: "核心（必填）", filter: (k: ApiKeyDef) => k.required },
  { id: "data", label: "数据源（按需填写）", filter: (k: ApiKeyDef) => !k.required && k.category === "data_source" },
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
          ? "border-emerald-500/20 bg-emerald-500/5"
          : def.required
          ? "border-yellow-500/20 bg-yellow-500/5"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      {/* 顶部：名称 + 状态 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">{def.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              {def.provider}
            </span>
            {def.required && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                必填
              </span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded border ${
              def.cost === "免费"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            }`}>
              {def.cost}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">{def.description}</p>
        </div>
        <div className="ml-3 shrink-0">
          {isConfigured ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              已配置
            </span>
          ) : isVerifiedUnsaved ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
              <Wifi className="h-4 w-4" />
              已验证未保存
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <XCircle className="h-4 w-4" />
              未配置
            </span>
          )}
        </div>
      </div>

      {/* 获取步骤 */}
      <div className="mb-3 rounded-lg bg-zinc-800/50 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Key className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-zinc-300 font-medium mb-1">如何获取：</div>
            <div className="text-xs text-zinc-400">{def.howToGet}</div>
            <a
              href={def.registerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              前往 {def.provider} 注册
            </a>
          </div>
        </div>
      </div>

      {/* 输入框 + 测试 + 保存 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={editValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={isConfigured ? "已配置（输入新值可覆盖）" : "粘贴你的 API Key…"}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-blue-500/40 focus:bg-zinc-800 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              title={showKey ? "隐藏" : "显示"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={onTest}
            disabled={testing || !canTest}
            className="shrink-0 flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            {testing ? "测试中" : "测试连接"}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !hasChanged}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
              saved
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            }`}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "保存中" : saved ? "已保存" : "保存"}
          </button>
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              testResult.success
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-red-500/10 text-red-400 border border-red-500/30"
            }`}
          >
            {testResult.success ? "✓ " : "✗ "}
            {testResult.message}
          </div>
        )}
        {isVerifiedUnsaved && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            当前只完成了连接验证，还没有写入系统配置。请继续点击“保存”。
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────

export default function ApiKeysPage() {
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

  const { data: user, isLoading: userLoading } = useQuery<UserInfo>({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
  });

  const {
    data: configs = [],
    isLoading: configsLoading,
  } = useQuery<SystemConfig[]>({
    queryKey: ["adminConfigs"],
    queryFn: () => fetchConfigs(),
    enabled: !!user?.is_admin,
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

  if (userLoading || configsLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-white p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!user?.is_admin) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-white p-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-red-400" />
          <p className="text-sm text-red-400">权限不足 — 仅管理员可访问</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white p-6">
      {/* 顶部 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Key className="h-6 w-6 text-blue-400" />
          API 密钥管理
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          在这里填入各个服务的 API Key，填好后系统会自动开始采集数据。
        </p>
      </div>

      {/* 进度条 */}
      <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-300 font-medium">配置进度</span>
          <span className="text-sm text-white font-bold">{configuredCount}/{API_KEYS.length}</span>
        </div>
        <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              requiredConfigured >= requiredTotal ? "bg-emerald-500" : "bg-yellow-500"
            }`}
            style={{ width: `${(configuredCount / API_KEYS.length) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
          <span className={requiredConfigured >= requiredTotal ? "text-emerald-400" : "text-yellow-400"}>
            {requiredConfigured >= requiredTotal
              ? "✓ 核心密钥已配置"
              : `核心密钥 ${requiredConfigured}/${requiredTotal}，请先配置必填项`}
          </span>
          <span>·</span>
          <span>其余数据源可随时添加</span>
        </div>
      </div>

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

      {/* 分组展示 */}
      <div className="space-y-8">
        {GROUPS.map((group) => {
          const items = API_KEYS.filter(group.filter);
          if (items.length === 0) return null;

          return (
            <div key={group.id}>
              <h2 className="text-base font-semibold text-zinc-200 mb-3">{group.label}</h2>
              <div className="grid grid-cols-1 gap-3">
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
      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">常见问题</h3>
        <div className="space-y-3 text-xs text-zinc-400">
          <div>
            <span className="text-zinc-300 font-medium">Q: 必须全部填完才能用吗？</span>
            <p className="mt-0.5">不需要。只有「AI 分析密钥」是必填的，其他数据源可以按需开通。没有填的数据源系统会自动跳过。</p>
          </div>
          <div>
            <span className="text-zinc-300 font-medium">Q: 填了 Key 后需要重启吗？</span>
            <p className="mt-0.5">不需要。保存后系统会自动生效，下一次采集周期就会使用新的 Key。</p>
          </div>
          <div>
            <span className="text-zinc-300 font-medium">Q: Key 安全吗？</span>
            <p className="mt-0.5">所有 API Key 在数据库中加密存储，前端只能看到脱敏后的值（如 sk-****abc），不会明文显示。</p>
          </div>
          <div>
            <span className="text-zinc-300 font-medium">Q: 免费的数据源够用吗？</span>
            <p className="mt-0.5">
              免费数据源（Binance + Alternative.me + BlockBeats + CryptoPanic + CoinGecko Demo）已经覆盖了 K 线、合约、恐慌指数、新闻、基本面数据，
              对于基础分析足够。付费数据源（CoinGlass、GlassNode、CoinGecko 高级套餐）主要增强衡生品、链上深度和社区情绪维度。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
