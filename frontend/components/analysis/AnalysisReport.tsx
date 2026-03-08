"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Clock,
  Database,
  Eye,
  Info,
  Link,
  Minus,
  Newspaper,
  Shield,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

import type {
  AnalysisReport as AnalysisReportType,
  AnalysisStatus,
  DataQualitySnapshot,
  ReportSection,
  SectionStatus,
  SignalDirection,
} from "@/lib/api/analysis";

// ── Types ──────────────────────────────────────────────────

interface AnalysisReportProps {
  report: AnalysisReportType;
}

// ── Field label mapping ──────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  // ── 通用 ──
  signal: "信号方向",
  confidence: "置信度",
  reasoning: "分析逻辑",
  key_findings: "关键发现",
  raw_data: "详细数据",
  trend: "趋势",
  symbol: "交易对",
  direction: "方向",
  phase: "阶段",
  evidence: "证据",
  warning: "警告",
  description: "描述",
  title: "标题",
  // ── 支撑/阻力 ──
  support_levels: "支撑位",
  resistance_levels: "阻力位",
  // ── K线形态 ──
  patterns: "形态列表",
  pattern_name: "形态名",
  display_name: "名称",
  strength: "强度",
  candle_index: "K线索引",
  // ── FVG 区域 ──
  fvg_list: "FVG 列表",
  gap_high: "缺口上沿",
  gap_low: "缺口下沿",
  gap_size: "缺口大小",
  interval: "周期",
  mitigated: "已回补",
  mitigation_type: "回补类型",
  mitigation_time: "回补时间",
  distance_pct: "距离占比",
  filter_mode: "过滤模式",
  atr_fallback: "ATR回退",
  // ── 订单块 ──
  order_blocks: "订单块",
  ob_type: "订单块类型",
  trigger: "触发条件",
  ob_high: "上沿价格",
  ob_low: "下沿价格",
  phase_context: "阶段背景",
  phase_confidence: "阶段置信度",
  whale_confirmed: "巨鲸确认",
  // ── 操盘阶段 ──
  current_phase: "当前阶段",
  transition: "阶段转换",
  // ── 策略 ──
  strategy: "策略",
  entry_low: "入场低点",
  entry_high: "入场高点",
  stop_loss: "止损",
  targets: "目标位",
  valid_until: "有效期至",
  snapped_fields: "校准字段",
  is_fallback: "降级模式",
  validation_applied: "已校验",
  discarded_levels: "废弃价位",
  next_likely_move: "预期走势",
  risk_level: "风险等级",
  recommendations: "建议",
  key_risks: "关键风险",
  alerts_count: "预警数",
  alerts: "预警列表",
  published_stream_id: "Stream ID",
  // ── 合约数据 ──
  funding_rate: "资金费率",
  predicted_funding_rate: "预测资金费率",
  long_short_ratio: "多空比",
  top_long_short_ratio: "大户多空比",
  liquidation_1h_usd: "1小时爆仓(USD)",
  liquidation_1h_long_pct: "多头爆仓占比",
  long_short_account_ratio: "多空账户比",
  long_short_position_ratio: "多空持仓比",
  top_long_short_account_ratio: "大户多空账户比",
  top_long_short_position_ratio: "大户多空持仓比",
  // ── 试盘检测 ──
  is_trial: "试盘判定",
  probability: "概率",
  trial_type: "试盘类型",
  signals: "信号列表",
  signal_type: "信号类型",
  advice: "建议",
  cooldown_minutes: "冷却时间(分钟)",
  // ── 主力成本区 ──
  vpoc: "主力成本价(VPOC)",
  vah: "价值区上沿(VAH)",
  val: "价值区下沿(VAL)",
  hvn_levels: "高成交量节点",
  lvn_levels: "低成交量节点",
  total_volume: "总成交量",
  bin_count: "分箱数",
  price_range: "价格范围",
  short_term: "短期",
  long_term: "长期",
  // ── 宏观事件 ──
  category: "事件类别",
  impact_score: "影响评分",
  urgency: "紧急程度",
  events: "事件列表",
  total_impact: "总影响",
  net_direction: "总体方向",
  confidence_modifier: "置信度修正",
  // ── 消息验证 ──
  is_validated: "已验证",
  validation_type: "验证类型",
  // ── 对抗推演 ──
  dealer_intent: "庄家意图",
  predicted_moves: "预测操作",
  danger_zones: "危险区域",
  safe_zones: "安全区域",
  defense_plan: "防御计划",
  action: "操作",
  timeframe: "时间窗口",
  target_price: "目标价位",
  trap_type: "陷阱类型",
  // ── 合谋/舆情 ──
  manipulation_detected: "操纵检测",
  manipulation_type: "操纵类型",
  sentiment_summary: "情绪摘要",
  // ── 链上数据 ──
  exchange_netflow: "交易所净流入",
  whale_change_24h: "巨鲸24h变化",
  fear_greed_index: "恐慌贪婪指数",
  large_tx_count: "大额转账笔数",
  // ── CoinGlass ──
  oi_snapshots: "OI快照",
  cvd_snapshots: "CVD快照",
  netflow_snapshots: "净流入快照",
  large_orders: "大单挂单",
  funding_rate_history: "资金费率历史",
  option_max_pain: "期权Max Pain",
  option_info: "期权概览",
  liquidation: "爆仓数据",
  // ── 订单簿 ──
  manipulation_side: "操纵方向",
  depth_summary: "深度摘要",
  metrics: "指标数据",
  bid_depth_usd: "买盘深度(USD)",
  ask_depth_usd: "卖盘深度(USD)",
  imbalance_ratio: "失衡比",
  largest_order_pct: "最大单笔占比",
  spread_pct: "买卖价差",
  cancel_rate: "撤单率",
  bid_levels: "买盘档位数",
  ask_levels: "卖盘档位数",
  // ── 舆情子字段 ──
  overall_sentiment: "整体情绪",
  mention_volume_change: "提及量变化",
  kol_activity_level: "KOL活跃度",
  // ── 其他 ──
  max_pain_price: "最大痛点价",
  call_oi: "看涨OI",
  put_oi: "看跌OI",
  pc_ratio: "看跌/看涨比",
  timestamp: "时间戳",
  adversarial_analysis: "对抗分析",
};

