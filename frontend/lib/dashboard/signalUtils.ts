/**
 * 庄家看板信号工具函数模块
 * 纯函数，无副作用，无 API 调用
 */

/** 信号元数据类型 */
export interface SignalMeta {
  label: string;
  color: string;
}

/** 信号方向类型 */
export type SignalDirection = "bullish" | "bearish" | "neutral";

const SIGNAL_MAP: Record<SignalDirection, SignalMeta> = {
  bullish: { label: "做多", color: "var(--color-bull)" },
  bearish: { label: "做空", color: "var(--color-bear)" },
  neutral: { label: "观望", color: "#6B7280" },
};

/**
 * 信号方向到标签/颜色映射
 * bullish → 做多(绿), bearish → 做空(红), neutral → 观望(灰)
 */
export function mapSignalMeta(signal: SignalDirection): SignalMeta {
  return SIGNAL_MAP[signal];
}

/**
 * 分歧度警示判断
 * divergence > 50 时返回 true
 */
export function shouldShowDivergenceWarning(divergence: number): boolean {
  return divergence > 50;
}

/**
 * 加权胜率计算
 * 对 byAgent 和 weights 的共同 key（weight > 0）加权求和
 * 无有效数据时返回 null
 */
export function computeWeightedWinRate(
  byAgent: Record<string, number>,
  weights: Record<string, number>
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const agentRate = byAgent[key];
    if (agentRate !== undefined && weight > 0) {
      weightedSum += agentRate * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/**
 * 样本不足警示判断
 * settledCount < 5 时返回 true
 */
export function shouldShowSampleWarning(settledCount: number): boolean {
  return settledCount < 5;
}

/**
 * 看板指针角度计算
 * value=0 → 180°（最左），value=100 → 0°（最右）
 */
export function computeGaugeAngle(value: number): number {
  return 180 - (value / 100) * 180;
}

/**
 * 恐贪指数区间到标签/颜色映射
 * 0-20 极度恐慌, 21-40 恐慌, 41-60 中性, 61-80 贪婪, 81-100 极度贪婪
 */
export function mapFearGreedZone(value: number): SignalMeta {
  if (value <= 20) return { label: "极度恐慌", color: "#991B1B" };
  if (value <= 40) return { label: "恐慌", color: "var(--color-bear)" };
  if (value <= 60) return { label: "中性", color: "#6B7280" };
  if (value <= 80) return { label: "贪婪", color: "var(--color-bull)" };
  return { label: "极度贪婪", color: "#065F46" };
}
