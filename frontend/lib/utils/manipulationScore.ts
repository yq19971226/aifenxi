/**
 * 庄家行为强度计算 — 从分析报告各 section 提取操纵信号，加权计算 0-100 分。
 *
 * 维度权重：
 *   订单簿操纵 30 | 舆情操纵 20 | 链上异常 25 | 风险等级 15 | 剧本置信度 10
 *
 * 颜色映射：
 *   0-30  绿色 var(--color-bull)（庄家活动低）
 *   31-60 黄色 #FACC15（庄家活动中等）
 *   61-100 红色 var(--color-bear)（庄家活动强烈）
 */

export interface ReportSection {
  title: string;
  data?: Record<string, unknown>;
  status?: string;
}

function findSection(
  sections: ReportSection[],
  ...titles: string[]
): ReportSection | undefined {
  return sections.find((s) => titles.includes(s.title));
}

export function computeManipulationScore(sections: ReportSection[]): number {
  let score = 0;
  let maxScore = 0;

  // 1. 订单簿操纵检测 (权重 30)
  const orderbook =
    findSection(sections, "订单流", "订单簿微观结构");
  if (orderbook?.data?.manipulation_detected) {
    score += 30;
  } else if (
    typeof orderbook?.data?.confidence === "number" &&
    orderbook.data.confidence > 0.6
  ) {
    score += 15;
  }
  maxScore += 30;

  // 2. 舆情操纵检测 (权重 20)
  const sentiment = findSection(sections, "舆情分析");
  if (sentiment?.data?.manipulation_detected) {
    score += 20;
  } else if (
    typeof sentiment?.data?.confidence === "number" &&
    sentiment.data.confidence > 0.6
  ) {
    score += 10;
  }
  maxScore += 20;

  // 3. 链上异常信号 (权重 25)
  const onchain = findSection(sections, "链上深度解读", "链上数据");
  if (
    onchain?.data?.signal === "bearish" &&
    typeof onchain?.data?.confidence === "number" &&
    onchain.data.confidence > 0.7
  ) {
    score += 25;
  } else if (
    typeof onchain?.data?.confidence === "number" &&
    onchain.data.confidence > 0.5
  ) {
    score += 12;
  }
  maxScore += 25;

  // 4. 风险等级 (权重 15)
  const risk = findSection(sections, "风险评估");
  if (risk?.data?.risk_level === "high") {
    score += 15;
  } else if (risk?.data?.risk_level === "medium") {
    score += 8;
  }
  maxScore += 15;

  // 5. 剧本匹配置信度 (权重 10)
  const playbook = findSection(sections, "剧本推演");
  if (
    typeof playbook?.data?.confidence === "number" &&
    playbook.data.confidence > 0.8
  ) {
    score += 10;
  } else if (
    typeof playbook?.data?.confidence === "number" &&
    playbook.data.confidence > 0.5
  ) {
    score += 5;
  }
  maxScore += 10;

  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
}

export function manipulationColor(score: number): string {
  if (score <= 30) return "var(--color-bull)";
  if (score <= 60) return "#FACC15";
  return "var(--color-bear)";
}

export function manipulationLabel(score: number): string {
  if (score <= 30) return "庄家活动低";
  if (score <= 60) return "庄家活动中等";
  return "庄家活动强烈";
}
