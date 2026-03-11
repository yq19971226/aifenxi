/**
 * 看板规则引擎：基于概览数据对所有币种做研判，不调用分析 API。
 * 输入来自 GET /api/dashboard/overview 的 symbols[]，纯前端规则。
 */
import type { SymbolOverview } from "@/lib/api/dashboard";

export type RuleVerdict = "opportunity" | "risk" | "neutral";

export interface RuleResult {
  symbol: string;
  display_name: string;
  latest_price: number | null;
  direction: string;
  confidence: number;
  alert_level: string;
  is_worth_taking: boolean;
  verdict: RuleVerdict;
}

const CONFIDENCE_THRESHOLD = 0.4;
const RISK_LEVELS = ["high", "critical"];

export function runDashboardRuleEngine(symbols: SymbolOverview[]): RuleResult[] {
  return symbols.map((s) => {
    let verdict: RuleVerdict = "neutral";
    if (RISK_LEVELS.includes(s.alert_level?.toLowerCase() ?? "")) {
      verdict = "risk";
    } else if (
      s.direction &&
      s.direction !== "neutral" &&
      (s.confidence ?? 0) >= CONFIDENCE_THRESHOLD &&
      s.is_worth_taking
    ) {
      verdict = "opportunity";
    }
    return {
      symbol: s.symbol,
      display_name: s.display_name || s.symbol.replace("USDT", ""),
      latest_price: s.latest_price,
      direction: s.direction ?? "neutral",
      confidence: s.confidence ?? 0,
      alert_level: s.alert_level ?? "none",
      is_worth_taking: s.is_worth_taking ?? false,
      verdict,
    };
  });
}
