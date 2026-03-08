"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { fetchCurrentUser, type UserInfo } from "@/lib/api/auth";
import {
  fetchConfigs,
  createConfig,
  updateConfig,
  deleteConfig,
  fetchAuditLogs,
  type SystemConfig,
  type ConfigCreate,
  type AuditLogEntry,
  type AuditLogPage,
} from "@/lib/api/configs";
import { EmptyAuditLog } from "@/components/ui/EmptyState";

// ── Friendly Config Preset ──────────────────────────────── 

interface ConfigPreset {
  key: string;
  label: string;
  help: string;
  isSecret: boolean;
  defaultValue?: string;
  unit?: string;
  category: string;
  options?: { value: string; label: string }[];
}

interface ConfigGroup {
  id: string;
  icon: string;
  title: string;
  items: ConfigPreset[];
}

const CONFIG_GROUPS: ConfigGroup[] = [
  {
    id: "keys",
    icon: "",
    title: "密钥与接入",
    items: [
      { key: "dmx_api_key", label: "AI 分析密钥", help: "用于调用 AI 模型分析市场数据", isSecret: true, category: "ai_model" },
      { key: "dmx_base_url", label: "AI 服务地址", help: "AI 分析服务的接口地址", isSecret: false, defaultValue: "https://www.dmxapi.cn/v1", category: "ai_model" },
      { key: "glassnode_api_key", label: "链上数据密钥", help: "GlassNode 链上指标（MVRV/NVT/活跃地址等）", isSecret: true, category: "data_source" },
      { key: "coingecko_api_key", label: "基本面数据密钥", help: "CoinGecko 市值/社区/开发者/趋势数据", isSecret: true, category: "data_source" },
      { key: "coinglass_api_key", label: "CoinGlass 密钥", help: "CoinGlass 衍生品数据 API Key", isSecret: true, category: "data_source" },
      { key: "alphanode_api_key", label: "CoinGlass 代理密钥", help: "AlphaNode 代理通道访问 Key（CoinGlass REST proxy）", isSecret: true, category: "data_source" },
      { key: "cryptoquant_api_key", label: "CryptoQuant 主源密钥", help: "CryptoQuant 链上主数据源 API Key", isSecret: true, category: "data_source" },
      { key: "fred_api_key", label: "FRED 主源密钥", help: "FRED 宏观主数据源 API Key", isSecret: true, category: "data_source" },
      {
        key: "coinglass_tier",
        label: "CoinGlass 套餐",
        help: "当前订阅的套餐等级，决定可用端点、限频和采集频率",
        isSecret: false,
        defaultValue: "hobbyist",
        category: "data_source",
        options: [
          { value: "hobbyist", label: "Hobbyist — 30次/分 · 5分钟间隔 · 基础OI/FR" },
          { value: "startup", label: "Startup — 80次/分 · 2分钟间隔 · +净持仓/大户比" },
          { value: "standard", label: "Standard — 300次/分 · 1分钟间隔 · +CVD/订单簿/期权/WS" },
          { value: "professional", label: "Professional — 1200次/分 · 30秒间隔 · 全部端点" },
        ],
      },
      { key: "nowpayments_api_key", label: "支付网关密钥", help: "NowPayments USDT 支付", isSecret: true, category: "payment" },
      { key: "nowpayments_ipn_secret", label: "支付回调密钥", help: "支付通知验证签名", isSecret: true, category: "payment" },
      { key: "telegram_bot_token", label: "Telegram 机器人", help: "TG 推送通知的机器人令牌", isSecret: true, category: "notification" },
      { key: "sendgrid_api_key", label: "邮件服务密钥", help: "SendGrid 邮件推送服务", isSecret: true, category: "notification" },
      { key: "sentry_dsn_backend", label: "错误监控地址", help: "Sentry 错误追踪服务地址", isSecret: true, category: "monitoring" },
    ],
  },
  {
    id: "membership",
    icon: "",
    title: "会员与配额",
    items: [
      { key: "plan_price_pro", label: "专业版月价", help: "专业版每月价格（USD）", isSecret: false, defaultValue: "99", unit: "USD", category: "pricing" },
      { key: "plan_price_flagship", label: "旗舰版月价", help: "旗舰版每月价格（USD）", isSecret: false, defaultValue: "299", unit: "USD", category: "pricing" },
      { key: "plan_discount_quarterly", label: "季度折扣", help: "季度订阅折扣比例（0.9 = 9折）", isSecret: false, defaultValue: "0.9", category: "pricing" },
      { key: "plan_discount_yearly", label: "年度折扣", help: "年度订阅折扣比例（0.7 = 7折）", isSecret: false, defaultValue: "0.7", category: "pricing" },
      { key: "free_trial_intraday_count", label: "免费体验次数", help: "免费用户可领取的日内博弈体验次数（0=关闭）", isSecret: false, defaultValue: "1", unit: "次", category: "tier" },
      { key: "analysis_daily_limit_free_scalping", label: "免费-实时短线", help: "免费用户每天实时短线分析次数", isSecret: false, defaultValue: "5", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_pro_scalping", label: "专业-实时短线", help: "专业用户每天实时短线分析次数", isSecret: false, defaultValue: "50", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_flagship_scalping", label: "旗舰-实时短线", help: "旗舰用户每天实时短线分析次数", isSecret: false, defaultValue: "200", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_pro_intraday", label: "专业-日内博弈", help: "专业用户每天日内博弈分析次数", isSecret: false, defaultValue: "20", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_flagship_intraday", label: "旗舰-日内博弈", help: "旗舰用户每天日内博弈分析次数", isSecret: false, defaultValue: "100", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_flagship_trend", label: "旗舰-趋势布局", help: "旗舰用户每天趋势布局分析次数", isSecret: false, defaultValue: "50", unit: "次/天", category: "quota" },
      { key: "query_limit_free", label: "免费查询次数", help: "免费用户每天最多查询几次", isSecret: false, defaultValue: "3", unit: "次/天", category: "tier" },
      { key: "perf_days_free", label: "免费绩效天数", help: "免费用户可查看最近几天的绩效", isSecret: false, defaultValue: "7", unit: "天", category: "tier" },
      { key: "new_user_bonus_credits", label: "新用户赠送次数", help: "新注册用户赠送的分析体验次数", isSecret: false, defaultValue: "5", unit: "次", category: "tier" },
      { key: "new_user_bonus_enabled", label: "赠送开关", help: "是否启用新用户赠送（true/false）", isSecret: false, defaultValue: "true", category: "tier" },
      { key: "playbook_sim_min_level", label: "剧本推演最低等级", help: "最低会员等级（0=免费, 1=专业, 2=旗舰）", isSecret: false, defaultValue: "1", category: "tier" },
      { key: "backtest_free_days", label: "免费回测天数", help: "免费用户可查看的回测数据天数", isSecret: false, defaultValue: "7", unit: "天", category: "tier" },
    ],
  },
  {
    id: "analysis",
    icon: "",
    title: "分析与信号",
    items: [
      { key: "consensus_signal_threshold", label: "信号阈值", help: "加权分数超过此值才判定为 bullish/bearish（0.1~0.8）", isSecret: false, defaultValue: "0.35", category: "consensus" },
      { key: "consensus_min_agreement", label: "最小一致数", help: "至少几个模型方向一致才可判定（1~4）", isSecret: false, defaultValue: "2", category: "consensus" },
      { key: "signal_push_threshold", label: "高置信推送阈值", help: "分析置信度超过此阈值时推送信号（0.5~0.9）", isSecret: false, defaultValue: "0.7", category: "push" },
    ],
  },
  {
    id: "risk",
    icon: "",
    title: "风险与监控",
    items: [
      { key: "risk_threshold_exchange_inflow_btc", label: "交易所流入预警", help: "BTC 流入交易所超过此值触发预警", isSecret: false, defaultValue: "5000", unit: "BTC", category: "monitoring" },
      { key: "risk_threshold_whale_transfer_usd", label: "鲸鱼转账预警", help: "大额转账超过此值触发预警", isSecret: false, defaultValue: "50000000", unit: "USD", category: "monitoring" },
      { key: "risk_threshold_mvrv_high", label: "MVRV 高位预警", help: "MVRV 超过此值表示市场过热", isSecret: false, defaultValue: "3.5", category: "monitoring" },
      { key: "risk_threshold_mvrv_low", label: "MVRV 低位预警", help: "MVRV 低于此值表示市场低估", isSecret: false, defaultValue: "1.0", category: "monitoring" },
      { key: "risk_threshold_fear_greed_panic", label: "恐慌指数预警", help: "恐贪指数低于此值触发恐慌预警", isSecret: false, defaultValue: "20", category: "monitoring" },
      { key: "risk_threshold_fear_greed_greed", label: "贪婪指数预警", help: "恐贪指数高于此值触发贪婪预警", isSecret: false, defaultValue: "80", category: "monitoring" },
      { key: "risk_threshold_funding_rate", label: "资金费率预警", help: "费率绝对值超过此值触发预警", isSecret: false, defaultValue: "0.01", category: "monitoring" },
      { key: "risk_threshold_liquidation_1h", label: "爆仓量预警", help: "1小时爆仓量超过此值触发预警", isSecret: false, defaultValue: "50000000", unit: "USD", category: "monitoring" },
      { key: "risk_threshold_long_short_imbalance", label: "多空比失衡预警", help: "多空比偏离超过此值触发预警", isSecret: false, defaultValue: "0.3", category: "monitoring" },
      { key: "sentry_traces_sample_rate", label: "监控采样率", help: "性能监控的采样比例（0-1）", isSecret: false, defaultValue: "0.2", category: "monitoring" },
    ],
  },
  {
    id: "site",
    icon: "",
    title: "站点与注册",
    items: [
      { key: "site_brand_name", label: "品牌名称", help: "用于推广文案、邀请页等", isSecret: false, defaultValue: "Axiom", category: "site" },
      { key: "site_brand_url", label: "品牌官网域名", help: "用于拼接邀请链接，如 https://app.example.com", isSecret: false, defaultValue: "", category: "site" },
      { key: "register_referral_required", label: "强制邀请码注册", help: "开启后用户必须填写有效邀请码才能注册（true/false）", isSecret: false, defaultValue: "false", category: "registration" },
      { key: "partner_commission_rate", label: "合伙人分成比例", help: "合伙人推荐订单分成比例（0.10 = 10%）", isSecret: false, defaultValue: "0.10", category: "partner" },
      { key: "partner_min_withdrawal", label: "最低提现金额", help: "合伙人最低提现金额", isSecret: false, defaultValue: "50", unit: "USDT", category: "partner" },
    ],
  },
];

// Flat list of all presets for batch init
const ALL_PRESETS: ConfigPreset[] = CONFIG_GROUPS.flatMap((g) => g.items);
const PRESET_MAP = new Map(ALL_PRESETS.map((p) => [p.key, p]));

// ── Helpers ──────────────────────────────────────────────── 

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_STYLES: Record<string, { text: string; bg: string; label: string }> = {
  create: { text: "text-bull", bg: "bg-[var(--color-bull)]/20", label: "创建" },
  update: { text: "text-accent", bg: "bg-[var(--color-accent)]/20", label: "更新" },
  delete: { text: "text-bear", bg: "bg-[var(--color-bear)]/20", label: "删除" },
};

// ── Inline SVG Icons ────────────────────────────────────── 

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

// ── Permission Denied ───────────────────────────────────── 

function PermissionDenied() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-zinc-200">参数设置</h1>
      <div className="card-surface rounded-xl p-6 text-center">
        <p className="text-sm text-bear">权限不足 — 仅管理员可访问参数设置</p>
      </div>
    </div>
  );
}

