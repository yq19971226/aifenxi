import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export const SIGNAL_MAP: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  bullish: { icon: TrendingUp, color: "text-emerald-400", label: "看涨" },
  bearish: { icon: TrendingDown, color: "text-red-400", label: "看跌" },
  neutral: { icon: Minus, color: "text-zinc-400", label: "中性" },
};

export const MARKET_STRUCTURE_LABELS: Record<string, string> = {
  false_breakout_bull_trap: "假突破诱多陷阱",
  panic_washout_reversal: "恐慌洗盘反转",
  short_squeeze_reversal: "诱空杀空反转",
  double_bottom_absorption: "二次探底承接",
  stair_step_markup: "阶梯式拉升",
  parabolic_distribution: "拉高出货",
  liquidity_vacuum_trap: "流动性真空陷阱",
  wash_trading_distortion: "对倒洗售失真",
  liquidation_wick_hunt: "插针收割",
  twap_accumulation: "TWAP拆单吸筹",
  iceberg_absorption: "冰山订单吸筹",
  front_run_information_leak: "抢跑交易",
  etf_flow_led: "ETF资金驱动",
  etf_redemption_supply: "ETF赎回供给",
  options_gamma_pinning: "期权Gamma钉住",
  protective_put_pressure: "保护性买沽压力",
  perp_basis_manipulation: "永续/基差操纵",
  basis_compression_deleveraging: "基差压缩去杠杆",
  stablecoin_liquidity_rotation: "稳定币流动性迁移",
  cross_venue_liquidity_fragmentation: "跨所流动性分层",
  spot_absorption: "现货承接吸收",
  distribution_with_derivatives_warning: "派发并伴随衍生品预警",
};

export const DOMAIN_LABELS: Record<string, string> = {
  indicators: "技术指标",
  onchain: "链上",
  derivatives: "衍生品",
  coinglass: "CoinGlass",
  coingecko: "CoinGecko",
  oi: "OI",
  margin_oi: "保证金OI",
  funding: "资金费率",
  netflow: "净流/资金流",
  options: "期权",
  orderbook: "订单簿",
  large_orders: "大单挂单",
};

export const REGIME_LABELS: Record<string, string> = {
  accumulation: "吸筹",
  markup: "拉升",
  distribution: "派发",
  escape: "撤退",
  testing: "试盘",
  washout: "洗盘",
  range: "震荡",
  trend_up: "上行趋势",
  trend_down: "下行趋势",
  volatile: "高波动",
  event_driven: "事件驱动",
  expiry_window: "期权到期窗",
  pre_breakout: "突破前夕",
  slow_deleveraging: "缓慢去杠杆",
  post_euphoria: "过热后冷却",
  liquidity_stress: "流动性压力",
  overheated: "过热",
};

export function getMarketStructureLabel(value?: string | null) {
  if (!value) return null;
  return MARKET_STRUCTURE_LABELS[value] || value;
}

export function getDomainLabel(value: string) {
  return DOMAIN_LABELS[value] || value;
}

export function getRegimeLabel(value: string) {
  return REGIME_LABELS[value] || value;
}

type ScoreBreakdownLike = {
  feature_score: number;
  domain_score: number;
  regime_score: number;
  structure_score: number;
  booster_bonus: number;
  invalidation_penalty: number;
  stage_bonus: number;
};

export function getRankingReasonCopy(input?: {
  dominant_factors?: string[] | null;
  ranking_reason_summary?: string | null;
  decision_sentence?: string | null;
  score_breakdown?: ScoreBreakdownLike | null;
}) {
  const dominantFactors =
    input?.dominant_factors && input.dominant_factors.length > 0
      ? input.dominant_factors.filter(Boolean)
      : input?.score_breakdown
        ? [
            { label: "特征命中", value: input.score_breakdown.feature_score },
            { label: "数据域命中", value: input.score_breakdown.domain_score },
            { label: "环境命中", value: input.score_breakdown.regime_score },
            { label: "结构命中", value: input.score_breakdown.structure_score },
            { label: "Booster 加分", value: input.score_breakdown.booster_bonus },
            { label: "阶段加分", value: input.score_breakdown.stage_bonus },
          ]
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value)
            .map((item) => item.label)
        : [];

  const dominantSummary =
    input?.ranking_reason_summary ||
    (dominantFactors.length > 0 ? dominantFactors.slice(0, 2).join(" + ") : "");

  const decisionSentence =
    input?.decision_sentence ||
    (dominantSummary
      ? `本次上榜主因：${dominantSummary}${
          (input?.score_breakdown?.invalidation_penalty ?? 0) > 0 ? "，但被失效信号部分压分" : ""
        }`
      : "");

  return {
    dominantFactors,
    dominantSummary,
    decisionSentence,
  };
}

export type StepStatus = "idle" | "running" | "done" | "failed";

export interface StepStatuses {
  data: StepStatus;
  L1: StepStatus;
  L2: StepStatus;
  L3: StepStatus;
  L4: StepStatus;
}

export const INITIAL_STEP_STATUS: StepStatuses = {
  data: "idle", L1: "idle", L2: "idle", L3: "idle", L4: "idle",
};

export function getMatchPctColor(pct: number): string {
  if (pct >= 70) return "text-red-400";
  if (pct >= 40) return "text-amber-400";
  return "text-zinc-400";
}

export function getStatusBadge(status?: string, riskFlag?: boolean) {
  if (status === "active" && riskFlag) return { label: "需关注", color: "text-amber-400", bg: "bg-amber-500/10" };
  if (status === "active") return { label: "进行中", color: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (status === "completed") return { label: "已完成", color: "text-zinc-300", bg: "bg-white/[0.06]" };
  if (status === "failed") return { label: "已失效", color: "text-red-400", bg: "bg-red-500/10" };
  if (status === "expired") return { label: "已过期", color: "text-zinc-500", bg: "bg-white/[0.04]" };
  return { label: status || "未知", color: "text-zinc-500", bg: "bg-white/[0.04]" };
}
