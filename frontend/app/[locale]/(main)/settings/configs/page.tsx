"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
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

// ── Config Preset (keys only – labels resolved via i18n) ──

interface ConfigPreset {
  key: string;
  isSecret: boolean;
  defaultValue?: string;
  unit?: string;
  category: string;
  options?: string[];
}

interface ConfigGroup {
  id: string;
  items: ConfigPreset[];
}

const CONFIG_GROUPS: ConfigGroup[] = [
  {
    id: "keys",
    items: [
      { key: "dmx_api_key", isSecret: true, category: "ai_model" },
      { key: "dmx_base_url", isSecret: false, defaultValue: "https://www.dmxapi.cn/v1", category: "ai_model" },
      { key: "glassnode_api_key", isSecret: true, category: "data_source" },
      { key: "coingecko_api_key", isSecret: true, category: "data_source" },
      { key: "coinglass_api_key", isSecret: true, category: "data_source" },
      { key: "alphanode_api_key", isSecret: true, category: "data_source" },
      { key: "cryptoquant_api_key", isSecret: true, category: "data_source" },
      { key: "fred_api_key", isSecret: true, category: "data_source" },
      {
        key: "coinglass_tier",
        isSecret: false,
        defaultValue: "hobbyist",
        category: "data_source",
        options: ["hobbyist", "startup", "standard", "professional"],
      },
      { key: "oxapay_merchant_key", isSecret: true, category: "payment" },
      { key: "oxapay_callback_url", isSecret: false, category: "payment" },
      { key: "telegram_bot_token", isSecret: true, category: "notification" },
      { key: "resend_api_key", isSecret: true, category: "notification" },
      { key: "sendgrid_api_key", isSecret: true, category: "notification" },
      { key: "sentry_dsn_backend", isSecret: true, category: "monitoring" },
    ],
  },
  {
    id: "membership",
    items: [
      { key: "plan_price_pro", isSecret: false, defaultValue: "99", unit: "USD", category: "pricing" },
      { key: "plan_price_flagship", isSecret: false, defaultValue: "299", unit: "USD", category: "pricing" },
      { key: "plan_discount_quarterly", isSecret: false, defaultValue: "0.9", category: "pricing" },
      { key: "plan_discount_yearly", isSecret: false, defaultValue: "0.7", category: "pricing" },
      { key: "free_trial_intraday_count", isSecret: false, defaultValue: "1", unit: "次", category: "tier" },
      { key: "analysis_daily_limit_free_scalping", isSecret: false, defaultValue: "5", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_pro_scalping", isSecret: false, defaultValue: "50", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_flagship_scalping", isSecret: false, defaultValue: "200", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_pro_intraday", isSecret: false, defaultValue: "20", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_flagship_intraday", isSecret: false, defaultValue: "100", unit: "次/天", category: "quota" },
      { key: "analysis_daily_limit_flagship_trend", isSecret: false, defaultValue: "50", unit: "次/天", category: "quota" },
      { key: "query_limit_free", isSecret: false, defaultValue: "3", unit: "次/天", category: "tier" },
      { key: "perf_days_free", isSecret: false, defaultValue: "7", unit: "天", category: "tier" },
      { key: "new_user_bonus_credits", isSecret: false, defaultValue: "5", unit: "次", category: "tier" },
      { key: "new_user_bonus_enabled", isSecret: false, defaultValue: "true", category: "tier" },
      { key: "playbook_sim_min_level", isSecret: false, defaultValue: "1", category: "tier" },
      { key: "backtest_free_days", isSecret: false, defaultValue: "7", unit: "天", category: "tier" },
    ],
  },
  {
    id: "analysis",
    items: [
      { key: "consensus_signal_threshold", isSecret: false, defaultValue: "0.35", category: "consensus" },
      { key: "consensus_min_agreement", isSecret: false, defaultValue: "2", category: "consensus" },
      { key: "signal_push_threshold", isSecret: false, defaultValue: "0.7", category: "push" },
    ],
  },
  {
    id: "risk",
    items: [
      { key: "risk_threshold_exchange_inflow_btc", isSecret: false, defaultValue: "5000", unit: "BTC", category: "monitoring" },
      { key: "risk_threshold_whale_transfer_usd", isSecret: false, defaultValue: "50000000", unit: "USD", category: "monitoring" },
      { key: "risk_threshold_mvrv_high", isSecret: false, defaultValue: "3.5", category: "monitoring" },
      { key: "risk_threshold_mvrv_low", isSecret: false, defaultValue: "1.0", category: "monitoring" },
      { key: "risk_threshold_fear_greed_panic", isSecret: false, defaultValue: "20", category: "monitoring" },
      { key: "risk_threshold_fear_greed_greed", isSecret: false, defaultValue: "80", category: "monitoring" },
      { key: "risk_threshold_funding_rate", isSecret: false, defaultValue: "0.01", category: "monitoring" },
      { key: "risk_threshold_liquidation_1h", isSecret: false, defaultValue: "50000000", unit: "USD", category: "monitoring" },
      { key: "risk_threshold_long_short_imbalance", isSecret: false, defaultValue: "0.3", category: "monitoring" },
      { key: "sentry_traces_sample_rate", isSecret: false, defaultValue: "0.2", category: "monitoring" },
    ],
  },
  {
    id: "site",
    items: [
      { key: "site_brand_name", isSecret: false, defaultValue: "AXIOM洞察", category: "site" },
      { key: "site_brand_url", isSecret: false, defaultValue: "", category: "site" },
      { key: "register_feature_enabled", isSecret: false, defaultValue: "true", category: "registration" },
      { key: "register_referral_required", isSecret: false, defaultValue: "false", category: "registration" },
      { key: "partner_commission_rate", isSecret: false, defaultValue: "0.10", category: "partner" },
      { key: "partner_min_withdrawal", isSecret: false, defaultValue: "50", unit: "USDT", category: "partner" },
    ],
  },
];

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