const HIDDEN_FIELDS = new Set([
  "is_fallback",
  "validation_applied",
  "snapped_fields",
  "discarded_levels",
  "published_stream_id",
  "filter_mode",
  "atr_fallback",
]);

const COLLAPSED_FIELDS = new Set(["raw_data"]);

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

// ── Signal color helpers ─────────────────────────────────────

interface SignalStyle {
  text: string;
  bg: string;
  border: string;
  label: string;
  icon: string;
}

function getSignalStyle(signal: SignalDirection): SignalStyle {
  switch (signal) {
    case "bullish":
      return {
        text: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        label: "看涨",
        icon: "",
      };
    case "bearish":
      return {
        text: "text-red-400",
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        label: "看跌",
        icon: "",
      };
    case "neutral":
    default:
      return {
        text: "text-zinc-400",
        bg: "bg-zinc-500/10",
        border: "border-zinc-500/30",
        label: "中性",
        icon: "",
      };
  }
}

// ── Section status helpers ───────────────────────────────────

interface StatusStyle {
  text: string;
  bg: string;
  label: string;
}

function getSectionStatusStyle(status: SectionStatus): StatusStyle {
  switch (status) {
    case "completed":
      return { text: "text-emerald-400", bg: "bg-emerald-500/15", label: "完成" };
    case "failed":
      return { text: "text-red-400", bg: "bg-red-500/15", label: "失败" };
    case "timeout":
      return { text: "text-red-400", bg: "bg-red-500/15", label: "超时" };
    case "missing":
    default:
      return { text: "text-zinc-500", bg: "bg-zinc-500/15", label: "缺失" };
  }
}

function SectionStatusIcon({ status }: { status: SectionStatus }) {
  switch (status) {
    case "completed":
      return <Check className="h-3 w-3" />;
    case "failed":
      return <X className="h-3 w-3" />;
    case "timeout":
      return <Clock className="h-3 w-3" />;
    case "missing":
    default:
      return <Minus className="h-3 w-3" />;
  }
}

// ── Value helpers ────────────────────────────────────────────

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && (value.trim() === "" || value === "—" || value === "-")) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) return true;
  return false;
}

function isFallbackReasoning(text: string): boolean {
  return text.includes("模型降级:") || text.includes("模型异常:") || text.includes("is_fallback");
}

function formatPrice(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

const _TEXT_REPLACEMENTS: [RegExp, string][] = [
  [/\bbullish\b/gi, "看涨"],
  [/\bbearish\b/gi, "看跌"],
  [/\bneutral\b/gi, "中性"],
  [/\bsideways\b/gi, "横盘"],
  [/\blong\b/gi, "做多"],
  [/\bshort\b/gi, "做空"],
  [/\bsupport\b/gi, "支撑"],
  [/\bresistance\b/gi, "阻力"],
  [/\baccumulation\b/gi, "吸筹"],
  [/\bdistribution\b/gi, "派发"],
  [/\bmarkup\b/gi, "拉升"],
  [/\bmarkdown\b/gi, "下跌"],
  [/\bescape\b/gi, "出逃"],
  [/\bdemand\b/gi, "需求"],
  [/\bsupply\b/gi, "供给"],
  [/\bconfirmed\b/gi, "已确认"],
  [/\bunconfirmed\b/gi, "未确认"],
  [/\bcontradicted\b/gi, "矛盾"],
  [/\bno_data\b/gi, "无数据"],
  [/\bpositive\b/gi, "积极"],
  [/\bnegative\b/gi, "消极"],
  [/\bnormal\b/gi, "正常"],
  [/\belevated\b/gi, "偏高"],
  [/\bextreme\b/gi, "极端"],
  [/\bpartial\b/gi, "部分"],
  [/\bfull\b/gi, "完全"],
  [/\bhigh\b/gi, "高"],
  [/\bmedium\b/gi, "中"],
  [/\blow\b/gi, "低"],
];

function localizeText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of _TEXT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return formatPrice(value);
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return localizeText(value);
  return JSON.stringify(value);
}

function formatDirection(dir: string): string {
  if (dir === "bullish") return "看涨";
  if (dir === "bearish") return "看跌";
  if (dir === "neutral") return "中性";
  if (dir === "sideways") return "横盘";
  if (dir === "long") return "做多";
  if (dir === "short") return "做空";
  return dir;
}

// ── Direction badge ──────────────────────────────────────────

function DirectionBadge({ direction }: { direction: string }) {
  const style =
    direction === "bullish" || direction === "long"
      ? "bg-emerald-500/15 text-emerald-400"
      : direction === "bearish" || direction === "short"
        ? "bg-red-500/15 text-red-400"
        : "bg-zinc-500/15 text-zinc-400";
  const label = direction === "bullish" || direction === "long" ? "多" : direction === "bearish" || direction === "short" ? "空" : formatDirection(direction);
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${style}`}>
      {label}
    </span>
  );
}

// ── Signal row (signal + confidence + trend in one row) ──────

function SignalRow({ data }: { data: Record<string, unknown> }) {
  const signal = String(data.signal || "");
  const confidence = typeof data.confidence === "number" ? data.confidence : null;
  const trend = String(data.trend || "");

  if (!signal && confidence === null && !trend) return null;

  const signalStyle = getSignalStyle(signal as SignalDirection);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {signal && (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold ${signalStyle.bg} ${signalStyle.text} border ${signalStyle.border}`}>
          {signal === "bullish" ? <TrendingUp className="h-3 w-3" /> : signal === "bearish" ? <TrendingDown className="h-3 w-3" /> : null}
          {formatDirection(signal)}
        </span>
      )}
      {confidence !== null && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-sm font-mono text-zinc-300">
          置信度 <span className="font-bold">{(confidence * 100).toFixed(0)}%</span>
        </span>
      )}
      {trend && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-sm text-zinc-400">
          趋势: {formatDirection(trend)}
        </span>
      )}
    </div>
  );
}

// ── Price level badges ───────────────────────────────────────

