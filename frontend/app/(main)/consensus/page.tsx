"use client";

import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchConsensusLatest } from "@/lib/api/consensus";
import type { ModelVote } from "@/lib/api/consensus";
import {
  fetchAnalysisQuota,
  runAnalysis,
  type AnalysisMode,
  type AnalysisQuotaResponse,
  type AnalysisReport as AnalysisReportType,
  type ProgressEvent,
} from "@/lib/api/analysis";
import { SymbolSelector } from "@/components/layout/SymbolSelector";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { AnalysisReport } from "@/components/analysis/AnalysisReport";
import { mapConfidenceLabel } from "@/lib/utils/confidence";
import { useAuth } from "@/lib/auth-context";
import { effectiveLevel } from "@/lib/utils/membershipLevel";
import {
  Zap,
  TrendingUp,
  BarChart3,
  Lock,
  RefreshCw,
  Brain,
  Shield,
  Swords,
  Target,
  ChevronRight,
  AlertTriangle,
  Activity,
} from "lucide-react";
import {
  MODE_CONTRACTS,
  deriveAgentCount,
  derivePeriods,
  deriveTierLabel,
} from "@/lib/mode-contract";

const DEFAULT_SYMBOL = "BTCUSDT";

// ── Brand colors per model ──────────────────────────────────

const MODEL_COLORS: Record<string, { border: string; text: string; bg: string; hex: string }> = {
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

const MODEL_NAMES: Record<string, string> = {
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

const SIGNAL_LABELS: Record<string, string> = {
  bullish: "\u770B\u591A",
  bearish: "\u770B\u7A7A",
  neutral: "\u4E2D\u6027",
};

const SIGNAL_COLORS: Record<string, { text: string; bg: string }> = {
  bullish: { text: "text-emerald-400", bg: "bg-emerald-500/15" },
  bearish: { text: "text-red-400", bg: "bg-red-500/15" },
  neutral: { text: "text-zinc-400", bg: "bg-zinc-500/15" },
};

// ── Mode config — 从 mode-contract 派生，不再硬编码 ─────────

interface ModeConfig {
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

const MODE_CONFIGS: ModeConfig[] = [
  {
    value: "scalping",
    label: "\u8D85\u77ED\u7EBF",
    desc: "\u5FEB\u901F\u6355\u6349\u77ED\u7EBF\u673A\u4F1A\uFF0C\u9002\u5408\u5206\u949F\u7EA7\u64CD\u4F5C",
    agents: `${deriveAgentCount(_sc)} AI`,
    periods: derivePeriods(_sc),
    icon: <Zap size={20} />,
    minLevel: _sc.min_level,
    tierLabel: deriveTierLabel(_sc),
  },
  {
    value: "intraday",
    label: "\u65E5\u5185\u535A\u5F08",
    desc: `${deriveAgentCount(_ic)}\u4E2AAI\u5E76\u884C\u5206\u6790\uFF0C\u591A\u7EF4\u5EA6\u4EA4\u53C9\u9A8C\u8BC1`,
    agents: `${deriveAgentCount(_ic)} AI`,
    periods: derivePeriods(_ic),
    icon: <TrendingUp size={20} />,
    minLevel: _ic.min_level,
    tierLabel: deriveTierLabel(_ic),
  },
  {
    value: "trend",
    label: "\u8D8B\u52BF\u5E03\u5C40",
    desc: `${deriveAgentCount(_tc)}\u4E2AAI\u5168\u666F\u5206\u6790 + AI\u5BF9\u6297\u63A8\u6F14`,
    agents: `${deriveAgentCount(_tc)} AI`,
    periods: derivePeriods(_tc),
    icon: <BarChart3 size={20} />,
    minLevel: _tc.min_level,
    tierLabel: deriveTierLabel(_tc),
  },
];

// ── Sub-components ──────────────────────────────────────────

function AdversarialFlow({ report }: { report: AnalysisReportType }) {
  const adversarialSection = report.sections.find(
    (s) => s.title === "\u5BF9\u6297\u63A8\u6F14" || s.title === "AdversarialAgent"
  );

  const steps = [
    { icon: <Brain size={16} />, label: "\u6838\u5FC3AI\u5206\u6790", color: "text-indigo-400", bgColor: "bg-indigo-500/10", border: "border-indigo-500/20", done: true },
    { icon: <Target size={16} />, label: "\u591A\u6A21\u578B\u5171\u8BC6", color: "text-emerald-400", bgColor: "bg-emerald-500/10", border: "border-emerald-500/20", done: true },
    { icon: <Swords size={16} />, label: "\u5E84\u5BB6AI\u53CD\u63A8", color: "text-amber-400", bgColor: "bg-amber-500/10", border: "border-amber-500/20", done: !!adversarialSection },
    { icon: <Shield size={16} />, label: "\u4FEE\u6B63\u7CBE\u51C6\u70B9\u4F4D", color: "text-violet-400", bgColor: "bg-violet-500/10", border: "border-violet-500/20", done: !!report.strategy },
  ];

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-indigo-400" />
        <span className="text-sm font-semibold text-zinc-200">{"AI \u5BF9\u6297\u6D41\u7A0B"}</span>
      </div>
      
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center justify-center gap-2 rounded-lg p-2.5 ${
                step.done ? `${step.bgColor} border ${step.border}` : "bg-white/[0.02] border border-white/[0.05]"
              } flex-1 min-w-0 transition-colors`}
            >
              <span className={step.done ? step.color : "text-zinc-500"}>{step.icon}</span>
              <span
                className={`text-sm font-medium truncate ${
                  step.done ? step.color : "text-zinc-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                size={14}
                className={step.done ? "text-zinc-500 shrink-0" : "text-zinc-700 shrink-0"}
              />
            )}
          </div>
        ))}
      </div>

      {adversarialSection?.data && (
        <div className="mt-4 rounded-lg border-l-2 border-amber-500/50 bg-amber-500/[0.05] px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Swords size={13} className="text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              {"\u5E84\u5BB6 AI \u89C6\u89D2"}
            </span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {String(adversarialSection.data.dealer_intent || adversarialSection.data.summary || "\u5E84\u5BB6AI\u5DF2\u5B8C\u6210\u53CD\u5411\u63A8\u6F14")}
          </p>
        </div>
      )}
    </div>
  );
}