// ── Batch Init Button ───────────────────────────────────── 

interface BatchInitButtonProps {
  existingKeys: Set<string>;
  onDone: () => void;
}

function BatchInitButton({ existingKeys, onDone }: BatchInitButtonProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultPresets = ALL_PRESETS.filter((p) => p.defaultValue && !existingKeys.has(p.key));

  const handleInit = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    let created = 0;
    let skipped = 0;
    for (const preset of ALL_PRESETS.filter((p) => p.defaultValue)) {
      if (existingKeys.has(preset.key)) {
        skipped++;
        continue;
      }
      try {
        await createConfig({
          config_key: preset.key,
          value: preset.defaultValue as string,
          category: preset.category,
          description: preset.help,
          is_secret: preset.isSecret,
        });
        created++;
      } catch {
        skipped++;
      }
    }
    setResult({ created, skipped });
    setRunning(false);
    if (created > 0) onDone();
  }, [existingKeys, onDone]);

  if (defaultPresets.length === 0 && !result) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-surface rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-300 flex items-center gap-2">
          <span className="text-zinc-400">→</span>
          <span>涓€閿垵濮嬪寲榛樿閰嶇疆</span>
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          {result
            ? `完成：写入 ${result.created} 项，跳过 ${result.skipped} 项（已存在）`
            : `自动填入 ${defaultPresets.length} 项推荐默认值（会员限制、风险阈值等），已有的不会被覆盖`}
        </p>
        {error && <p className="text-xs text-bear mt-1">{error}</p>}
      </div>
      <button
        type="button"
        onClick={handleInit}
        disabled={running || defaultPresets.length === 0}
        className="shrink-0 rounded-lg bg-[var(--color-bull)]/20 px-5 py-2.5 text-xs font-semibold text-bull transition-all duration-200 hover:bg-[var(--color-bull)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? "写入中..." : result ? "✓ 已完成" : "一键初始化"}
      </button>
    </motion.div>
  );
}

