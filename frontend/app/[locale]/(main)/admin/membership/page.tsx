"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  CreditCard,
  Package,
  BarChart3,
  Loader2,
  Save,
  Gift,
  Check,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/api/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

interface CreditPack {
  plan: number;
  label: string;
  price: number;
  credits: number;
  mode: string;
  description: string;
}

interface PlanConfig {
  plan: number;
  name: string;
  price_monthly: number;
  discount_quarterly: number;
  discount_yearly: number;
}

interface QuotaCell {
  config_key: string;
  level: number;
  mode: string;
  value: number;
}

interface WelcomeBonus {
  scalping: number;
  intraday: number;
  trend: number;
  free_trial_intraday: number;
}

interface QuotaMatrix {
  quotas: QuotaCell[];
  welcome: WelcomeBonus;
}

// ── API Helpers ───────────────────────────────────────────────

async function fetchPacks(): Promise<CreditPack[]> {
  const res = await authFetch(`${API}/api/admin/membership/packs`);
  if (!res.ok) throw new Error("Failed to fetch packs");
  return res.json();
}

async function fetchPlans(): Promise<PlanConfig[]> {
  const res = await authFetch(`${API}/api/admin/membership/plans`);
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

async function fetchQuotas(): Promise<QuotaMatrix> {
  const res = await authFetch(`${API}/api/admin/membership/quotas`);
  if (!res.ok) throw new Error("Failed to fetch quotas");
  return res.json();
}

// ── Tab Components ────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  scalping: "实时短线",
  intraday: "日内博弈",
  trend: "趋势布局",
  all: "全模式",
};

const MODE_COLORS: Record<string, string> = {
  scalping: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  intraday: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  trend: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  all: "text-sky-400 bg-sky-500/10 border-sky-500/20",
};

const LEVEL_LABELS = ["免费", "专业", "旗舰"];
const LEVEL_COLORS = [
  "text-zinc-400",
  "text-indigo-400",
  "text-amber-400",
];

// ── Plans Tab ─────────────────────────────────────────────────