function ModelCard({ vote }: { vote: ModelVote }) {
  const colors = MODEL_COLORS[vote.model_key] ?? MODEL_COLORS.deepseek;
  const name = MODEL_NAMES[vote.model_key] ?? vote.model_key;
  const sigStyle = SIGNAL_COLORS[vote.signal] ?? SIGNAL_COLORS.neutral;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-1 h-4 rounded-full ${colors.bg}`} />
          <span className={`text-sm font-semibold ${colors.text}`}>{name}</span>
        </div>
        <span
          className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold ${sigStyle.text} ${sigStyle.bg}`}
        >
          {SIGNAL_LABELS[vote.signal]}
        </span>
      </div>
      
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          {"\u7F6E\u4FE1\u5EA6"}
        </span>
        <span className="font-mono text-xl font-bold text-zinc-200">
          {(vote.confidence * 100).toFixed(0)}%
        </span>
        <span className="text-xs text-zinc-500">
          {mapConfidenceLabel(vote.confidence)}
        </span>
      </div>
      
      {vote.reasoning && (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400 line-clamp-3">
          {vote.reasoning}
        </p>
      )}
      
      {vote.key_findings.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <ul className="space-y-1.5">
            {vote.key_findings.slice(0, 3).map((f, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${colors.bg}`}
                />
                <span className="line-clamp-2 leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Weight donut chart ──────────────────────────────────────

const DONUT_SIZE = 160;
const DONUT_RADIUS = 55;
const DONUT_STROKE = 18;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function WeightDonut({ weights }: { weights: Record<string, number> }) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let accumulated = 0;
  const segments = entries.map(([key, w]) => {
    const pct = total > 0 ? w / total : 0;
    const offset = accumulated;
    accumulated += pct;
    const c = MODEL_COLORS[key] ?? MODEL_COLORS.deepseek;
    return { key, pct, offset, hex: c.hex };
  });

  return (
    <div className="card-surface rounded-lg p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {"\u6743\u91CD\u5206\u5E03"}
      </p>
      <div className="mt-3 flex flex-col items-center gap-3">
        <div className="relative" style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
          <svg width={DONUT_SIZE} height={DONUT_SIZE} className="-rotate-90">
            <circle
              cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={DONUT_STROKE}
            />
            {segments.map((seg) => (
              <circle
                key={seg.key} cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS}
                fill="none" stroke={seg.hex} strokeWidth={DONUT_STROKE}
                strokeDasharray={`${seg.pct * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE}`}
                strokeDashoffset={-seg.offset * DONUT_CIRCUMFERENCE} strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-lg font-bold text-zinc-200">{entries.length}</span>
            <span className="text-xs text-zinc-500">{"\u6A21\u578B"}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {entries.map(([key, w]) => {
            const c = MODEL_COLORS[key] ?? MODEL_COLORS.deepseek;
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${c.bg}`} />
                <span className="text-xs text-zinc-400">{MODEL_NAMES[key] ?? key}</span>
                <span className="font-mono text-xs text-zinc-300">
                  {(w * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Divergence gauge ────────────────────────────────────────

function DivergenceGauge({ divergence }: { divergence: number }) {
  const pct = Math.min(Math.max(divergence, 0), 100);
  const color =
    pct <= 30 ? "var(--color-bull)" : pct <= 60 ? "#FACC15" : "var(--color-bear)";

  return (
    <div className="card-surface rounded-lg p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {"\u5206\u6B67\u5EA6"}
      </p>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-mono text-2xl font-bold" style={{ color }}>
          {pct.toFixed(1)}%
        </span>
        <span className="mb-0.5 text-sm text-zinc-500">
          {pct <= 30
            ? "\u9AD8\u5EA6\u4E00\u81F4"
            : pct <= 60
              ? "\u5B58\u5728\u5206\u6B67"
              : "\u4E25\u91CD\u5206\u6B67"}
        </span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, var(--color-bull) 0%, #FACC15 50%, var(--color-bear) 100%)",
          }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// ── Minority warnings ───────────────────────────────────────

function MinorityWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {"\u5C11\u6570\u6D3E\u8B66\u544A"}
      </p>
      {warnings.map((w, i) => (
        <div
          key={i}
          className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5"
        >
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm leading-relaxed text-amber-300">{w}</p>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ── Main page ───────────────────────────────────────────────

export default function ConsensusPage() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || DEFAULT_SYMBOL;

  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [mode, setMode] = useState<AnalysisMode>("scalping");
  const [running, setRunning] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressEvent[]>([]);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReportType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const adminLevel = effectiveLevel(user);

  const { data: quota } = useQuery<AnalysisQuotaResponse>({
    queryKey: ["analysis-quota"],
    queryFn: fetchAnalysisQuota,
    refetchInterval: 60_000,
  });

  const userLevel = Math.max(adminLevel, quota?.level ?? 0);
  const currentQuota = quota?.quotas?.[mode] ?? null;

  const isModeLocked = useCallback((m: AnalysisMode): boolean => {
    const cfg = MODE_CONFIGS.find((c) => c.value === m);
    return (cfg?.minLevel ?? 0) > userLevel;
  }, [userLevel]);
  const isQuotaExhausted = currentQuota !== null && currentQuota.remaining === 0;
  const canStart = symbol.trim().length > 0 && !isModeLocked(mode) && !isQuotaExhausted && !running;

  // Consensus report (read-only cache)
  const { data: consensusReport } = useQuery({
    queryKey: ["consensus", symbol],
    queryFn: () => fetchConsensusLatest(symbol),
    retry: false,
    enabled: !running,
  });

  const handleModeSelect = useCallback(
    (m: AnalysisMode) => {
      if (isModeLocked(m) || running) return;
      setMode(m);
      setAnalysisReport(null);
      setError(null);
      setProgressSteps([]);
    },
    [isModeLocked, running],
  );

  const handleStart = useCallback(
    async (forceRefresh = false) => {
      if (running || !symbol.trim() || isModeLocked(mode)) return;
      if (!forceRefresh && isQuotaExhausted) return;

      abortRef.current = false;
      setRunning(true);
      setProgressSteps([]);
      setAnalysisReport(null);
      setError(null);

      try {
        for await (const event of runAnalysis(symbol, mode, forceRefresh)) {
          if (abortRef.current) break;
          let shouldStop = false;
          switch (event.type) {
            case "progress":
              setProgressSteps((prev) => {
                const idx = prev.findIndex((s) => s.step === event.step);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = event;
                  return updated;
                }
                return [...prev, event];
              });
              break;
            case "complete":
            case "cached":
              setAnalysisReport(event.report);
              shouldStop = true;
              break;
            case "error":
              setError(event.message);
              shouldStop = true;
              break;
          }

          if (shouldStop) {
            break;
          }
        }
      } catch (err: unknown) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : "\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5");
        }
      } finally {
        setRunning(false);
        queryClient.invalidateQueries({ queryKey: ["analysis-quota"] });
        queryClient.invalidateQueries({ queryKey: ["consensus", symbol] });
      }
    },
    [running, symbol, mode, isModeLocked, isQuotaExhausted, queryClient],
  );

  // Which report to display: analysis report (fresh) > consensus cache
  const displayReport = analysisReport;
  const displayConsensus = consensusReport;

  return (
    <div className="mx-auto max-w-[1500px] px-4 md:px-8 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">{"\u7EFC\u5408\u5206\u6790"}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {"\u591A\u667A\u80FD\u4F53\u5E76\u884C\u5206\u6790 + AI\u5BF9\u6297\u63A8\u6F14 \u2192 \u7CBE\u51C6\u70B9\u4F4D"}
          </p>
        </div>
        <SymbolSelector value={symbol} onChange={setSymbol} />
      </div>

      {/* ── Mode Cards (3) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {MODE_CONFIGS.map((cfg) => {
          const locked = isModeLocked(cfg.value);
          const selected = mode === cfg.value;
          return (
            <button
              key={cfg.value}
              type="button"
              onClick={() => handleModeSelect(cfg.value)}
              disabled={running}
              className={`relative card p-5 text-left transition-all ${
                selected
                  ? "ring-1 ring-indigo-500/50 bg-indigo-500/[0.05]"
                  : locked
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-white/[0.02] cursor-pointer"
              }`}
            >
              {locked && (
                <div className="absolute top-3 right-3">
                  <Lock size={14} className="text-zinc-600" />
                </div>
              )}
              <div className={`${selected ? "text-indigo-400" : "text-zinc-500"}`}>
                {cfg.icon}
              </div>
              <h3 className="mt-2 text-base font-semibold text-white">{cfg.label}</h3>
              <p className="mt-1 text-sm text-zinc-500">{cfg.desc}</p>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-zinc-300">
                  {cfg.agents}
                </span>
                <span className="text-zinc-500">{cfg.periods}</span>
              </div>
              {locked && cfg.tierLabel && (
                <span className="mt-2 inline-block rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                  {"\u9700\u8981"}{cfg.tierLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Start Button + Quota ── */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          type="button"
          onClick={() => handleStart(false)}
          disabled={!canStart}
          className={`w-full sm:w-auto px-8 py-3.5 rounded-lg font-bold text-base flex items-center justify-center gap-2 transition-all ${
            running
              ? "bg-white/[0.05] text-zinc-400 border border-white/[0.1]"
              : canStart
                ? "bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                : "bg-white/[0.02] text-zinc-600 border border-white/[0.05]"
          }`}
        >
          {running ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {"\u5206\u6790\u4E2D..."}
            </>
          ) : (
            <>
              <Brain size={16} />
              {"\u5F00\u59CB\u5206\u6790"}
            </>
          )}
        </button>

        {currentQuota && !isModeLocked(mode) && (
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <span>{"\u4ECA\u65E5\u914D\u989D"}</span>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, currentQuota.limit) }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${
                    i < currentQuota.remaining
                      ? "bg-indigo-500"
                      : "bg-white/[0.05]"
                  }`}
                />
              ))}
            </div>
            <span className="font-mono text-zinc-400">
              {currentQuota.remaining} / {currentQuota.limit}
            </span>
          </div>
        )}

        {isQuotaExhausted && !isModeLocked(mode) && (
          <span className="text-xs text-red-400">
            {"\u4ECA\u65E5\u914D\u989D\u5DF2\u7528\u5B8C\uFF0C\u660E\u65E5 UTC 00:00 \u91CD\u7F6E"}
          </span>
        )}
      </div>

      {/* ── Progress ── */}
      {running && <AnalysisProgress steps={progressSteps} />}

      {/* ── Error ── */}
      {error && !running && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => handleStart(false)}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <RefreshCw size={12} />
            {"\u91CD\u8BD5"}
          </button>
        </div>
      )}

      {/* ── Analysis Report (fresh) ── */}
      {displayReport && !running && (
        <div className="space-y-5">
          {/* AI Adversarial Flow */}
          <AdversarialFlow report={displayReport} />

          {/* Cached hint + refresh */}
          {displayReport.cached && (
            <button
              type="button"
              onClick={() => handleStart(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 transition-colors"
            >
              <RefreshCw size={12} />
              {"\u7F13\u5B58\u7ED3\u679C\uFF0C\u70B9\u51FB\u91CD\u65B0\u5206\u6790"}
            </button>
          )}

          {/* Full report */}
          <AnalysisReport report={displayReport} />
        </div>
      )}

      {/* ── Consensus Report (cached) ── */}
      {displayConsensus && !running && !displayReport && (
        <div className="space-y-6 relative z-10">
          {/* Consensus summary */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="flex flex-wrap items-center gap-8">
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  {"\u5171\u8BC6\u4FE1\u53F7"}
                </span>
                <span
                  className={`text-3xl font-bold ${
                    (SIGNAL_COLORS[displayConsensus.consensus_signal] ?? SIGNAL_COLORS.neutral).text
                  }`}
                >
                  {SIGNAL_LABELS[displayConsensus.consensus_signal]}
                </span>
              </div>

              <div className="h-12 w-px bg-white/[0.08]" />

              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  {"\u5171\u8BC6\u7F6E\u4FE1\u5EA6"}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-zinc-200">
                    {(displayConsensus.consensus_confidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-zinc-500">
                    {mapConfidenceLabel(displayConsensus.consensus_confidence)}
                  </span>
                </div>
              </div>

              <div className="h-12 w-px bg-white/[0.08]" />

              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  {"\u6700\u540E\u66F4\u65B0"}
                </span>
                <span className="font-mono text-sm text-zinc-400 mt-2">
                  {formatTimestamp(displayConsensus.timestamp)}
                </span>
              </div>
            </div>
          </div>

          {/* Model cards 2x2 */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 relative z-10">
            {displayConsensus.model_votes.map((vote) => (
              <ModelCard key={vote.model_key} vote={vote} />
            ))}
          </div>

          {/* Weight donut + divergence */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 relative z-10">
            <WeightDonut weights={displayConsensus.weights} />
            <DivergenceGauge divergence={displayConsensus.divergence} />
          </div>

          {/* Minority warnings */}
          <div className="relative z-10">
            <MinorityWarnings warnings={displayConsensus.minority_warnings} />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!running && !displayReport && !displayConsensus && !error && (
        <div className="flex flex-col items-center justify-center py-20 relative z-10">
          <Brain size={32} className="text-zinc-600 mb-3" />
          <p className="text-base text-zinc-400">
            {"\u9009\u62E9\u5206\u6790\u6A21\u5F0F\uFF0C\u70B9\u51FB\u300C\u5F00\u59CB\u5206\u6790\u300D\u83B7\u53D6AI\u62A5\u544A"}
          </p>
        </div>
      )}
    </div>
  );
}