const ACTION_STYLES: Record<string, { text: string; bg: string }> = {
  create: { text: "text-bull", bg: "bg-[var(--color-bull)]/20" },
  update: { text: "text-accent", bg: "bg-[var(--color-accent)]/20" },
  delete: { text: "text-bear", bg: "bg-[var(--color-bear)]/20" },
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
  const t = useTranslations("settings.configs");
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-zinc-200">{t("title")}</h1>
      <div className="card-surface rounded-lg p-6 text-center">
        <p className="text-sm text-bear">{t("permissionDenied")}</p>
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
  const t = useTranslations("settings.configs");
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
          description: t(`presets.${preset.key}.help`),
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
  }, [existingKeys, onDone, t]);

  if (defaultPresets.length === 0 && !result) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-surface rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-300 flex items-center gap-2">
          <span className="text-zinc-400">→</span>
          <span>{t("batchInit.title")}</span>
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          {result
            ? t("batchInit.resultSuccess", { created: result.created, skipped: result.skipped })
            : t("batchInit.description", { count: defaultPresets.length })}
        </p>
        {error && <p className="text-xs text-bear mt-1">{error}</p>}
      </div>
      <button
        type="button"
        onClick={handleInit}
        disabled={running || defaultPresets.length === 0}
        className="shrink-0 rounded-lg bg-[var(--color-bull)]/20 px-5 py-2.5 text-xs font-semibold text-bull transition-all duration-200 hover:bg-[var(--color-bull)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? t("batchInit.buttonRunning") : result ? t("batchInit.buttonDone") : t("batchInit.button")}
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
  const t = useTranslations("settings.configs");
  const [showSecret, setShowSecret] = useState(false);
  const hasValue = existingConfig !== undefined;

  return (
    <div className="py-3 first:pt-0 last:pb-0 border-b border-white/[0.06] last:border-b-0">
      {/* Label row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-200">{t(`presets.${preset.key}.label`)}</span>
            {preset.isSecret && (
              <span className="text-xs text-yellow-500/70 bg-yellow-500/10 rounded px-1.5 py-0.5">{t("configItem.encrypted")}</span>
            )}
            {hasValue && (
              <span className="text-xs text-bull/70 bg-[var(--color-bull)]/10 rounded px-1.5 py-0.5">{t("configItem.configured")}</span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">{t(`presets.${preset.key}.help`)}</p>
        </div>
        {/* Delete button - only if config exists */}
        {hasValue && (
          <button
            type="button"
            onClick={() => onDeleteRequest(preset.key)}
            className="shrink-0 rounded p-1.5 text-zinc-400 transition-colors hover:bg-[var(--color-bear)]/10 hover:text-bear"
            title={t("configItem.delete")}
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
            {preset.options.map((optVal) => (
              <option key={optVal} value={optVal} className="bg-[#18181b] text-zinc-200">
                {t(`presets.${preset.key}.options.${optVal}`)}
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
                placeholder={preset.defaultValue ? t("configItem.defaultValue", { value: preset.defaultValue }) : t("configItem.placeholder")}
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
                title={showSecret ? t("configItem.hide") : t("configItem.show")}
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
  { mode: "scalping", keys: ["analysis_daily_limit_free_scalping", "analysis_daily_limit_pro_scalping", "analysis_daily_limit_flagship_scalping"] },
  { mode: "intraday", keys: ["", "analysis_daily_limit_pro_intraday", "analysis_daily_limit_flagship_intraday"] },
  { mode: "trend", keys: ["", "", "analysis_daily_limit_flagship_trend"] },
];

function QuotaMatrixTable({ configMap, editValues }: { configMap: Map<string, SystemConfig>; editValues: Record<string, string> }) {
  const t = useTranslations("settings.configs");

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
      className="card-surface rounded-lg p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📊</span>
        <h3 className="text-sm font-semibold text-zinc-200">{t("quotaMatrix.title")}</h3>
        <span className="text-xs text-zinc-400 bg-white/[0.06] rounded px-1.5 py-0.5">{t("quotaMatrix.readonly")}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="pb-3 text-left text-xs font-medium text-zinc-400 w-28">{t("quotaMatrix.modeHeader")}</th>
              <th className="pb-3 text-center text-xs font-medium text-zinc-400">{t("quotaMatrix.tiers.free")}</th>
              <th className="pb-3 text-center text-xs font-medium text-indigo-400">{t("quotaMatrix.tiers.pro")}</th>
              <th className="pb-3 text-center text-xs font-medium text-amber-400">{t("quotaMatrix.tiers.flagship")}</th>
            </tr>
          </thead>
          <tbody>
            {QUOTA_MATRIX_ROWS.map((row) => (
              <tr key={row.mode} className="border-b border-white/[0.06]">
                <td className="py-3 text-xs text-zinc-300 font-medium">{t(`quotaMatrix.modes.${row.mode}`)}</td>
                {row.keys.map((key, i) => {
                  const val = getValue(key);
                  const isLocked = val === "—";
                  return (
                    <td key={i} className="py-3 text-center">
                      {isLocked ? (
                        <span className="text-xs text-zinc-500">{t("quotaMatrix.locked")}</span>
                      ) : (
                        <span className="font-mono text-xs text-zinc-200">{val}<span className="text-zinc-400 ml-0.5">{t("quotaMatrix.timesPerDay")}</span></span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="pt-3 text-xs text-zinc-300 font-medium">{t("quotaMatrix.freeTrial")}</td>
              <td className="pt-3 text-center">
                <span className="font-mono text-xs text-emerald-400">{freeTrialVal}<span className="text-zinc-400 ml-0.5">{t("quotaMatrix.times")}</span></span>
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
  featureKey: string;
  hobbyist: boolean;
  startup: boolean;
  standard: boolean;
  professional: boolean;
}

const CG_TIER_FEATURES: TierFeature[] = [
  { featureKey: "oi", hobbyist: true, startup: true, standard: true, professional: true },
  { featureKey: "fundingRate", hobbyist: true, startup: true, standard: true, professional: true },
  { featureKey: "liquidation", hobbyist: true, startup: true, standard: true, professional: true },
  { featureKey: "netPosition", hobbyist: false, startup: true, standard: true, professional: true },
  { featureKey: "longShortRatio", hobbyist: false, startup: true, standard: true, professional: true },
  { featureKey: "heatmapModel1", hobbyist: false, startup: true, standard: true, professional: true },
  { featureKey: "cvd", hobbyist: false, startup: false, standard: true, professional: true },
  { featureKey: "orderbook", hobbyist: false, startup: false, standard: true, professional: true },
  { featureKey: "options", hobbyist: false, startup: false, standard: true, professional: true },
  { featureKey: "heatmapModel23", hobbyist: false, startup: false, standard: true, professional: true },
  { featureKey: "websocket", hobbyist: false, startup: false, standard: true, professional: true },
];

const CG_TIER_META: Record<string, { rateLimit: string; interval: string; color: string }> = {
  hobbyist: { rateLimit: "30/min", interval: "5min", color: "text-zinc-400" },
  startup: { rateLimit: "80/min", interval: "2min", color: "text-blue-400" },
  standard: { rateLimit: "300/min", interval: "1min", color: "text-emerald-400" },
  professional: { rateLimit: "1200/min", interval: "30s", color: "text-amber-400" },
};

function CoinGlassTierCard({ currentTier }: { currentTier: string }) {
  const t = useTranslations("settings.configs");
  const tier = (currentTier || "hobbyist").toLowerCase();
  const meta = CG_TIER_META[tier] ?? CG_TIER_META.hobbyist;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card-surface rounded-lg p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <h3 className="text-sm font-semibold text-zinc-200">{t("coinglassTier.title")}</h3>
          <span className={`text-xs font-medium rounded px-2 py-0.5 bg-white/[0.06] ${meta.color}`}>
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>{t("coinglassTier.rateLimit")} <span className={`font-mono ${meta.color}`}>{meta.rateLimit}</span></span>
          <span>{t("coinglassTier.interval")} <span className={`font-mono ${meta.color}`}>{meta.interval}</span></span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
        {CG_TIER_FEATURES.map((f) => {
          const available = f[tier as keyof TierFeature] as boolean;
          return (
            <div key={f.featureKey} className="flex items-center gap-1.5">
              <span className={`text-xs ${available ? "text-bull" : "text-zinc-500"}`}>
                {available ? "●" : "○"}
              </span>
              <span className={`text-xs ${available ? "text-zinc-300" : "text-zinc-500"}`}>
                {t(`coinglassTier.features.${f.featureKey}`)}
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
  const t = useTranslations("settings.configs");
  const isSaving = savingGroupId === group.id;
  const isSaved = savedGroupId === group.id;

  const hasChanges = group.items.some((item) => {
    const existing = configMap.get(item.key);
    const currentEdit = editValues[item.key] ?? "";
    if (existing) {
      return currentEdit !== existing.value;
    }
    return currentEdit.trim() !== "";
  });

  const configuredCount = group.items.filter((i) => configMap.has(i.key)).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card-surface rounded-lg p-5"
    >
      {/* Group header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{t(`groups.${group.id}.icon`)}</span>
          <h3 className="text-sm font-semibold text-zinc-200">{t(`groups.${group.id}.title`)}</h3>
          <span className="text-xs text-zinc-400 bg-white/[0.06] rounded px-1.5 py-0.5">
            {t("groupCard.configuredCount", { current: configuredCount, total: group.items.length })}
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
          {isSaving ? t("groupCard.saving") : isSaved ? t("groupCard.saved") : t("groupCard.save")}
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
  const t = useTranslations("settings.configs");
  const displayName = PRESET_MAP.has(configKey) ? t(`presets.${configKey}.label`) : configKey;

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
          className="w-full max-w-sm backdrop-blur-md bg-bg-primary border border-white/[0.08] rounded-lg p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-zinc-200">
            {t("deleteConfirm.message", { name: displayName })}
          </p>
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="rounded-lg border border-white/[0.08] px-4 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06]"
            >
              {t("deleteConfirm.cancel")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="rounded-lg bg-[var(--color-bear)]/20 px-4 py-2 text-xs font-semibold text-bear transition-all duration-200 hover:bg-[var(--color-bear)]/30 disabled:opacity-50"
            >
              {deleting ? t("deleteConfirm.deleting") : t("deleteConfirm.confirm")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Audit Log Panel ─────────────────────────────────────── 

function AuditLogPanel() {
  const t = useTranslations("settings.configs");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<AuditLogPage>({
    queryKey: ["configAuditLogs", page],
    queryFn: () => fetchAuditLogs(page, 10),
    enabled: open,
  });

  const totalPages = data ? Math.ceil(data.total / data.size) : 0;

  return (
    <div className="card-surface rounded-lg p-5">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="text-sm font-semibold text-zinc-200">{t("auditLog.title")}</span>
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
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">{t("auditLog.columns.time")}</th>
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">{t("auditLog.columns.action")}</th>
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">{t("auditLog.columns.configKey")}</th>
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">{t("auditLog.columns.oldValue")}</th>
                          <th className="pb-3 text-left text-xs font-medium text-zinc-400">{t("auditLog.columns.newValue")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((log: AuditLogEntry) => {
                          const st = ACTION_STYLES[log.action] ?? ACTION_STYLES.update;
                          const displayName = PRESET_MAP.has(log.config_key)
                            ? t(`presets.${log.config_key}.label`)
                            : log.config_key;
                          return (
                            <tr key={log.id} className="border-b border-white/[0.06]">
                              <td className="py-3 font-mono text-xs text-zinc-400">
                                {formatDate(log.created_at)}
                              </td>
                              <td className="py-3">
                                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${st.text} ${st.bg}`}>
                                  {t(`auditLog.actions.${log.action}`)}
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
                      {t("auditLog.pagination.page", { current: page, total: totalPages, count: data.total })}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="rounded border border-white/[0.08] px-3 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        {t("auditLog.pagination.prev")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="rounded border border-white/[0.08] px-3 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        {t("auditLog.pagination.next")}
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
  const t = useTranslations("settings.configs");
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

  const handleValueChange = useCallback((key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
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

    // #region agent log
    const logSave = (msg: string, data: Record<string, unknown>) => {
      fetch("http://127.0.0.1:7463/ingest/17a3f00d-8f41-4ee8-acfa-f135822078c1", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "22da79" },
        body: JSON.stringify({
          sessionId: "22da79",
          location: "settings/configs/page.tsx:handleSaveGroup",
          message: msg,
          data,
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    };
    logSave("handleSaveGroup started", { groupId: group.id, itemCount: group.items.length });
    // #endregion

    try {
      for (const item of group.items) {
        const currentValue = editValues[item.key]?.trim() ?? "";
        const existing = configMap.get(item.key);
        const action =
          !currentValue
            ? "skip_empty"
            : existing
              ? currentValue !== existing.value
                ? "update"
                : "skip_unchanged"
              : "create";

        // #region agent log
        logSave("save item decision", {
          hypothesisId: "H1",
          key: item.key,
          currentValueLen: currentValue.length,
          currentValueEmpty: !currentValue,
          hasExisting: !!existing,
          existingValueLen: existing?.value?.length ?? 0,
          action,
        });
        // #endregion

        if (!currentValue) continue;

        if (existing) {
          if (currentValue !== existing.value) {
            try {
              await updateConfig(item.key, { value: currentValue });
              // #region agent log
              logSave("updateConfig ok", { hypothesisId: "H2", key: item.key });
              // #endregion
            } catch (apiErr) {
              // #region agent log
              logSave("updateConfig failed", {
                hypothesisId: "H2",
                key: item.key,
                error: apiErr instanceof Error ? apiErr.message : String(apiErr),
              });
              // #endregion
              throw apiErr;
            }
          }
        } else {
          try {
            const data: ConfigCreate = {
              config_key: item.key,
              value: currentValue,
              category: item.category,
              description: t(`presets.${item.key}.help`),
              is_secret: item.isSecret,
            };
            await createConfig(data);
            // #region agent log
            logSave("createConfig ok", { hypothesisId: "H2", key: item.key });
            // #endregion
          } catch (apiErr) {
            // #region agent log
            logSave("createConfig failed", {
              hypothesisId: "H2",
              key: item.key,
              error: apiErr instanceof Error ? apiErr.message : String(apiErr),
            });
            // #endregion
            throw apiErr;
          }
        }
      }
      setSavedGroupId(group.id);
      refreshConfigs();
      setTimeout(() => setSavedGroupId((prev) => (prev === group.id ? null : prev)), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("status.saveFailed");
      setSaveError(msg);
      // #region agent log
      logSave("handleSaveGroup catch", {
        hypothesisId: "H2",
        error: msg,
      });
      // #endregion
    } finally {
      setSavingGroupId(null);
    }
  }, [editValues, configMap, refreshConfigs, t]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteConfig(deleteTarget);
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[deleteTarget];
        return next;
      });
      setDeleteTarget(null);
      refreshConfigs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("status.deleteFailed");
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, refreshConfigs, t]);

  // Loading state
  if (userLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h1 className="text-lg font-semibold text-zinc-200">{t("title")}</h1>
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
          <h1 className="text-lg font-semibold text-zinc-200">{t("title")}</h1>
          <p className="text-xs text-zinc-400 mt-1">{t("subtitle")}</p>
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
        <div className="backdrop-blur-md bg-white/[0.06] border border-[var(--color-bear)]/30 rounded-lg p-6 text-center">
          <p className="text-sm text-bear">
            {configsError instanceof Error ? configsError.message : t("status.loadFailed")}
          </p>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="backdrop-blur-md bg-white/[0.06] border border-[var(--color-bear)]/30 rounded-lg p-4">
          <p className="text-xs text-bear">{saveError}</p>
        </div>
      )}

      {/* Delete error */}
      {deleteError && (
        <div className="backdrop-blur-md bg-white/[0.06] border border-[var(--color-bear)]/30 rounded-lg p-4">
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
