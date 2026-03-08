import { Zap, TrendingUp, BarChart3 } from "lucide-react";
import type { AnalysisMode } from "@/lib/api/analysis";
import {
  MODE_CONTRACTS,
  deriveAgentCount,
  derivePeriods,
  deriveTierLabel,
} from "@/lib/mode-contract";

// ── Default ─────────────────────────────────────────────────

export const DEFAULT_SYMBOL = "BTCUSDT";

// ── Brand colors per model ──────────────────────────────────

export const MODEL_COLORS: Record<string, { border: string; text: string; bg: string; hex: string }> = {
  "deepseek-r1":             { border: "border-l-[#00D4AA]", text: "text-[#00D4AA]", bg: "bg-[#00D4AA]", hex: "#00D4AA" },
  "deepseek-v3.2-thinking":  { border: "border-l-[#00D4AA]", text: "text-[#00D4AA]", bg: "bg-[#00D4AA]", hex: "#00D4AA" },
  "claude-sonnet":           { border: "border-l-[#D97706]", text: "text-[#D97706]", bg: "bg-[#D97706]", hex: "#D97706" },
  "grok-fast":               { border: "border-l-[#10A37F]", text: "text-[#10A37F]", bg: "bg-[#10A37F]", hex: "#10A37F" },
  "grok-code-fast":          { border: "border-l-[#10A37F]", text: "text-[#10A37F]", bg: "bg-[#10A37F]", hex: "#10A37F" },
  "qwen3-max":               { border: "border-l-[#4285F4]", text: "text-[#4285F4]", bg: "bg-[#4285F4]", hex: "#4285F4" },
  "qwen3-next-thinking":     { border: "border-l-[#4285F4]", text: "text-[#4285F4]", bg: "bg-[#4285F4]", hex: "#4285F4" },
  "claude-haiku":            { border: "border-l-[#D97706]", text: "text-[#D97706]", bg: "bg-[#D97706]", hex: "#D97706" },
  deepseek:                  { border: "border-l-[#00D4AA]", text: "text-[#00D4AA]", bg: "bg-[#00D4AA]", hex: "#00D4AA" },
  "deepseek-reasoner":       { border: "border-l-[#00D4AA]", text: "text-[#00D4AA]", bg: "bg-[#00D4AA]", hex: "#00D4AA" },
  grok:                      { border: "border-l-[#10A37F]", text: "text-[#10A37F]", bg: "bg-[#10A37F]", hex: "#10A37F" },
  claude:                    { border: "border-l-[#D97706]", text: "text-[#D97706]", bg: "bg-[#D97706]", hex: "#D97706" },
  qwen:                      { border: "border-l-[#4285F4]", text: "text-[#4285F4]", bg: "bg-[#4285F4]", hex: "#4285F4" },
};

export const MODEL_NAMES: Record<string, string> = {
  "deepseek-r1": "DeepSeek R1",
  "deepseek-v3.2-thinking": "DeepSeek V3.2",
  "claude-sonnet": "Claude Sonnet",
  "grok-fast": "Grok-4 Fast",
  "grok-code-fast": "Grok Code",
  "qwen3-max": "Qwen3 Max",
  "qwen3-next-thinking": "Qwen3 Next",
  "claude-haiku": "Claude Haiku",
  deepseek: "DeepSeek",
  "deepseek-reasoner": "DeepSeek R1",
  grok: "Grok-4",
  claude: "Claude",
  qwen: "Qwen3",
};

export const SIGNAL_LABELS: Record<string, string> = {
  bullish: "看多",
  bearish: "看空",
  neutral: "中性",
};

export const SIGNAL_COLORS: Record<string, { text: string; bg: string }> = {
  bullish: { text: "text-emerald-400", bg: "bg-emerald-500/15" },
  bearish: { text: "text-red-400", bg: "bg-red-500/15" },
  neutral: { text: "text-zinc-400", bg: "bg-zinc-500/15" },
};

// ── Mode config — 从 mode-contract 派生，不再硬编码 ─────────

export interface ModeConfig {
  value: AnalysisMode;
  label: string;
  desc: string;
  agents: string;
  periods: string;
  icon: React.ReactNode;
  minLevel: number;
  tierLabel: string;
}

const _sc = MODE_CONTRACTS["scalping"];
const _ic = MODE_CONTRACTS["intraday"];
const _tc = MODE_CONTRACTS["trend"];

export const MODE_CONFIGS: ModeConfig[] = [
  {
    value: "scalping",
    label: "超短线",
    desc: "快速捕捉短线机会，适合分钟级操作",
    agents: `${deriveAgentCount(_sc)} AI`,
    periods: derivePeriods(_sc),
    icon: <Zap size={20} />,
    minLevel: _sc.min_level,
    tierLabel: deriveTierLabel(_sc),
  },
  {
    value: "intraday",
    label: "日内博弈",
    desc: `${deriveAgentCount(_ic)}个AI并行分析，多维度交叉验证`,
    agents: `${deriveAgentCount(_ic)} AI`,
    periods: derivePeriods(_ic),
    icon: <TrendingUp size={20} />,
    minLevel: _ic.min_level,
    tierLabel: deriveTierLabel(_ic),
  },
  {
    value: "trend",
    label: "趋势布局",
    desc: `${deriveAgentCount(_tc)}个AI全景分析 + AI对抗推演`,
    agents: `${deriveAgentCount(_tc)} AI`,
    periods: derivePeriods(_tc),
    icon: <BarChart3 size={20} />,
    minLevel: _tc.min_level,
    tierLabel: deriveTierLabel(_tc),
  },
];

// ── Helpers ──────────────────────────────────────────────────

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
