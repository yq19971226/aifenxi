import type { LucideIcon } from "lucide-react";
import type { AnalysisMode, ReportSection, SignalDirection, SectionStatus } from "@/lib/api/analysis";
import type { StrategyData } from "@/lib/types/strategy";
import {
  FIELD_LABELS,
  SECTION_ICONS,
  SECTION_GROUPS,
  BLOCKED_REASON_LABELS,
} from "./constants";
import { Activity } from "lucide-react";

// ── Types ──────────────────────────────────────────────────

export interface SignalStyle {
  text: string;
  bg: string;
  border: string;
  label: string;
}

export interface StatusStyle {
  text: string;
  bg: string;
  label: string;
}

const CONSENSUS_AGENT_TITLES = new Set([
  "技术分析",
  "技术指标摘要",
  "链上数据",
  "链上深度解读",
  "订单流",
  "订单簿微观结构",
  "风险评估",
  "新闻分析",
  "日历事件",
  "舆情分析",
  "剧本推演",
  "技术面分析",
  "链上数据分析",
  "订单簿分析",
  "市场情绪分析",
  "剧本匹配",
]);

// ── Field label ────────────────────────────────────────────

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

export function isConsensusAgentSection(title: string): boolean {
  return CONSENSUS_AGENT_TITLES.has(title);
}

// ── Signal style ───────────────────────────────────────────

export function getSignalStyle(signal: SignalDirection): SignalStyle {
  switch (signal) {
    case "bullish":
      return {
        text: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        label: "看涨",
      };
    case "bearish":
      return {
        text: "text-red-400",
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        label: "看跌",
      };
    case "neutral":
    default:
      return {
        text: "text-zinc-400",
        bg: "bg-zinc-500/10",
        border: "border-zinc-500/30",
        label: "中性",
      };
  }
}

// ── Section status style ───────────────────────────────────

export function getSectionStatusStyle(status: SectionStatus): StatusStyle {
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

// ── Value helpers ──────────────────────────────────────────

export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && (value.trim() === "" || value === "—" || value === "-")) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) return true;
  return false;
}

export function isFallbackReasoning(text: string): boolean {
  return text.includes("模型降级:") || text.includes("模型异常:") || text.includes("is_fallback");
}