// ── Config Item Row ─────────────────────────────────────── 

interface ConfigItemProps {
  preset: ConfigPreset;
  existingConfig: SystemConfig | undefined;
  editValue: string;
  onValueChange: (key: string, value: string) => void;
  onDeleteRequest: (key: string) => void;
}

function ConfigItem({ preset, existingConfig, editValue, onValueChange, onDeleteRequest }: ConfigItemProps) {
  const [showSecret, setShowSecret] = useState(false);
  const hasValue = existingConfig !== undefined;

  return (
    <div className="py-3 first:pt-0 last:pb-0 border-b border-white/[0.06] last:border-b-0">
      {/* Label row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-200">{preset.label}</span>
            {preset.isSecret && (
              <span className="text-xs text-yellow-500/70 bg-yellow-500/10 rounded px-1.5 py-0.5">加密</span>
            )}
            {hasValue && (
              <span className="text-xs text-bull/70 bg-[var(--color-bull)]/10 rounded px-1.5 py-0.5">已配置</span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">{preset.help}</p>
        </div>
        {/* Delete button - only if config exists */}
        {hasValue && (
          <button
            type="button"
            onClick={() => onDeleteRequest(preset.key)}
            className="shrink-0 rounded p-1.5 text-zinc-400 transition-colors hover:bg-[var(--color-bear)]/10 hover:text-bear"
            title="删除此配置"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        {preset.options ? (
          <select
            value={editValue || preset.defaultValue || ""}
            onChange={(e) => onValueChange(preset.key, e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-accent/40 focus:bg-white/[0.06] appearance-none cursor-pointer"
          >
            {preset.options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#18181b] text-zinc-200">
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <>
            <div className="relative flex-1">
              <input
                type={preset.isSecret && !showSecret ? "password" : "text"}
                value={editValue}
                onChange={(e) => onValueChange(preset.key, e.target.value)}
                placeholder={preset.defaultValue ? `默认: ${preset.defaultValue}` : "请输入"}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-accent/40 focus:bg-white/[0.06]"
              />
              {preset.unit && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">
                  {preset.unit}
                </span>
              )}
            </div>
            {preset.isSecret && (
              <button
                type="button"
                onClick={() => setShowSecret((p) => !p)}
                className="shrink-0 rounded p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
                title={showSecret ? "隐藏" : "显示"}
              >
                {showSecret ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Quota Matrix Table ──────────────────────────────────── 

const QUOTA_MATRIX_ROWS = [
  { label: "实时短线", keys: ["analysis_daily_limit_free_scalping", "analysis_daily_limit_pro_scalping", "analysis_daily_limit_flagship_scalping"] },
  { label: "日内博弈", keys: ["", "analysis_daily_limit_pro_intraday", "analysis_daily_limit_flagship_intraday"] },
  { label: "趋势布局", keys: ["", "", "analysis_daily_limit_flagship_trend"] },
];

function QuotaMatrixTable({ configMap, editValues }: { configMap: Map<string, SystemConfig>; editValues: Record<string, string> }) {
  const getValue = (key: string): string => {
    if (!key) return "—";
    const edited = editValues[key]?.trim();
    if (edited) return edited;
    const existing = configMap.get(key);
    if (existing) return existing.value;
    const preset = PRESET_MAP.get(key);
    return preset?.defaultValue ?? "—";
  };

  const freeTrialKey = "free_trial_intraday_count";
  const freeTrialVal = getValue(freeTrialKey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card-surface rounded-xl p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg"></span>
        <h3 className="text-sm font-semibold text-zinc-200">配额矩阵总览</h3>
        <span className="text-xs text-zinc-400 bg-white/[0.06] rounded px-1.5 py-0.5">只读</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="pb-3 text-left text-xs font-medium text-zinc-400 w-28">分析模式</th>
              <th className="pb-3 text-center text-xs font-medium text-zinc-400">免费版</th>
              <th className="pb-3 text-center text-xs font-medium text-indigo-400">专业版</th>
              <th className="pb-3 text-center text-xs font-medium text-amber-400">旗舰版</th>
            </tr>
          </thead>
          <tbody>
            {QUOTA_MATRIX_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-white/[0.06]">
                <td className="py-3 text-xs text-zinc-300 font-medium">{row.label}</td>
                {row.keys.map((key, i) => {
                  const val = getValue(key);
                  const isLocked = val === "—";
                  return (
                    <td key={i} className="py-3 text-center">
                      {isLocked ? (
                        <span className="text-xs text-zinc-500">锁定</span>
                      ) : (
                        <span className="font-mono text-xs text-zinc-200">{val}<span className="text-zinc-400 ml-0.5">次/天</span></span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="pt-3 text-xs text-zinc-300 font-medium">免费体验</td>
              <td className="pt-3 text-center">
                <span className="font-mono text-xs text-emerald-400">{freeTrialVal}<span className="text-zinc-400 ml-0.5">次</span></span>
              </td>
              <td className="pt-3 text-center"><span className="text-xs text-zinc-500">—</span></td>
              <td className="pt-3 text-center"><span className="text-xs text-zinc-500">—</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

// ── CoinGlass Tier Summary ───────────────────────────────

interface TierFeature {
  label: string;
  hobbyist: boolean;
  startup: boolean;
  standard: boolean;
  professional: boolean;
}

const CG_TIER_FEATURES: TierFeature[] = [
  { label: "OI 持仓量", hobbyist: true, startup: true, standard: true, professional: true },
  { label: "资金费率", hobbyist: true, startup: true, standard: true, professional: true },
  { label: "爆仓数据", hobbyist: true, startup: true, standard: true, professional: true },
  { label: "净持仓", hobbyist: false, startup: true, standard: true, professional: true },
  { label: "大户多空比", hobbyist: false, startup: true, standard: true, professional: true },
  { label: "热力图 Model1", hobbyist: false, startup: true, standard: true, professional: true },
  { label: "CVD / Netflow", hobbyist: false, startup: false, standard: true, professional: true },
  { label: "聚合订单簿 / 大单", hobbyist: false, startup: false, standard: true, professional: true },
  { label: "期权 (MaxPain/Info)", hobbyist: false, startup: false, standard: true, professional: true },
  { label: "热力图 Model2/3", hobbyist: false, startup: false, standard: true, professional: true },
  { label: "WebSocket 实时推送", hobbyist: false, startup: false, standard: true, professional: true },
];

const CG_TIER_META: Record<string, { rateLimit: string; interval: string; color: string }> = {
  hobbyist: { rateLimit: "30/min", interval: "5min", color: "text-zinc-400" },
  startup: { rateLimit: "80/min", interval: "2min", color: "text-blue-400" },
  standard: { rateLimit: "300/min", interval: "1min", color: "text-emerald-400" },
  professional: { rateLimit: "1200/min", interval: "30s", color: "text-amber-400" },
};

function CoinGlassTierCard({ currentTier }: { currentTier: string }) {
  const tier = (currentTier || "hobbyist").toLowerCase();
  const meta = CG_TIER_META[tier] ?? CG_TIER_META.hobbyist;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card-surface rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <h3 className="text-sm font-semibold text-zinc-200">CoinGlass 套餐能力</h3>
          <span className={`text-xs font-medium rounded px-2 py-0.5 bg-white/[0.06] ${meta.color}`}>
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>限频 <span className={`font-mono ${meta.color}`}>{meta.rateLimit}</span></span>
          <span>间隔 <span className={`font-mono ${meta.color}`}>{meta.interval}</span></span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
        {CG_TIER_FEATURES.map((f) => {
          const available = f[tier as keyof TierFeature] as boolean;
          return (
            <div key={f.label} className="flex items-center gap-1.5">
              <span className={`text-xs ${available ? "text-bull" : "text-zinc-500"}`}>
                {available ? "●" : "○"}
              </span>
              <span className={`text-xs ${available ? "text-zinc-300" : "text-zinc-500"}`}>
                {f.label}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Config Group Card ───────────────────────────────────── 

interface ConfigGroupCardProps {
  group: ConfigGroup;
  configMap: Map<string, SystemConfig>;
  editValues: Record<string, string>;
  onValueChange: (key: string, value: string) => void;
  onSaveGroup: (group: ConfigGroup) => void;
  onDeleteRequest: (key: string) => void;
  savingGroupId: string | null;
  savedGroupId: string | null;
}

function ConfigGroupCard({
  group,
  configMap,
  editValues,
  onValueChange,
  onSaveGroup,
  onDeleteRequest,
  savingGroupId,
  savedGroupId,
}: ConfigGroupCardProps) {
  const isSaving = savingGroupId === group.id;
  const isSaved = savedGroupId === group.id;

  // Check if any item in this group has been modified
  const hasChanges = group.items.some((item) => {
    const existing = configMap.get(item.key);
    const currentEdit = editValues[item.key] ?? "";
    if (existing) {
      return currentEdit !== existing.value;
    }
    return currentEdit.trim() !== "";
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card-surface rounded-xl p-5"
    >
      {/* Group header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{group.icon}</span>
          <h3 className="text-sm font-semibold text-zinc-200">{group.title}</h3>
          <span className="text-xs text-zinc-400 bg-white/[0.06] rounded px-1.5 py-0.5">
            {group.items.filter((i) => configMap.has(i.key)).length}/{group.items.length} 已配置
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSaveGroup(group)}
          disabled={isSaving || !hasChanges}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
            isSaved
              ? "bg-[var(--color-bull)]/20 text-bull"
              : "bg-[var(--color-accent)]/20 text-accent hover:bg-[var(--color-accent)]/30"
          }`}
        >
          <SaveIcon />
          {isSaving ? "保存中..." : isSaved ? "✓ 已保存" : "保存"}
        </button>
      </div>

      {/* Items */}
      <div className="divide-y divide-white/[0.04]">
        {group.items.map((item) => (
          <ConfigItem
            key={item.key}
            preset={item}
            existingConfig={configMap.get(item.key)}
            editValue={editValues[item.key] ?? ""}
            onValueChange={onValueChange}
            onDeleteRequest={onDeleteRequest}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ── Delete Confirm Dialog ───────────────────────────────── 

interface DeleteConfirmDialogProps {
  configKey: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function DeleteConfirmDialog({ configKey, onConfirm, onCancel, deleting }: DeleteConfirmDialogProps) {
  const preset = PRESET_MAP.get(configKey);
  const displayName = preset ? preset.label : configKey;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-sm backdrop-blur-md bg-bg-primary border border-white/[0.08] rounded-xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-zinc-200">
            确认删除「{displayName}」？删除后需要重新配置。
          </p>
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="rounded-lg border border-white/[0.08] px-4 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="rounded-lg bg-[var(--color-bear)]/20 px-4 py-2 text-xs font-semibold text-bear transition-all duration-200 hover:bg-[var(--color-bear)]/30 disabled:opacity-50"
            >
              {deleting ? "删除中..." : "确认删除"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Audit Log Panel ─────────────────────────────────────── 

function AuditLogPanel() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<AuditLogPage>({
    queryKey: ["configAuditLogs", page],
    queryFn: () => fetchAuditLogs(page, 10),
    enabled: open,
  });

  const totalPages = data ? Math.ceil(data.total / data.size) : 0;

  return (
    <div className="card-surface rounded-xl p-5">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg"></span>
          <span className="text-sm font-semibold text-zinc-200">操作记录</span>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-zinc-400"
        >
          <ChevronIcon />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              ) : data && data.items.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">时间</th>
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">操作</th>
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">配置项</th>
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">旧值</th>
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">新值</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((log: AuditLogEntry) => {
                          const st = ACTION_STYLES[log.action] ?? ACTION_STYLES.update;
                          const preset = PRESET_MAP.get(log.config_key);
                          const displayName = preset ? preset.label : log.config_key;
                          return (
                            <tr key={log.id} className="border-b border-white/[0.06]">
                              <td className="py-3 font-mono text-xs text-zinc-400">
                                {formatDate(log.created_at)}
                              </td>
                              <td className="py-3">
                                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${st.text} ${st.bg}`}>
                                  {st.label}
                                </span>
                              </td>
                              <td className="py-3 text-xs text-zinc-300">
                                {displayName}
                              </td>
                              <td className="py-3 font-mono text-xs text-zinc-400">
                                {log.old_value_masked ?? "—"}
                              </td>
                              <td className="py-3 font-mono text-xs text-zinc-400">
                                {log.new_value_masked ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">
                      第 {page} / {totalPages} 页（共 {data.total} 条）
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="rounded border border-white/[0.08] px-3 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        上一页
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="rounded border border-white/[0.08] px-3 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyAuditLog />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────── 

export default function ConfigsPage() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editValuesInitialized, setEditValuesInitialized] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [savedGroupId, setSavedGroupId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: user, isLoading: userLoading } = useQuery<UserInfo>({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
  });

  const {
    data: configs = [],
    isLoading: configsLoading,
    error: configsError,
  } = useQuery<SystemConfig[]>({
    queryKey: ["adminConfigs"],
    queryFn: () => fetchConfigs(),
    enabled: !!user?.is_admin,
  });

  // Build a map of config_key -> SystemConfig
  const configMap = useMemo(() => {
    const map = new Map<string, SystemConfig>();
    for (const c of configs) {
      map.set(c.config_key, c);
    }
    return map;
  }, [configs]);

  // Initialize edit values from loaded configs (once)
  // 密钥类不填入掩码值，避免用掩码值误测或误保存
  if (!editValuesInitialized && configs.length > 0) {
    const secretKeys = new Set(
      CONFIG_GROUPS.flatMap((g) => g.items).filter((i) => i.isSecret).map((i) => i.key)
    );
    const initial: Record<string, string> = {};
    for (const c of configs) {
      if (secretKeys.has(c.config_key) && c.value.startsWith("****")) {
        initial[c.config_key] = "";
      } else {
        initial[c.config_key] = c.value;
      }
    }
    setEditValues(initial);
    setEditValuesInitialized(true);
  }

  // Also sync when configs change (after save/delete)
  const handleValueChange = useCallback((key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
    // Clear saved indicator when user edits
    setSavedGroupId(null);
    setSaveError(null);
  }, []);

  const refreshConfigs = useCallback(() => {
    setEditValuesInitialized(false);
    queryClient.invalidateQueries({ queryKey: ["adminConfigs"] });
    queryClient.invalidateQueries({ queryKey: ["configAuditLogs"] });
  }, [queryClient]);

  const handleSaveGroup = useCallback(async (group: ConfigGroup) => {
    setSavingGroupId(group.id);
    setSavedGroupId(null);
    setSaveError(null);

    try {
      for (const item of group.items) {
        const currentValue = editValues[item.key]?.trim() ?? "";
        if (!currentValue) continue; // Skip empty values

        const existing = configMap.get(item.key);
        if (existing) {
          // Only update if value changed
          if (currentValue !== existing.value) {
            await updateConfig(item.key, { value: currentValue });
          }
        } else {
          // Create new config
          const data: ConfigCreate = {
            config_key: item.key,
            value: currentValue,
            category: item.category,
            description: item.help,
            is_secret: item.isSecret,
          };
          await createConfig(data);
        }
      }
      setSavedGroupId(group.id);
      refreshConfigs();
      // Auto-clear saved indicator after 3s
      setTimeout(() => setSavedGroupId((prev) => (prev === group.id ? null : prev)), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setSaveError(msg);
    } finally {
      setSavingGroupId(null);
    }
  }, [editValues, configMap, refreshConfigs]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteConfig(deleteTarget);
      // Clear the edit value for deleted key
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[deleteTarget];
        return next;
      });
      setDeleteTarget(null);
      refreshConfigs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, refreshConfigs]);

  // Loading state
  if (userLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h1 className="text-lg font-semibold text-zinc-200">参数设置</h1>
        <div className="flex justify-center py-12">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  // Permission check
  if (!user?.is_admin) {
    return <PermissionDenied />;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-200">参数设置</h1>
          <p className="text-xs text-zinc-400 mt-1">管理系统运行所需的各项参数和密钥</p>
        </div>
      </div>

      {/* Batch init */}
      <BatchInitButton
        existingKeys={new Set(configs.map((c) => c.config_key))}
        onDone={refreshConfigs}
      />

      {/* Loading */}
      {configsLoading && (
        <div className="flex justify-center py-8">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {configsError && (
        <div className="backdrop-blur-md bg-white/[0.06] border border-[var(--color-bear)]/30 rounded-xl p-6 text-center">
          <p className="text-sm text-bear">
            {configsError instanceof Error ? configsError.message : "加载配置失败"}
          </p>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="backdrop-blur-md bg-white/[0.06] border border-[var(--color-bear)]/30 rounded-xl p-4">
          <p className="text-xs text-bear">{saveError}</p>
        </div>
      )}

      {/* Delete error */}
      {deleteError && (
        <div className="backdrop-blur-md bg-white/[0.06] border border-[var(--color-bear)]/30 rounded-xl p-4">
          <p className="text-xs text-bear">{deleteError}</p>
        </div>
      )}

      {/* Quota matrix */}
      {!configsLoading && !configsError && (
        <QuotaMatrixTable configMap={configMap} editValues={editValues} />
      )}

      {/* CoinGlass tier capability card */}
      {!configsLoading && !configsError && (
        <CoinGlassTierCard
          currentTier={
            editValues["coinglass_tier"]?.trim() ||
            configMap.get("coinglass_tier")?.value ||
            "hobbyist"
          }
        />
      )}

      {/* Config group cards */}
      {!configsLoading && !configsError && (
        <div className="grid grid-cols-1 gap-4">
          {CONFIG_GROUPS.map((group) => (
            <ConfigGroupCard
              key={group.id}
              group={group}
              configMap={configMap}
              editValues={editValues}
              onValueChange={handleValueChange}
              onSaveGroup={handleSaveGroup}
              onDeleteRequest={setDeleteTarget}
              savingGroupId={savingGroupId}
              savedGroupId={savedGroupId}
            />
          ))}
        </div>
      )}

      {/* Audit log */}
      <AuditLogPanel />

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          configKey={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          deleting={deleting}
        />
      )}
    </div>
  );
}