function PlansTab() {
  const queryClient = useQueryClient();
  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: fetchPlans,
  });

  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const handleSave = useCallback(
    async (plan: PlanConfig) => {
      setSaving(plan.plan);
      try {
        const body: Record<string, number> = {};
        const priceKey = `plan_${plan.plan}_price`;
        if (editValues[priceKey]) body.price_monthly = parseFloat(editValues[priceKey]);
        if (editValues["discount_q"]) body.discount_quarterly = parseFloat(editValues["discount_q"]);
        if (editValues["discount_y"]) body.discount_yearly = parseFloat(editValues["discount_y"]);

        await authFetch(`${API}/api/admin/membership/plans/${plan.plan}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
        setSaved(plan.plan);
        setTimeout(() => setSaved(null), 2000);
        setEditValues({});
      } finally {
        setSaving(null);
      }
    },
    [editValues, queryClient]
  );

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        管理订阅套餐价格与折扣参数，修改后立即生效
      </p>

      {/* Discount row */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <h3 className="text-xs font-medium text-zinc-400 mb-3">通用折扣</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">季度折扣</label>
            <input
              type="number"
              step="0.01"
              value={editValues["discount_q"] ?? plans?.[0]?.discount_quarterly ?? ""}
              onChange={(e) => setEditValues({ ...editValues, discount_q: e.target.value })}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/40"
              placeholder="0.9"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">年度折扣</label>
            <input
              type="number"
              step="0.01"
              value={editValues["discount_y"] ?? plans?.[0]?.discount_yearly ?? ""}
              onChange={(e) => setEditValues({ ...editValues, discount_y: e.target.value })}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/40"
              placeholder="0.7"
            />
          </div>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans?.map((plan) => {
          const priceKey = `plan_${plan.plan}_price`;
          const currentPrice = editValues[priceKey] ?? plan.price_monthly;
          const qDiscount = parseFloat(editValues["discount_q"] ?? String(plan.discount_quarterly));
          const yDiscount = parseFloat(editValues["discount_y"] ?? String(plan.discount_yearly));
          const color = plan.plan === 2 ? "border-amber-500/20 bg-amber-500/[0.03]" : "border-indigo-500/20 bg-indigo-500/[0.03]";

          return (
            <div key={plan.plan} className={`rounded-lg border p-5 ${color}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${plan.plan === 2 ? "text-amber-400" : "text-indigo-400"}`}>
                    {plan.name}
                  </span>
                  <span className="text-xs text-zinc-500">Plan {plan.plan}</span>
                </div>
                <button
                  onClick={() => handleSave(plan)}
                  disabled={saving === plan.plan}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    saved === plan.plan
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-white/[0.06] text-zinc-400 border border-white/[0.08] hover:bg-white/[0.1]"
                  }`}
                >
                  {saving === plan.plan ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : saved === plan.plan ? (
                    <Check size={12} />
                  ) : (
                    <Save size={12} />
                  )}
                  {saved === plan.plan ? "已保存" : "保存"}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">月价 (USD)</label>
                  <input
                    type="number"
                    step="1"
                    value={currentPrice}
                    onChange={(e) => setEditValues({ ...editValues, [priceKey]: e.target.value })}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <span className="text-zinc-600">季付</span>
                    <p className="font-mono text-zinc-300 mt-0.5">
                      ${(Number(currentPrice) * 3 * qDiscount).toFixed(0)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <span className="text-zinc-600">年付</span>
                    <p className="font-mono text-zinc-300 mt-0.5">
                      ${(Number(currentPrice) * 12 * yDiscount).toFixed(0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Credit Packs Tab ──────────────────────────────────────────

function PacksTab() {
  const queryClient = useQueryClient();
  const { data: packs, isLoading } = useQuery({
    queryKey: ["admin-packs"],
    queryFn: fetchPacks,
  });

  const [editValues, setEditValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const handleSave = useCallback(
    async (pack: CreditPack) => {
      setSaving(pack.plan);
      try {
        const edits = editValues[pack.plan] || {};
        const body: Record<string, unknown> = {};
        if (edits.price) body.price = parseFloat(edits.price);
        if (edits.credits) body.credits = parseInt(edits.credits);
        if (edits.mode) body.mode = edits.mode;
        if (edits.description) body.description = edits.description;

        await authFetch(`${API}/api/admin/membership/packs/${pack.plan}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        queryClient.invalidateQueries({ queryKey: ["admin-packs"] });
        setSaved(pack.plan);
        setTimeout(() => setSaved(null), 2000);
        setEditValues((prev) => {
          const next = { ...prev };
          delete next[pack.plan];
          return next;
        });
      } finally {
        setSaving(null);
      }
    },
    [editValues, queryClient]
  );

  const updatePackField = (plan: number, field: string, value: string) => {
    setEditValues((prev) => ({
      ...prev,
      [plan]: { ...(prev[plan] || {}), [field]: value },
    }));
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        管理积分充值包参数 — 价格、次数、适用模式均可灵活调整
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {packs?.map((pack) => {
          const edits = editValues[pack.plan] || {};
          const currentMode = edits.mode || pack.mode;
          const modeColor = MODE_COLORS[currentMode] || MODE_COLORS["all"];

          return (
            <div
              key={pack.plan}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5 space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-emerald-400" />
                  <span className="text-sm font-semibold text-zinc-200">
                    {pack.label}
                  </span>
                </div>
                <button
                  onClick={() => handleSave(pack)}
                  disabled={saving === pack.plan}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    saved === pack.plan
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-white/[0.06] text-zinc-400 border border-white/[0.08] hover:bg-white/[0.1]"
                  }`}
                >
                  {saving === pack.plan ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : saved === pack.plan ? (
                    <Check size={10} />
                  ) : (
                    <Save size={10} />
                  )}
                  {saved === pack.plan ? "✓" : "保存"}
                </button>
              </div>

              {/* Price */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">
                  价格 (USD)
                </label>
                <input
                  type="number"
                  step="1"
                  value={edits.price ?? pack.price}
                  onChange={(e) => updatePackField(pack.plan, "price", e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/40"
                />
              </div>

              {/* Credits */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">
                  次数
                </label>
                <input
                  type="number"
                  step="1"
                  value={edits.credits ?? pack.credits}
                  onChange={(e) => updatePackField(pack.plan, "credits", e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/40"
                />
              </div>

              {/* Mode */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">
                  适用模式
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(MODE_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => updatePackField(pack.plan, "mode", key)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                        currentMode === key
                          ? modeColor
                          : "text-zinc-600 bg-transparent border-white/[0.06] hover:text-zinc-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">
                  描述
                </label>
                <input
                  type="text"
                  value={edits.description ?? pack.description}
                  onChange={(e) => updatePackField(pack.plan, "description", e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/40"
                />
              </div>

              {/* Preview */}
              <div className="rounded-lg border border-white/[0.04] bg-black/20 p-3 text-xs text-zinc-500">
                单价 ≈ ${((edits.price ? parseFloat(edits.price) : pack.price) / (edits.credits ? parseInt(edits.credits) : pack.credits)).toFixed(3)}/次
                <span className={`ml-2 inline-block rounded border px-1.5 py-0.5 text-[10px] ${modeColor}`}>
                  {MODE_LABELS[currentMode]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Quotas Tab ─────────────────────────────────────────────────

function QuotasTab() {
  const queryClient = useQueryClient();
  const { data: matrix, isLoading } = useQuery({
    queryKey: ["admin-quotas"],
    queryFn: fetchQuotas,
  });

  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      const updates: Record<string, number> = {};
      for (const [key, val] of Object.entries(editValues)) {
        if (val.trim() !== "") updates[key] = parseInt(val);
      }
      await authFetch(`${API}/api/admin/membership/quotas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      queryClient.invalidateQueries({ queryKey: ["admin-quotas"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditValues({});
    } finally {
      setSaving(false);
    }
  }, [editValues, queryClient]);

  if (isLoading) return <LoadingSpinner />;

  const modes = ["scalping", "intraday", "trend"];
  const levels = [0, 1, 2];

  const getValue = (key: string, fallback: number) => {
    if (editValues[key] !== undefined) return editValues[key];
    return String(fallback);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          每日分析次数配额矩阵 + 注册欢迎包配置
        </p>
        <button
          onClick={handleSaveAll}
          disabled={saving || Object.keys(editValues).length === 0}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
            saved
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 disabled:opacity-40"
          }`}
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : saved ? (
            <Check size={12} />
          ) : (
            <Save size={12} />
          )}
          {saved ? "已保存" : `保存 (${Object.keys(editValues).length})`}
        </button>
      </div>

      {/* Quota Matrix Table */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-200">每日分析次数</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="p-3 text-left text-xs font-medium text-zinc-400 w-28">模式</th>
                {levels.map((lvl) => (
                  <th key={lvl} className={`p-3 text-center text-xs font-medium ${LEVEL_COLORS[lvl]}`}>
                    {LEVEL_LABELS[lvl]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modes.map((mode) => (
                <tr key={mode} className="border-b border-white/[0.06]">
                  <td className="p-3 text-xs font-medium text-zinc-300">
                    {MODE_LABELS[mode]}
                  </td>
                  {levels.map((lvl) => {
                    const cell = matrix?.quotas.find(
                      (q) => q.level === lvl && q.mode === mode
                    );
                    if (!cell) {
                      return (
                        <td key={lvl} className="p-3 text-center">
                          <span className="text-xs text-zinc-600">—</span>
                        </td>
                      );
                    }
                    return (
                      <td key={lvl} className="p-3 text-center">
                        <input
                          type="number"
                          value={getValue(cell.config_key, cell.value)}
                          onChange={(e) =>
                            setEditValues((prev) => ({ ...prev, [cell.config_key]: e.target.value }))
                          }
                          className="w-20 text-center rounded-lg border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-sm text-zinc-200 outline-none focus:border-indigo-500/40"
                        />
                        <span className="text-[10px] text-zinc-600 ml-1">次/天</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Welcome Bonus */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Gift size={16} className="text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-200">注册欢迎包</h3>
          <span className="text-xs text-zinc-500">新用户注册时一次性赠送的分析次数</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {matrix?.welcome && (
            <>
              {(["scalping", "intraday", "trend"] as const).map((mode) => {
                const key = `welcome_bonus_${mode}`;
                return (
                  <div key={mode}>
                    <label className="text-xs text-zinc-500 mb-1 block">
                      {MODE_LABELS[mode]}
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={getValue(key, matrix.welcome[mode])}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/40"
                      />
                      <span className="text-xs text-zinc-600 shrink-0">次</span>
                    </div>
                  </div>
                );
              })}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">
                  免费体验 (日内)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={getValue("free_trial_intraday_count", matrix.welcome.free_trial_intraday)}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        free_trial_intraday_count: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/40"
                  />
                  <span className="text-xs text-zinc-600 shrink-0">次</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Loading Spinner ───────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 py-12 justify-center text-zinc-500 text-sm">
      <Loader2 size={16} className="animate-spin" />
      加载中...
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

const TABS = [
  { key: "plans", label: "订阅套餐", icon: CreditCard },
  { key: "packs", label: "积分包", icon: Package },
  { key: "quotas", label: "配额与权益", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminMembershipPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("plans");

  if (!user || user.role !== "admin") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-500">无权限访问</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 md:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <CreditCard size={20} className="text-indigo-400" />
          会员与商品管理
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          统一管理订阅套餐定价、积分充值包参数、分析配额与权益
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-white/[0.06]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${
                active
                  ? "text-indigo-400 border-indigo-500"
                  : "text-zinc-500 border-transparent hover:text-zinc-300"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === "plans" && <PlansTab />}
      {tab === "packs" && <PacksTab />}
      {tab === "quotas" && <QuotasTab />}
    </div>
  );
}
