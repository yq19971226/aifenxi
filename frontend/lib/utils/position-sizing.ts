/**
 * 仓位计算引擎 — Fixed Fractional 模型
 *
 * 风险金额 = 可用资金 × 风险比例
 * 名义仓位 = 风险金额 / 止损距离%
 * 保证金   = 名义仓位 / 杠杆倍数
 */

import type { StrategyData } from "@/lib/types/strategy";
import type { DefenseStrategy } from "@/lib/api/playbook-sim";
import type { SymbolOverview } from "@/lib/api/dashboard";

// ── Types ────────────────────────────────────────────────────

export interface TradePreferences {
  capital: number;
  leverage: number;
  riskPct: number;
  agreedDisclaimer: boolean;
  updatedAt: string;
}

export interface PositionInput {
  entryPrice: number;
  stopLoss: number;
  targets: number[];
  direction: "long" | "short" | "neutral";
}

export interface TargetResult {
  price: number;
  profit: number;
  profitPct: number;
  riskRewardRatio: number;
}

export interface PositionResult {
  entryPrice: number;
  stopLoss: number;
  stopDistancePct: number;
  riskAmount: number;
  positionSize: number;
  margin: number;
  maxLoss: number;
  targetResults: TargetResult[];
}

// ── Core Calculation ─────────────────────────────────────────

export function calculatePosition(
  input: PositionInput,
  prefs: TradePreferences,
): PositionResult | null {
  const { entryPrice, stopLoss, targets } = input;
  const { capital, leverage, riskPct } = prefs;

  if (entryPrice <= 0 || stopLoss <= 0 || capital <= 0 || leverage <= 0) {
    return null;
  }

  const stopDistance = Math.abs(entryPrice - stopLoss);
  if (stopDistance === 0) return null;

  const stopDistancePct = stopDistance / entryPrice;
  const riskAmount = capital * riskPct;
  const positionSize = riskAmount / stopDistancePct;
  const margin = positionSize / leverage;
  const maxLoss = riskAmount;

  const targetResults: TargetResult[] = targets.map((tp) => {
    const tpDistance = Math.abs(tp - entryPrice);
    const profitPct = tpDistance / entryPrice;
    const profit = positionSize * profitPct;
    const riskRewardRatio = stopDistance > 0 ? tpDistance / stopDistance : 0;
    return {
      price: tp,
      profit: round2(profit),
      profitPct: round4(profitPct),
      riskRewardRatio: round2(riskRewardRatio),
    };
  });

  return {
    entryPrice: round2(entryPrice),
    stopLoss: round2(stopLoss),
    stopDistancePct: round4(stopDistancePct),
    riskAmount: round2(riskAmount),
    positionSize: round2(positionSize),
    margin: round2(margin),
    maxLoss: round2(maxLoss),
    targetResults,
  };
}

// ── Adapters ─────────────────────────────────────────────────

export function fromStrategy(s: StrategyData): PositionInput {
  return {
    entryPrice: (s.entry_low + s.entry_high) / 2,
    stopLoss: s.stop_loss,
    targets: s.targets ?? [],
    direction: s.direction,
  };
}

export function fromDefenseStrategy(d: DefenseStrategy): PositionInput {
  return {
    entryPrice: d.entry.price,
    stopLoss: d.stop_loss.price,
    targets: d.take_profit.map((tp) => tp.price),
    direction: d.entry.price < d.stop_loss.price ? "short" : "long",
  };
}

export function fromSymbolOverview(o: SymbolOverview): PositionInput {
  const eLow = o.entry_low ?? 0;
  const eHigh = o.entry_high ?? 0;
  return {
    entryPrice: (eLow + eHigh) / 2,
    stopLoss: o.stop_loss ?? 0,
    targets: o.targets ?? [],
    direction: (o.direction as "long" | "short" | "neutral") || "neutral",
  };
}

// ── Helpers ──────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
