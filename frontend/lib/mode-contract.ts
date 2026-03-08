/**
 * 前端模式合同 — 与后端 backend/app/core/mode_contract.py 保持同步。
 *
 * 所有模式相关的 AI 数量、周期、等级要求必须从此处派生，
 * 不允许在页面组件中硬编码。
 */

export const MODE_CONTRACT_VERSION = "1.0.0";

export interface ModeContractFrontend {
  mode_id: "scalping" | "intraday" | "trend";
  engine_type: "rule_engine" | "multi_agent_hybrid" | "multi_agent_consensus";
  trigger_interval: string;
  context_interval: string;
  bias_interval: string;
  core_agents: readonly string[];
  optional_agents: readonly string[];
  defense_layer: readonly string[];
  consensus_layer: string | null;
  min_level: number;
}

export const SCALPING_CONTRACT: ModeContractFrontend = {
  mode_id: "scalping",
  engine_type: "rule_engine",
  trigger_interval: "5m",
  context_interval: "15m",
  bias_interval: "1h",
  core_agents: ["technical"],
  optional_agents: [],
  defense_layer: [],
  consensus_layer: null,
  min_level: 0,
};

export const INTRADAY_CONTRACT: ModeContractFrontend = {
  mode_id: "intraday",
  engine_type: "multi_agent_hybrid",
  trigger_interval: "15m",
  context_interval: "1h",
  bias_interval: "4h",
  core_agents: ["technical", "onchain", "risk", "orderbook"],
  optional_agents: ["news_analyst", "calendar"],
  defense_layer: [],
  consensus_layer: null,
  min_level: 1,
};

export const TREND_CONTRACT: ModeContractFrontend = {
  mode_id: "trend",
  engine_type: "multi_agent_consensus",
  trigger_interval: "4h",
  context_interval: "1d",
  bias_interval: "1w",
  core_agents: [
    "technical", "onchain", "risk", "orderbook",
    "sentiment", "news_analyst", "calendar",
  ],
  optional_agents: [],
  defense_layer: ["adversarial", "collusion_detector"],
  consensus_layer: "nsed",
  min_level: 2,
};

export const MODE_CONTRACTS: Record<string, ModeContractFrontend> = {
  scalping: SCALPING_CONTRACT,
  intraday: INTRADAY_CONTRACT,
  trend: TREND_CONTRACT,
};

/** 从合同派生总 AI 数量（core + optional + defense + consensus 如有则 +1） */
export function deriveAgentCount(contract: ModeContractFrontend): number {
  const base =
    contract.core_agents.length +
    contract.optional_agents.length +
    contract.defense_layer.length;
  return contract.consensus_layer ? base + 1 : base;
}

/** 从合同派生周期展示字符串（trigger / context / bias） */
export function derivePeriods(contract: ModeContractFrontend): string {
  return `${contract.trigger_interval} / ${contract.context_interval} / ${contract.bias_interval}`;
}

/** 从合同派生等级标签 */
export function deriveTierLabel(contract: ModeContractFrontend): string {
  switch (contract.min_level) {
    case 0:
      return "";
    case 1:
      return "专业版";
    case 2:
      return "旗舰版";
    default:
      return `L${contract.min_level}`;
  }
}
