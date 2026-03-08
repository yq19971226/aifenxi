import type { LucideIcon } from "lucide-react";
import type { ReportSection, SignalDirection, SectionStatus } from "@/lib/api/analysis";
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

// ── Field label ────────────────────────────────────────────

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
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
  [/\bbullish\b/gi, "看涨"], [/\bbearish\b/gi, "看跌"], [/\bneutral\b/gi, "中性"],
  [/\bsideways\b/gi, "横盘"], [/\blong\b/gi, "做多"], [/\bshort\b/gi, "做空"],
  [/\bsupport\b/gi, "支撑"], [/\bresistance\b/gi, "阻力"],
  [/\baccumulation\b/gi, "吸筹"], [/\bdistribution\b/gi, "派发"],
  [/\bmarkup\b/gi, "拉升"], [/\bmarkdown\b/gi, "下跌"], [/\bescape\b/gi, "出逃"],
  [/\bdemand\b/gi, "需求"], [/\bsupply\b/gi, "供给"],
  [/\bconfirmed\b/gi, "已确认"], [/\bunconfirmed\b/gi, "未确认"],
  [/\bcontradicted\b/gi, "矛盾"], [/\bno_data\b/gi, "无数据"],
  [/\bpositive\b/gi, "积极"], [/\bnegative\b/gi, "消极"],
  [/\bnormal\b/gi, "正常"], [/\belevated\b/gi, "偏高"], [/\bextreme\b/gi, "极端"],
  [/\bpartial\b/gi, "部分"], [/\bfull\b/gi, "完全"],
  [/\bhigh\b/gi, "高"], [/\bmedium\b/gi, "中"], [/\blow\b/gi, "低"],
];

export function localizeText(text: string): string {
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
  return dir;
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

// ── Blocked reason label ───────────────────────────────────

export function blockedReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return BLOCKED_REASON_LABELS[code] || "分析受阻";
}
