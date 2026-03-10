/**
 * StrategyResult 的前端强类型定义
 *
 * 对应后端 backend/app/services/strategy.py 的 StrategyResult.model_dump(mode="json")
 */

export interface StrategyData {
  symbol?: string;
  direction: "long" | "short" | "neutral";
  entry_low?: number | null;
  entry_high?: number | null;
  stop_loss?: number | null;
  targets?: number[];
  confidence?: number;
  valid_until?: string | null;
  reasoning?: string;
  risk_reward_ratio?: number;
  is_worth_taking?: boolean;
  snapped_fields?: string[];
  is_fallback?: boolean;
}