export function formatPrice(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

const _TEXT_REPLACEMENTS: [RegExp, string][] = [
  // ── 多词组合（必须在单词之前匹配） ──
  [/\bextreme fear\b/gi, "极度恐慌"], [/\bextreme greed\b/gi, "极度贪婪"],
  [/\bopen interest\b/gi, "未平仓合约"], [/\bfunding rate\b/gi, "资金费率"],
  [/\bnet flow\b/gi, "净流入"], [/\bnetflow\b/gi, "净流入"],
  [/\bwall\s*\(sell\)/gi, "卖墙"], [/\bwall\s*\(buy\)/gi, "买墙"],
  [/\bsell\s+wall\b/gi, "卖墙"], [/\bbuy\s+wall\b/gi, "买墙"],
  [/\bshort[- ]term\b/gi, "短期"], [/\blong[- ]term\b/gi, "长期"], [/\bmid[- ]term\b/gi, "中期"],
  [/\bmain_choch\b/gi, "主趋势转变"], [/\bmain_bos\b/gi, "主结构突破"],
  [/\bliquidity[_ ]grab\b/gi, "流动性猎取"], [/\bliquidity[_ ]sweep\b/gi, "流动性扫盘"],
  [/\bstop[_ ]hunt\b/gi, "猎杀止损"],
  // ── 新闻事件类别（下划线枚举值） ──
  [/\bwhale_movement\b/gi, "巨鲸动向"], [/\btechnical_update\b/gi, "技术升级"],
  [/\bexchange_listing\b/gi, "交易所上线"], [/\bhack_exploit\b/gi, "黑客攻击"],
  [/\bmacro_economic\b/gi, "宏观经济"], [/\blegal_action\b/gi, "法律诉讼"],
  [/\bregulatory\b/gi, "监管政策"], [/\bpartnership\b/gi, "合作公告"],
  [/\badoption\b/gi, "主流采纳"],
  // ── 时间效应值 ──
  [/\bimmediate\b/gi, "即时"], [/\bshort_term\b/gi, "短期"], [/\blong_term\b/gi, "长期"],
  // ── 可信度/风险等级值 ──
  [/\bcritical\b/gi, "关键"],
  // ── 方向/信号 ──
  [/\bbullish\b/gi, "看涨"], [/\bbearish\b/gi, "看跌"], [/\bneutral\b/gi, "中性"],
  [/\bsideways\b/gi, "横盘"],
  [/\buptrend\b/gi, "上升趋势"], [/\bdowntrend\b/gi, "下降趋势"],
  [/\branging\b/gi, "震荡"], [/\bvolatile\b/gi, "高波动"], [/\btrending\b/gi, "趋势"],
  [/\blong\b/gi, "做多"], [/\bshort\b/gi, "做空"],
  // ── 价格结构 ──
  [/\bsupport\b/gi, "支撑"], [/\bresistance\b/gi, "阻力"],
  [/\bbreakout\b/gi, "突破"], [/\bbreakdown\b/gi, "破位"],
  [/\breversal\b/gi, "反转"], [/\bcontinuation\b/gi, "延续"],
  [/\bconsolidation\b/gi, "整理"], [/\bpullback\b/gi, "回调"],
  [/\bbounce\b/gi, "反弹"], [/\bretest\b/gi, "回踩"],
  // ── 操盘阶段 ──
  [/\baccumulation\b/gi, "吸筹"], [/\bdistribution\b/gi, "派发"],
  [/\bmarkup\b/gi, "拉升"], [/\bmarkdown\b/gi, "下跌"], [/\bescape\b/gi, "出逃"],
  // ── 订单簿/操纵（单词） ──
  [/\bwall\b/gi, "挂单墙"], [/\bspoofing\b/gi, "幌骗"],
  [/\blayering\b/gi, "分层挂单"], [/\biceberg\b/gi, "冰山单"],
  // ── 市场结构（SMC） ──
  [/\bchoch\b/gi, "趋势转变"], [/\bbos\b/gi, "结构突破"],
  [/\bsweep\b/gi, "扫盘"], [/\bgrab\b/gi, "猎取"],
  [/\bmitigation\b/gi, "回补"], [/\bimbalance\b/gi, "失衡"],
  [/\bdisplacement\b/gi, "位移"], [/\binducement\b/gi, "诱导"],
  // ── 供需 ──
  [/\boverbought\b/gi, "超买"], [/\boversold\b/gi, "超卖"],
  [/\bdemand\b/gi, "需求"], [/\bsupply\b/gi, "供给"],
  // ── 状态/验证 ──
  [/\bunconfirmed\b/gi, "未确认"], [/\bconfirmed\b/gi, "已确认"],
  [/\bcontradicted\b/gi, "矛盾"], [/\bno_data\b/gi, "无数据"],
  [/\bpositive\b/gi, "积极"], [/\bnegative\b/gi, "消极"],
  [/\bnormal\b/gi, "正常"], [/\belevated\b/gi, "偏高"], [/\bextreme\b/gi, "极端"],
  [/\bpartial\b/gi, "部分"], [/\bfull\b/gi, "完全"],
  // ── 风险等级 ──
  [/\bhigh\b/gi, "高"], [/\bmoderate\b/gi, "中等"], [/\bmedium\b/gi, "中"], [/\blow\b/gi, "低"],
  [/\bconservative\b/gi, "保守"], [/\baggressive\b/gi, "激进"],
  // ── 动量/量能 ──
  [/\bmomentum\b/gi, "动量"], [/\bvolume\b/gi, "成交量"],
  [/\bdivergence\b/gi, "背离"], [/\bconvergence\b/gi, "收敛"],
  // ── 情绪（单词） ──
  [/\bfear\b/gi, "恐慌"], [/\bgreed\b/gi, "贪婪"],
  // ── 其他 ──
  [/\bunstable\b/gi, "不稳定"], [/\bstable\b/gi, "稳定"],
  [/\bliquidation\b/gi, "爆仓"], [/\bwhale\b/gi, "巨鲸"],
  [/\boutflow\b/gi, "流出"], [/\binflow\b/gi, "流入"],
  [/\bstrong\b/gi, "强"], [/\bweak\b/gi, "弱"],
  [/\bincreasing\b/gi, "增加"], [/\bdecreasing\b/gi, "减少"],
  [/\babove\b/gi, "高于"], [/\bbelow\b/gi, "低于"],
  [/\btrue\b/gi, "是"], [/\bfalse\b/gi, "否"],
  [/\bnone\b/gi, "无"], [/\bunknown\b/gi, "未知"],
  [/\bother\b/gi, "其他"],
  // ── 预警类型值（alert_type enum） ──
  [/\bfear_greed_extreme\b/gi, "恐慌贪婪极端"],
  [/\bkill_zone_warning\b/gi, "猎杀区预警"],
  [/\bai_acceleration_warning\b/gi, "AI加速预警"],
  [/\bai_manipulation_warning\b/gi, "AI操纵预警"],
  [/\bdefense_warning\b/gi, "防御预警"],
  [/\bexchange_large_inflow\b/gi, "交易所大额流入"],
  [/\bwhale_large_transfer\b/gi, "巨鲸大额转账"],
  [/\bmvrv_extreme\b/gi, "MVRV极端值"],
  [/\bfunding_rate_extreme\b/gi, "资金费率极端"],
  [/\blarge_liquidation\b/gi, "大额爆仓"],
  [/\blong_short_imbalance\b/gi, "多空失衡"],
  [/\bfunding_rate_manipulation\b/gi, "资金费率操纵"],
  // ── 宏观事件 ──
  [/\bMacro:\s*/gi, "宏观事件: "],
  [/\bFOMC\/Fed Rate Decision\b/gi, "美联储利率决议"],
  [/\bCPI\/Inflation Data\b/gi, "CPI/通胀数据"],
  [/\bEmployment\/NFP Report\b/gi, "非农就业报告"],
  [/\bSEC\/Regulatory Action\b/gi, "SEC监管行动"],
  [/\bCrypto ETF Development\b/gi, "加密ETF进展"],
  [/\bStablecoin\/Banking Risk\b/gi, "稳定币/银行风险"],
  [/\bGeopolitical Risk Event\b/gi, "地缘政治风险"],
  [/\bGovernment Crypto Policy\b/gi, "政府加密政策"],
  [/\bGeopolitical Risk\b/gi, "地缘政治风险"],
];

export function localizeText(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return "";
  let result = text;
  for (const [pattern, replacement] of _TEXT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return formatPrice(value);
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return localizeText(value);
  return JSON.stringify(value);
}

export function formatDirection(dir: string): string {
  if (dir === "bullish") return "看涨";
  if (dir === "bearish") return "看跌";
  if (dir === "neutral") return "中性";
  if (dir === "sideways") return "横盘";
  if (dir === "long") return "做多";
  if (dir === "short") return "做空";
  return localizeText(dir);
}

// ── Section icon ───────────────────────────────────────────

export function getSectionIcon(title: string): { icon: LucideIcon; color: string } {
  return SECTION_ICONS[title] || { icon: Activity, color: "text-zinc-400" };
}

// ── Section grouping ───────────────────────────────────────

export function groupSections(sections: ReportSection[]) {
  const groups: { label: string; sections: ReportSection[] }[] = SECTION_GROUPS.map((g) => ({
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

  return { groups: groups.filter((g) => g.sections.length > 0), ungrouped };
}

// ── Time formatter ─────────────────────────────────────────

export function formatCachedTime(cachedAt: string): string {
  const diff = Date.now() - new Date(cachedAt).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时前`;
}

// ── Mode label ─────────────────────────────────────────────

export function modeLabel(mode: string): string {
  if (mode === "scalping") return "实时短线";
  if (mode === "intraday") return "日内博弈";
  if (mode === "trend") return "趋势布局";
  return mode;
}

export function getRankingEligibility(mode: AnalysisMode, strategy: StrategyData) {
  const isEligibleMode = mode === "intraday" || mode === "trend";
  const isNeutral = strategy.direction === "neutral";
  const isFallback = strategy.is_fallback;
  const eligible = isEligibleMode && !isNeutral && !isFallback;

  let reason = "";
  if (!isEligibleMode) reason = "仅日内/趋势模式参与排行";
  else if (isNeutral) reason = "中性方向不计入排行";
  else if (isFallback) reason = "回退策略不计入排行";

  return { eligible, reason };
}

// ── Blocked reason label ───────────────────────────────────

export function blockedReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return BLOCKED_REASON_LABELS[code] || "分析受阻";
}