function PriceLevels({ levels, type }: { levels: number[]; type: "support" | "resistance" }) {
  if (levels.length === 0) return <span className="text-sm text-zinc-500">—</span>;
  const color = type === "support" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10";
  const icon = type === "support" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />;
  return (
    <div className="flex flex-wrap gap-1.5">
      {levels.map((p, i) => (
        <span key={i} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono font-medium ${color}`}>
          {icon}
          {formatPrice(p)}
        </span>
      ))}
    </div>
  );
}

// ── Reasoning block ──────────────────────────────────────────

function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  const displayed = isLong && !expanded ? text.slice(0, 200) + "…" : text;

  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
      <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">{displayed}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-accent hover:underline"
        >
          {expanded ? "收起" : "展开全文"}
        </button>
      )}
    </div>
  );
}

// ── Object array table ───────────────────────────────────────

const _INITIAL_SHOW = 5;

function ObjectArrayTable({ items }: { items: Record<string, unknown>[] }) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return <span className="text-sm text-zinc-500">未检测到</span>;

  // Detect pattern-like objects for compact rendering
  const isPattern = items[0] && "pattern_name" in items[0];

  if (isPattern) {
    const seen = new Map<string, Record<string, unknown>>();
    for (const p of items) {
      const k = `${p.pattern_name}_${p.direction}`;
      const existing = seen.get(k);
      if (!existing || (typeof p.strength === "number" && p.strength > (existing.strength as number))) {
        seen.set(k, p);
      }
    }
    const unique = Array.from(seen.values()).sort(
      (a, b) => ((b.strength as number) || 0) - ((a.strength as number) || 0),
    );
    const show = showAll ? unique : unique.slice(0, _INITIAL_SHOW);

    return (
      <div className="space-y-1">
        {show.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <DirectionBadge direction={String(p.direction || "")} />
            <span className="text-zinc-300 truncate">
              {String(p.display_name || p.pattern_name || "?")}
            </span>
            {typeof p.strength === "number" && (
              <span className="ml-auto shrink-0 font-mono text-zinc-500">
                {(p.strength * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
        {unique.length > _INITIAL_SHOW && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-accent hover:underline"
          >
            {showAll ? "收起" : `展开全部 (${unique.length})`}
          </button>
        )}
      </div>
    );
  }

  // Generic object array
  const displayed = showAll ? items : items.slice(0, _INITIAL_SHOW);
  return (
    <div className="space-y-2">
      {displayed.map((item, i) => (
        <div key={i} className="ml-2 border-l border-white/[0.06] pl-2">
          <DataPairs data={item} />
        </div>
      ))}
      {items.length > _INITIAL_SHOW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {showAll ? "收起" : `展开全部 (${items.length})`}
        </button>
      )}
    </div>
  );
}

// ── Collapsible sub-section ──────────────────────────────────

function CollapsibleSection({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
      >
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-3 w-3" />
        </motion.div>
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-2 mt-1 border-l border-white/[0.06] pl-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Data pairs renderer ──────────────────────────────────────

function DataPairs({ data, hideEmpty = true }: { data: Record<string, unknown>; hideEmpty?: boolean }) {
  const entries = Object.entries(data).filter(([key]) => !HIDDEN_FIELDS.has(key));

  // Filter out fallback reasoning from display
  const filtered = entries.filter(([key, value]) => {
    if (key === "reasoning" && typeof value === "string" && isFallbackReasoning(value)) return false;
    if (hideEmpty && isEmpty(value)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return <p className="text-xs text-zinc-500">暂无数据</p>;
  }

  // Extract special fields for custom rendering
  const hasSignalRow = "signal" in data || "confidence" in data || "trend" in data;
  const signalKeys = new Set(["signal", "confidence", "trend"]);
  const hasSupportLevels = Array.isArray(data.support_levels) && data.support_levels.length > 0;
  const hasResistanceLevels = Array.isArray(data.resistance_levels) && data.resistance_levels.length > 0;
  const priceLevelKeys = new Set(["support_levels", "resistance_levels"]);

  return (
    <div className="space-y-2">
      {/* Signal badge row */}
      {hasSignalRow && <SignalRow data={data} />}

      {/* Price levels */}
      {hasSupportLevels && (
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-500">{fieldLabel("support_levels")}</p>
          <PriceLevels levels={data.support_levels as number[]} type="support" />
        </div>
      )}
      {hasResistanceLevels && (
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-500">{fieldLabel("resistance_levels")}</p>
          <PriceLevels levels={data.resistance_levels as number[]} type="resistance" />
        </div>
      )}

      {/* Remaining fields */}
      {filtered
        .filter(([key]) => !signalKeys.has(key) && !priceLevelKeys.has(key))
        .map(([key, value]) => {
          if (isEmpty(value)) return null;

          // Reasoning → multi-line block
          if (key === "reasoning" && typeof value === "string" && value.length > 0) {
            return (
              <div key={key}>
                <p className="mb-1 text-sm font-medium text-zinc-500">{fieldLabel(key)}</p>
                <ReasoningBlock text={value} />
              </div>
            );
          }

          // key_findings → reasoning-like block
          if (key === "key_findings" && typeof value === "string" && value.length > 0) {
            return (
              <div key={key}>
                <p className="mb-1 text-sm font-medium text-zinc-500">{fieldLabel(key)}</p>
                <ReasoningBlock text={value} />
              </div>
            );
          }

          // Nested objects → collapsible if in COLLAPSED_FIELDS, otherwise inline
          if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            const isCollapsed = COLLAPSED_FIELDS.has(key);
            if (isCollapsed) {
              return (
                <CollapsibleSection key={key} label={fieldLabel(key)}>
                  <DataPairs data={value as Record<string, unknown>} />
                </CollapsibleSection>
              );
            }
            return (
              <div key={key} className="mt-2">
                <p className="mb-1 text-sm font-medium text-zinc-400">{fieldLabel(key)}</p>
                <div className="ml-2 border-l border-white/[0.06] pl-2">
                  <DataPairs data={value as Record<string, unknown>} />
                </div>
              </div>
            );
          }

          // Arrays of objects → table / compact view
          if (Array.isArray(value)) {
            const hasObjects = value.length > 0 && typeof value[0] === "object" && value[0] !== null;
            if (hasObjects) {
              return (
                <div key={key} className="mt-2">
                  <p className="mb-1 text-sm font-medium text-zinc-400">
                    {fieldLabel(key)} <span className="text-zinc-500">({value.length})</span>
                  </p>
                  <ObjectArrayTable items={value as Record<string, unknown>[]} />
                </div>
              );
            }
            // Primitive arrays
            if (value.length === 0) {
              return null; // already handled by isEmpty check above
            }
            return (
              <div key={key} className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-sm text-zinc-500">{fieldLabel(key)}</span>
                <span className="text-right text-sm font-mono text-zinc-300">
                  {value.map(formatValue).join(", ")}
                </span>
              </div>
            );
          }

          // Direction fields → badge
          if ((key === "direction" || key === "signal") && typeof value === "string") {
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-sm text-zinc-500">{fieldLabel(key)}</span>
                <DirectionBadge direction={value} />
              </div>
            );
          }

          return (
            <div key={key} className="flex items-start justify-between gap-2">
              <span className="shrink-0 text-sm text-zinc-500">{fieldLabel(key)}</span>
              <span className="text-right text-sm font-mono text-zinc-300">
                {formatValue(value)}
              </span>
            </div>
          );
        })
        .filter(Boolean)}
    </div>
  );
}

// ── Section icon mapping ─────────────────────────────────────

const SECTION_ICONS: Record<string, { icon: typeof Activity; color: string }> = {
  // ── Agent sections (intraday titles) ──
  "技术分析": { icon: BarChart3, color: "text-indigo-400" },
  "链上数据": { icon: Link, color: "text-purple-400" },
  "订单流": { icon: Activity, color: "text-cyan-400" },
  "风险评估": { icon: Shield, color: "text-orange-400" },
  "新闻分析": { icon: Newspaper, color: "text-sky-400" },
  "日历事件": { icon: Clock, color: "text-teal-400" },
  // ── Agent sections (trend titles) ──
  "链上深度解读": { icon: Link, color: "text-purple-400" },
  "订单簿微观结构": { icon: Activity, color: "text-cyan-400" },
  "舆情分析": { icon: Eye, color: "text-amber-400" },
  "剧本推演": { icon: BookOpen, color: "text-violet-400" },
  "对抗推演": { icon: Swords, color: "text-orange-400" },
  "合谋检测": { icon: Brain, color: "text-pink-400" },
  // ── Scalping sections ──
  "技术指标摘要": { icon: BarChart3, color: "text-indigo-400" },
  "K线形态信号": { icon: BarChart3, color: "text-indigo-300" },
  // ── Structure sections ──
  "合约数据": { icon: Database, color: "text-blue-400" },
  "操盘阶段": { icon: Target, color: "text-amber-400" },
  "K线形态": { icon: BarChart3, color: "text-indigo-300" },
  "FVG区域": { icon: Zap, color: "text-yellow-400" },
  "订单块": { icon: Target, color: "text-violet-400" },
  "策略建议": { icon: Target, color: "text-emerald-400" },
  "SMC检测": { icon: Zap, color: "text-yellow-400" },
  // ── New detection sections ──
  "资金费率预警": { icon: AlertTriangle, color: "text-red-400" },
  "试盘检测": { icon: AlertTriangle, color: "text-yellow-400" },
  "主力成本区": { icon: BarChart3, color: "text-blue-300" },
  "消息验证": { icon: ArrowRightLeft, color: "text-sky-300" },
  "宏观事件": { icon: TrendingUp, color: "text-emerald-300" },
  "共识报告": { icon: Brain, color: "text-indigo-300" },
  // ── Legacy (backward compat) ──
  "技术面分析": { icon: BarChart3, color: "text-indigo-400" },
  "链上数据分析": { icon: Link, color: "text-purple-400" },
  "订单簿分析": { icon: Activity, color: "text-cyan-400" },
  "市场情绪分析": { icon: Eye, color: "text-amber-400" },
  "剧本匹配": { icon: BookOpen, color: "text-violet-400" },
  "AI操盘检测": { icon: Bot, color: "text-rose-400" },
};

function getSectionIcon(title: string) {
  return SECTION_ICONS[title] || { icon: Activity, color: "text-zinc-400" };
}

// ── Section grouping ─────────────────────────────────────────

const SECTION_GROUPS: { label: string; titles: Set<string> }[] = [
  {
    label: "核心分析",
    titles: new Set([
      "技术分析", "技术指标摘要", "链上数据", "链上深度解读", "订单流", "订单簿微观结构",
      "风险评估", "新闻分析", "日历事件", "舆情分析", "剧本推演",
      "消息验证", "宏观事件", "共识报告",
      "技术面分析", "链上数据分析", "订单簿分析", "市场情绪分析", "剧本匹配",
    ]),
  },
  {
    label: "市场结构",
    titles: new Set(["合约数据", "操盘阶段", "K线形态", "K线形态信号", "FVG区域", "订单块", "SMC检测", "资金费率预警", "试盘检测", "主力成本区"]),
  },
  {
    label: "AI 对抗",
    titles: new Set(["AI操盘检测", "对抗推演", "合谋检测"]),
  },
];

function groupSections(sections: ReportSection[]) {
  const groups: { label: string; sections: ReportSection[] }[] = SECTION_GROUPS.map(g => ({
    label: g.label,
    sections: [],
  }));
  const ungrouped: ReportSection[] = [];

  for (const s of sections) {
    if (s.title === "策略建议") continue;
    let placed = false;
    for (let i = 0; i < SECTION_GROUPS.length; i++) {
      if (SECTION_GROUPS[i].titles.has(s.title)) {
        groups[i].sections.push(s);
        placed = true;
        break;
      }
    }
    if (!placed) ungrouped.push(s);
  }

  return { groups: groups.filter(g => g.sections.length > 0), ungrouped };
}

// ── Agent voting board ───────────────────────────────────────

function AgentVotingBoard({ sections }: { sections: ReportSection[] }) {
  const agentSections = sections.filter(
    (s) => s.data?.signal && s.status === "completed"
  );
  if (agentSections.length === 0) return null;

  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  agentSections.forEach((s) => {
    const sig = String(s.data.signal);
    if (sig in counts) counts[sig as keyof typeof counts]++;
  });

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        智能体信号
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {agentSections.map((s, i) => {
          const sig = String(s.data.signal);
          const conf = typeof s.data.confidence === "number" ? s.data.confidence : 0;
          const borderColor =
            sig === "bullish"
              ? "border-emerald-500/25"
              : sig === "bearish"
                ? "border-red-500/25"
                : "border-white/[0.06]";
          const sIcon = getSectionIcon(s.title);
          const SIcon = sIcon.icon;
          return (
            <div
              key={i}
              className={`rounded-lg border ${borderColor} bg-white/[0.02] p-2.5 text-center transition-colors hover:bg-white/[0.04]`}
            >
              <SIcon className={`h-3.5 w-3.5 mx-auto mb-1.5 ${sIcon.color}`} />
              <p className="text-[11px] font-medium text-zinc-400 truncate leading-tight">
                {s.title}
              </p>
              <p
                className={`text-xs font-bold mt-1 ${
                  sig === "bullish"
                    ? "text-emerald-400"
                    : sig === "bearish"
                      ? "text-red-400"
                      : "text-zinc-500"
                }`}
              >
                {sig === "bullish" ? "看涨" : sig === "bearish" ? "看空" : "中性"}
              </p>
              <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                {(conf * 100).toFixed(0)}%
              </p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.06]">
        {counts.bullish > 0 && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-emerald-400 font-medium">
              {counts.bullish} 看涨
            </span>
          </span>
        )}
        {counts.bearish > 0 && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="text-red-400 font-medium">
              {counts.bearish} 看空
            </span>
          </span>
        )}
        {counts.neutral > 0 && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-zinc-500" />
            <span className="text-zinc-500 font-medium">
              {counts.neutral} 中性
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Key findings summary ─────────────────────────────────────

function KeyFindingsSummary({ sections }: { sections: ReportSection[] }) {
  const allFindings: { text: string; signal: string }[] = [];

  sections.forEach((s) => {
    if (s.status !== "completed" || !s.data) return;
    const kf = s.data.key_findings;
    const sig = String(s.data.signal || "neutral");
    if (Array.isArray(kf)) {
      kf.slice(0, 3).forEach((item) => {
        const text = typeof item === "string" ? item : JSON.stringify(item);
        if (text && text.length > 2) allFindings.push({ text, signal: sig });
      });
    }
  });

  if (allFindings.length === 0) return null;

  const display = allFindings.slice(0, 10);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        关键发现
      </p>
      <ul className="space-y-2">
        {display.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                f.signal === "bullish"
                  ? "bg-emerald-400"
                  : f.signal === "bearish"
                    ? "bg-red-400"
                    : "bg-zinc-500"
              }`}
            />
            <span className="text-sm text-zinc-300 leading-relaxed">
              {f.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Collapsible section card ─────────────────────────────────

function SectionCard({ section, defaultExpanded = false }: { section: ReportSection; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const statusStyle = getSectionStatusStyle(section.status);
  const sectionIcon = getSectionIcon(section.title);
  const SectionIconComp = sectionIcon.icon;

  // Extract signal from section data for quick summary in header
  const sectionSignal = section.data?.signal as string | undefined;
  const sectionConf = section.data?.confidence as number | undefined;
  const signalColor = sectionSignal === "bullish" ? "text-emerald-400" : sectionSignal === "bearish" ? "text-red-400" : "";

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-elevated/60">
      {/* Header — clickable */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <SectionIconComp className={`h-3.5 w-3.5 shrink-0 ${sectionIcon.color}`} />
          <span className="truncate text-sm font-medium text-zinc-200">
            {section.title}
          </span>
          {/* Inline signal summary */}
          {sectionSignal && sectionSignal !== "neutral" && (
            <span className={`text-xs font-semibold ${signalColor}`}>
              {formatDirection(sectionSignal)}
            </span>
          )}
          {typeof sectionConf === "number" && sectionConf > 0 && (
            <span className="text-xs font-mono text-zinc-500">
              {(sectionConf * 100).toFixed(0)}%
            </span>
          )}
          {section.summary && !sectionSignal && (
            <span className="text-xs text-zinc-400 truncate max-w-[260px]">
              {section.summary}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </motion.div>
        </div>
      </button>

      {/* Body — collapsible */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-3 py-3 space-y-3">
              {/* Agent sections: structured display */}
              {sectionSignal ? (
                <>
                  {/* Key findings — prominent bullet list */}
                  {Array.isArray(section.data.key_findings) &&
                    section.data.key_findings.length > 0 && (
                      <ul className="space-y-1.5">
                        {(section.data.key_findings as string[]).map(
                          (f, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2.5 text-sm text-zinc-300 leading-relaxed"
                            >
                              <span
                                className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                                  sectionSignal === "bullish"
                                    ? "bg-emerald-400"
                                    : sectionSignal === "bearish"
                                      ? "bg-red-400"
                                      : "bg-zinc-500"
                                }`}
                              />
                              {String(f)}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  {/* Reasoning — expandable */}
                  {typeof section.data.reasoning === "string" &&
                    section.data.reasoning.length > 0 &&
                    !isFallbackReasoning(section.data.reasoning as string) && (
                      <ReasoningBlock text={section.data.reasoning as string} />
                    )}
                  {/* Raw data — collapsed */}
                  {section.data.raw_data &&
                    typeof section.data.raw_data === "object" &&
                    Object.keys(
                      section.data.raw_data as Record<string, unknown>,
                    ).length > 0 && (
                      <CollapsibleSection label="详细数据">
                        <DataPairs
                          data={
                            section.data.raw_data as Record<string, unknown>
                          }
                        />
                      </CollapsibleSection>
                    )}
                </>
              ) : (
                /* Non-agent sections: generic data pairs */
                <DataPairs data={section.data} />
              )}
              {section.note && (
                <p className="mt-2 text-xs italic text-zinc-500">
                  {section.note}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Strategy range bar ───────────────────────────────────────

function StrategyRangeBar({
  stopLoss, entryLow, entryHigh, targets, direction,
}: {
  stopLoss: number; entryLow: number; entryHigh: number; targets: number[]; direction: string;
}) {
  const allPrices = [stopLoss, entryLow, entryHigh, ...targets].filter((p) => p > 0);
  if (allPrices.length < 2) return null;
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min;
  if (range <= 0) return null;
  const pct = (v: number) => ((v - min) / range) * 100;

  const isLong = direction === "long" || direction === "bullish";

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">价位分布</p>
      <div className="relative h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        {/* Entry range highlight */}
        <div
          className={`absolute top-0 h-full ${isLong ? "bg-emerald-500/10" : "bg-red-500/10"}`}
          style={{ left: `${pct(entryLow)}%`, width: `${pct(entryHigh) - pct(entryLow)}%` }}
        />
        {/* Stop loss marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-red-500/70"
          style={{ left: `${pct(stopLoss)}%` }}
        >
          <span className="absolute -top-0.5 left-1 text-[8px] font-mono text-red-400 whitespace-nowrap">SL</span>
        </div>
        {/* Entry markers */}
        <div
          className="absolute top-0 h-full w-0.5 bg-blue-400/60"
          style={{ left: `${pct(entryLow)}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-blue-400/60"
          style={{ left: `${pct(entryHigh)}%` }}
        />
        {/* Target markers */}
        {targets.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-0.5 bg-emerald-400/60"
            style={{ left: `${pct(t)}%` }}
          >
            <span className="absolute bottom-0.5 left-1 text-[8px] font-mono text-emerald-400 whitespace-nowrap">
              T{i + 1}
            </span>
          </div>
        ))}
      </div>
      {/* Price labels */}
      <div className="flex justify-between text-xs font-mono text-zinc-600">
        <span>{formatPrice(min)}</span>
        <span>{formatPrice(max)}</span>
      </div>
    </div>
  );
}

// ── Confidence ring (SVG arc) ───────────────────────────────

function ConfidenceRing({ value, color }: { value: number; color: string }) {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value);
  const strokeColor = color === "emerald" ? "#34d399" : color === "red" ? "#f87171" : "#a1a1aa";

  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle
          cx="24" cy="24" r={r} fill="none"
          stroke={strokeColor} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold font-mono text-zinc-200">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ── Strategy card ────────────────────────────────────────────

function StrategyCard({ strategy }: { strategy: Record<string, unknown> }) {
  const dir = String(strategy.direction || "neutral");
  const isFallback = strategy.is_fallback === true;
  const reasoning = String(strategy.reasoning || "");
  const isLlmDegraded = !isFallback && isFallbackReasoning(reasoning);
  const dirStyle = dir === "bullish" || dir === "long" ? "border-emerald-500/20 bg-emerald-500/[0.05]" : dir === "bearish" || dir === "short" ? "border-red-500/20 bg-red-500/[0.05]" : "border-zinc-500/20 bg-zinc-500/[0.05]";
  const dirText = dir === "bullish" || dir === "long" ? "text-emerald-400" : dir === "bearish" || dir === "short" ? "text-red-400" : "text-zinc-400";
  const dirColor = dir === "bullish" || dir === "long" ? "emerald" : dir === "bearish" || dir === "short" ? "red" : "zinc";
  const DirIcon = dir === "bullish" || dir === "long" ? TrendingUp : dir === "bearish" || dir === "short" ? TrendingDown : Target;

  const entryLow = strategy.entry_low as number | null | undefined;
  const entryHigh = strategy.entry_high as number | null | undefined;
  const stopLoss = strategy.stop_loss as number | null | undefined;
  const targets = Array.isArray(strategy.targets) ? strategy.targets as number[] : [];
  const confidence = typeof strategy.confidence === "number" ? strategy.confidence : null;
  const symbol = String(strategy.symbol || "");
  const validUntil = strategy.valid_until ? String(strategy.valid_until) : null;

  if (isLlmDegraded) {
    return (
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <span className="text-xs font-medium text-yellow-400">策略生成异常</span>
        </div>
        <p className="mt-1.5 text-sm text-zinc-400">智能体返回了降级响应，策略数据不可用。请重试分析。</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${dirStyle}`}>
      {/* Header with confidence ring */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <DirIcon className={`h-5 w-5 ${dirText}`} />
          <div>
            <span className={`text-sm font-bold ${dirText}`}>
              策略建议 · {formatDirection(dir)}
              {isFallback && <span className="ml-2 text-xs font-normal text-amber-400/70">(基于价格估算)</span>}
            </span>
            {symbol && <p className="text-xs text-zinc-500">{symbol}</p>}
          </div>
        </div>
        {confidence !== null && confidence > 0 && (
          <ConfidenceRing value={confidence} color={dirColor} />
        )}
      </div>

      <div className={`border-t ${dir === "bullish" || dir === "long" ? "border-emerald-500/10" : dir === "bearish" || dir === "short" ? "border-red-500/10" : "border-zinc-500/10"} px-4 py-3`}>
        {/* Price grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* 入场区间 */}
          {(entryLow || entryHigh) && (
            <div className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-xs text-zinc-500 mb-1">入场区间</p>
              <p className="text-xs font-mono font-semibold text-zinc-200">
                {entryLow ? formatPrice(entryLow) : "\u2014"}
              </p>
              <p className="text-xs font-mono font-semibold text-zinc-200">
                ~ {entryHigh ? formatPrice(entryHigh) : "\u2014"}
              </p>
            </div>
          )}
          {/* 止损 */}
          {stopLoss && (
            <div className="rounded-lg bg-red-500/[0.04] px-3 py-2">
              <p className="text-xs text-red-400/70 mb-1">止损</p>
              <p className="text-xs font-mono font-semibold text-red-400">{formatPrice(stopLoss)}</p>
            </div>
          )}
          {/* 盈亏比 */}
          {stopLoss && entryHigh && targets.length > 0 && (
            <div className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-xs text-zinc-500 mb-1">盈亏比</p>
              <p className="text-xs font-mono font-semibold text-zinc-200">
                {(() => {
                  const risk = Math.abs(entryHigh - stopLoss);
                  const reward = Math.abs(targets[targets.length - 1] - entryHigh);
                  return risk > 0 ? `1 : ${(reward / risk).toFixed(1)}` : "—";
                })()}
              </p>
            </div>
          )}
        </div>

        {/* 目标位 */}
        {targets.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-zinc-500 mb-1.5">目标位</p>
            <div className="flex gap-2 flex-wrap">
              {targets.map((t, i) => (
                <span key={i} className="text-xs font-mono text-emerald-400 bg-emerald-500/10 rounded-md px-2 py-1 border border-emerald-500/10">
                  T{i + 1}: {formatPrice(t)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Visual range bar */}
        {stopLoss && entryLow && entryHigh && (
          <StrategyRangeBar
            stopLoss={stopLoss}
            entryLow={entryLow}
            entryHigh={entryHigh}
            targets={targets}
            direction={dir}
          />
        )}

        {/* 有效期 */}
        {validUntil && (
          <p className="mt-3 text-xs text-zinc-500">
            有效至 {new Date(validUntil).toLocaleString("zh-CN")}
          </p>
        )}
        {/* 分析逻辑 */}
        {reasoning && !isFallbackReasoning(reasoning) && (
          <div className="mt-3">
            <ReasoningBlock text={reasoning} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Blocked reason labels ─────────────────────────────────────

const BLOCKED_REASON_LABELS: Record<string, string> = {
  data_incomplete: "数据不完整",
  capability_missing: "关键能力不可用",
  consensus_divergence_high: "共识分歧过大",
  weekly_bias_conflict: "周线偏差冲突",
  defense_risk_high: "防御风险过高",
  risk_guardrail_triggered: "风控护栏触发",
  timeout: "分析超时",
};

function blockedReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return BLOCKED_REASON_LABELS[code] || code;
}

// ── Analysis status banner ───────────────────────────────────

function AnalysisStatusBanner({ report }: { report: AnalysisReportType }) {
  const status = report.status || "actionable";
  const dqs = report.data_quality_snapshot;

  if (status === "actionable" && !dqs) return null;

  const statusConfig: Record<
    string,
    { border: string; bg: string; text: string; label: string; icon: typeof Check }
  > = {
    actionable: {
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/[0.04]",
      text: "text-emerald-400",
      label: "可执行",
      icon: Check,
    },
    degraded: {
      border: "border-amber-500/20",
      bg: "bg-amber-500/[0.04]",
      text: "text-amber-400",
      label: "降级",
      icon: AlertTriangle,
    },
    blocked: {
      border: "border-red-500/20",
      bg: "bg-red-500/[0.04]",
      text: "text-red-400",
      label: "阻断",
      icon: X,
    },
  };

  const cfg = statusConfig[status] || statusConfig.actionable;
  const StatusIcon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} px-4 py-3 space-y-2`}>
      {/* Status row */}
      <div className="flex items-center gap-2">
        <StatusIcon className={`h-4 w-4 ${cfg.text}`} />
        <span className={`text-sm font-semibold ${cfg.text}`}>
          {cfg.label}
        </span>
        {report.blocked_reason && (
          <span className="text-sm text-zinc-400">
            — {blockedReasonLabel(report.blocked_reason)}
          </span>
        )}
      </div>

      {/* Data quality snapshot */}
      {dqs && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          <span>
            周期完整度{" "}
            <span className={`font-mono font-medium ${
              dqs.interval_completeness >= 0.8
                ? "text-emerald-400"
                : dqs.interval_completeness >= 0.5
                  ? "text-amber-400"
                  : "text-red-400"
            }`}>
              {(dqs.interval_completeness * 100).toFixed(0)}%
            </span>
          </span>
          <span>
            新鲜度{" "}
            <span className={`font-mono font-medium ${
              dqs.freshness >= 0.8
                ? "text-emerald-400"
                : dqs.freshness >= 0.5
                  ? "text-amber-400"
                  : "text-red-400"
            }`}>
              {(dqs.freshness * 100).toFixed(0)}%
            </span>
          </span>
          {dqs.missing_inputs.length > 0 && (
            <span>
              缺失{" "}
              <span className="font-medium text-amber-400">
                {dqs.missing_inputs.join(", ")}
              </span>
            </span>
          )}
          {Object.keys(dqs.capability_state).length > 0 && (
            <span>
              能力{" "}
              <span className="font-medium text-zinc-300">
                {Object.entries(dqs.capability_state)
                  .filter(([, v]) => v !== "AVAILABLE")
                  .map(([k, v]) => `${k}:${v}`)
                  .join(", ") || "全部可用"}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mode label ───────────────────────────────────────────────

function modeLabel(mode: string): string {
  if (mode === "scalping") return "实时短线";
  if (mode === "intraday") return "日内博弈";
  if (mode === "trend") return "趋势布局";
  return mode;
}

// ── Time formatter ───────────────────────────────────────────

function formatCachedTime(cachedAt: string): string {
  const diff = Date.now() - new Date(cachedAt).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时前`;
}

// ── Tab configuration ────────────────────────────────────────

const REPORT_TABS = [
  { key: "overview" as const, label: "概览", icon: Eye },
  { key: "agents" as const, label: "智能体", icon: Brain },
  { key: "structure" as const, label: "市场结构", icon: BarChart3 },
  { key: "adversarial" as const, label: "AI 对抗", icon: Swords },
];

type ReportTabKey = "overview" | "agents" | "structure" | "adversarial";

const TAB_GROUP_MAP: Record<string, ReportTabKey> = {
  "核心分析": "agents",
  "市场结构": "structure",
  "AI 对抗": "adversarial",
};

// ── Main component ───────────────────────────────────────────

export function AnalysisReport({ report }: AnalysisReportProps) {
  const [activeTab, setActiveTab] = useState<ReportTabKey>("overview");
  const signalStyle = getSignalStyle(report.signal);
  const { groups, ungrouped } = groupSections(report.sections);

  // Map groups to tab keys
  const tabGroups = new Map<ReportTabKey, { label: string; sections: ReportSection[] }[]>();
  for (const g of groups) {
    const tabKey = TAB_GROUP_MAP[g.label];
    if (tabKey) {
      const arr = tabGroups.get(tabKey) || [];
      arr.push(g);
      tabGroups.set(tabKey, arr);
    }
  }
  if (ungrouped.length > 0) {
    const arr = tabGroups.get("agents") || [];
    arr.push({ label: "其他", sections: ungrouped });
    tabGroups.set("agents", arr);
  }

  // Only show tabs that have content
  const visibleTabs = REPORT_TABS.filter((tab) => {
    if (tab.key === "overview") return true;
    return (tabGroups.get(tab.key)?.reduce((n, g) => n + g.sections.length, 0) ?? 0) > 0;
  });

  return (
    <div className="space-y-5">
      {/* ── Hero signal summary ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`rounded-2xl border p-5 relative overflow-hidden ${signalStyle.bg} ${signalStyle.border}`}
      >
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${signalStyle.bg} border ${signalStyle.border}`}>
              {report.signal === "bullish" ? (
                <TrendingUp className="h-6 w-6 text-emerald-400" />
              ) : report.signal === "bearish" ? (
                <TrendingDown className="h-6 w-6 text-red-400" />
              ) : (
                <Minus className="h-6 w-6 text-zinc-400" />
              )}
            </div>
            <div>
              <p className={`text-lg font-bold ${signalStyle.text}`}>
                {signalStyle.label}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-medium text-zinc-300">
                  {report.symbol}
                </span>
                <span className="text-zinc-600">·</span>
                <span className="text-sm text-zinc-500">
                  {modeLabel(report.mode)}
                </span>
                <span className="text-zinc-600">·</span>
                <span className="text-xs font-mono text-zinc-500">
                  {(report.execution_time_ms / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          </div>
          <ConfidenceRing
            value={report.confidence}
            color={
              report.signal === "bullish"
                ? "emerald"
                : report.signal === "bearish"
                  ? "red"
                  : "zinc"
            }
          />
        </div>

        {/* Market regime strip */}
        {report.market_regime && (
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-3 relative z-10">
            {report.market_regime === "ranging" ? (
              <ArrowRightLeft className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            ) : report.market_regime === "volatile" ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            )}
            <span
              className={`text-sm font-semibold ${
                report.market_regime === "ranging"
                  ? "text-amber-400"
                  : report.market_regime === "volatile"
                    ? "text-red-400"
                    : "text-emerald-400"
              }`}
            >
              {report.market_regime === "ranging"
                ? "震荡区间"
                : report.market_regime === "volatile"
                  ? "高波动"
                  : "趋势行情"}
            </span>
            {report.regime_support !== null &&
              report.regime_resistance !== null &&
              report.market_regime === "ranging" && (
                <span className="text-xs font-mono text-zinc-500">
                  {report.regime_support?.toLocaleString()} ~{" "}
                  {report.regime_resistance?.toLocaleString()}
                </span>
              )}
            {report.regime_suggestion && (
              <p
                className="text-xs text-zinc-500 ml-auto max-w-[240px] truncate"
                title={report.regime_suggestion}
              >
                {report.regime_suggestion}
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* ── Unified status banner (P2) ── */}
      {report.status && report.status !== "actionable" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <AnalysisStatusBanner report={report} />
        </motion.div>
      )}
      {report.status === "actionable" && report.data_quality_snapshot && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <AnalysisStatusBanner report={report} />
        </motion.div>
      )}

      {/* ── Status badges ── */}
      {(report.cached || report.is_partial || report.completeness_warning) && (
        <div className="flex items-center gap-2 flex-wrap">
          {report.cached && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
              <Database className="h-3 w-3" />
              缓存
              {report.cached_at && (
                <span className="text-blue-400/60">
                  · {formatCachedTime(report.cached_at)}
                </span>
              )}
            </span>
          )}
          {report.is_partial && (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-400">
              <AlertTriangle className="h-3 w-3" />
              部分报告
            </span>
          )}
          {report.completeness_warning && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              {report.completeness_warning}
            </span>
          )}
        </div>
      )}

      {/* ── Fallback warning ── */}
      {report.sections.some((s) => {
        const r = s.data?.reasoning;
        return typeof r === "string" && isFallbackReasoning(r);
      }) && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.04] px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          <p className="text-sm text-yellow-400">
            部分智能体返回了降级响应，分析结果可能不完整。请检查后台 AI
            密钥配置或重新分析。
          </p>
        </div>
      )}

      {/* ── Strategy card (always visible) ── */}
      {report.strategy && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <StrategyCard strategy={report.strategy} />
        </motion.div>
      )}

      {/* ── Tab navigation ── */}
      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const count = tab.key === "overview"
            ? null
            : tabGroups.get(tab.key)?.reduce((n, g) => n + g.sections.length, 0) ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {count !== null && count > 0 && (
                <span className="ml-1 text-xs text-zinc-600 font-mono">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AgentVotingBoard sections={report.sections} />
              <KeyFindingsSummary sections={report.sections} />
            </div>
          )}

          {activeTab !== "overview" && (
            <div className="space-y-2">
              {(tabGroups.get(activeTab) || []).map((group) => (
                <div key={group.label} className="space-y-2">
                  {(tabGroups.get(activeTab)?.length ?? 0) > 1 && (
                    <div className="flex items-center gap-2 pt-2">
                      <div className="h-px flex-1 bg-white/[0.06]" />
                      <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium shrink-0">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-white/[0.06]" />
                    </div>
                  )}
                  <div className="space-y-2">
                    {group.sections.map((section, idx) => (
                      <SectionCard key={`${section.title}-${idx}`} section={section} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Contract metadata + Timestamp footer ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center justify-center gap-3 pt-2 flex-wrap"
      >
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-zinc-600" />
          <p className="text-xs text-zinc-600">
            {new Date(report.timestamp).toLocaleString("zh-CN")}
          </p>
        </div>
        {(report.engine_type || report.mode_contract_version) && (
          <div className="flex items-center gap-1.5">
            <Info className="h-3 w-3 text-zinc-600" />
            <p className="text-xs font-mono text-zinc-600">
              {report.engine_type && <span>{report.engine_type}</span>}
              {report.engine_type && report.mode_contract_version && (
                <span className="text-zinc-700"> · </span>
              )}
              {report.mode_contract_version && (
                <span>v{report.mode_contract_version}</span>
              )}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
