/**
 * 网格策略推荐引擎 — Grid Strategy Recommendation Engine
 *
 * 根据分析结果（日内/趋势）+ 用户资金自动计算最优合约网格参数。
 * 输出对标币安合约网格交易所需全部参数。
 *
 * 仅限旗舰版 (level >= 2) 用户使用。
 */

import type { StrategyData } from "@/lib/types/strategy";
import type { TradePreferences } from "./position-sizing";

// ── Types ────────────────────────────────────────────────────

export type GridMode = "arithmetic" | "geometric";
export type GridDirection = "neutral" | "long" | "short";
export type GridScenario = "ranging" | "trending";

export interface GridStrategyResult {
  /** 网格场景：震荡 or 趋势 */
  scenario: GridScenario;
  /** 方向：中性 / 做多 / 做空 */
  direction: GridDirection;
  /** 价格上界 */
  priceUpper: number;
  /** 价格下界 */
  priceLower: number;
  /** 网格数量 */
  gridCount: number;
  /** 网格模式：等差 / 等比 */
  gridMode: GridMode;
  /** 推荐杠杆（上限 20x） */
  leverage: number;
  /** 投资额（保证金） */
  investmentAmount: number;
  /** 杠杆后投资金额 */
  leveragedAmount: number;
  /** 每笔数量 (USDT) */
  perGridAmount: number;
  /** 每格利润率（已扣除手续费） */
  perGridProfitPct: number;
  /** 预估强平价格（做多） */
  estLiquidationLong: number | null;
  /** 预估强平价格（做空） */
  estLiquidationShort: number | null;
  /** 止盈价格 */
  takeProfit: number;
  /** 止损价格 */
  stopLoss: number;
  /** 是否启用上移 */
  shiftUp: boolean;
  /** 是否启用下移 */
  shiftDown: boolean;
  /** 预估年化收益率 */
  estAnnualYield: number;
  /** 网格间距 (价格) */
  gridSpacing: number;
  /** 所有网格价位 */
  gridLevels: number[];
}

export interface GridStrategyInput {
  strategy: StrategyData;
  mode: "intraday" | "trend";
  preferences: TradePreferences;
  /** 市场状态支撑位 */
  support?: number | null;
  /** 市场状态阻力位 */
  resistance?: number | null;
  /** 当前价格（可选，默认取 entry 中位数） */
  currentPrice?: number;
}

// ── Constants ────────────────────────────────────────────────

const MAX_LEVERAGE = 20;
const TAKER_FEE = 0.0005; // 0.05% per side
const MAKER_FEE = 0.0002; // 0.02% per side

// ── Core Calculation ─────────────────────────────────────────

export function calculateGridStrategy(input: GridStrategyInput): GridStrategyResult | null {
  const { strategy, mode, preferences } = input;
  const { capital, leverage: userLeverage } = preferences;

  if (!strategy || strategy.direction === "neutral" || strategy.is_fallback) return null;
  if (capital <= 0) return null;

  const entryMid = ((strategy.entry_low ?? 0) + (strategy.entry_high ?? 0)) / 2;
  const stopLoss = strategy.stop_loss ?? 0;
  const targets = strategy.targets ?? [];
  const firstTarget = targets[0] ?? 0;
  const currentPrice = input.currentPrice ?? entryMid;

  if (entryMid <= 0 || stopLoss <= 0 || firstTarget <= 0) return null;

  const isLong = strategy.direction === "long";

  // ── Determine scenario & parameters based on mode ──────────

  if (mode === "intraday") {
    return calculateRangingGrid(input, isLong, entryMid, stopLoss, firstTarget, currentPrice, capital, userLeverage);
  } else {
    return calculateTrendingGrid(input, isLong, entryMid, stopLoss, targets, currentPrice, capital, userLeverage);
  }
}

// ── Ranging Grid (日内 → 震荡网格) ───────────────────────────

function calculateRangingGrid(
  input: GridStrategyInput,
  isLong: boolean,
  entryMid: number,
  stopLoss: number,
  firstTarget: number,
  currentPrice: number,
  capital: number,
  userLeverage: number,
): GridStrategyResult {
  // Use support/resistance if available, otherwise derive from strategy
  const support = input.support ?? Math.min(stopLoss, entryMid * 0.97);
  const resistance = input.resistance ?? Math.max(firstTarget, entryMid * 1.03);

  // Price range: support ~ resistance
  const priceLower = round2(support);
  const priceUpper = round2(resistance);
  const range = priceUpper - priceLower;

  // Grid count: 10~25 for ranging (denser grids for ranges)
  const rangePct = range / entryMid;
  let gridCount = Math.round(rangePct * 500); // ~1 grid per 0.2%
  gridCount = Math.max(10, Math.min(30, gridCount));

  // Leverage: conservative for neutral grids
  const confidence = input.strategy.confidence ?? 0.5;
  let leverage = Math.round(3 + confidence * 7); // 3x ~ 10x
  leverage = Math.min(leverage, MAX_LEVERAGE, userLeverage || MAX_LEVERAGE);
  leverage = Math.max(1, leverage);

  // Investment
  const investmentAmount = round2(capital * 0.3); // 30% of capital for grid
  const leveragedAmount = round2(investmentAmount * leverage);
  const perGridAmount = round2(leveragedAmount / gridCount);

  // Grid spacing
  const gridSpacing = round4(range / gridCount);

  // Per grid profit (after fees)
  const gridProfitPct = (gridSpacing / entryMid) - (TAKER_FEE + MAKER_FEE) * 2;
  const perGridProfitPct = round4(Math.max(0, gridProfitPct * 100));

  // Liquidation estimates
  const marginPerGrid = investmentAmount / gridCount;
  const estLiquidationLong = round2(priceLower * (1 - 1 / leverage * 0.8));
  const estLiquidationShort = round2(priceUpper * (1 + 1 / leverage * 0.8));

  // Annual yield estimate (based on daily oscillations)
  // Assume price touches each grid ~2 times per day in ranging market
  const dailyProfit = gridCount * 2 * (gridProfitPct * leveragedAmount / gridCount);
  const estAnnualYield = round2(Math.min(999, (dailyProfit / investmentAmount) * 365 * 100));

  // Grid levels
  const gridLevels = generateArithmeticLevels(priceLower, priceUpper, gridCount);

  return {
    scenario: "ranging",
    direction: "neutral",
    priceUpper,
    priceLower,
    gridCount,
    gridMode: "arithmetic",
    leverage,
    investmentAmount,
    leveragedAmount,
    perGridAmount,
    perGridProfitPct,
    estLiquidationLong,
    estLiquidationShort,
    takeProfit: round2(priceUpper * 1.01),
    stopLoss: round2(priceLower * 0.99),
    shiftUp: false,
    shiftDown: false,
    estAnnualYield,
    gridSpacing,
    gridLevels,
  };
}

// ── Trending Grid (趋势 → 单边网格) ─────────────────────────

function calculateTrendingGrid(
  input: GridStrategyInput,
  isLong: boolean,
  entryMid: number,
  stopLoss: number,
  targets: number[],
  currentPrice: number,
  capital: number,
  userLeverage: number,
): GridStrategyResult {
  const lastTarget = targets[targets.length - 1] ?? entryMid;

  // Price range: stop_loss ~ last_target
  let priceLower: number, priceUpper: number;
  if (isLong) {
    priceLower = round2(stopLoss);
    priceUpper = round2(lastTarget);
  } else {
    priceLower = round2(lastTarget);
    priceUpper = round2(stopLoss);
  }

  const range = priceUpper - priceLower;
  if (range <= 0) return calculateRangingGrid(input, isLong, entryMid, stopLoss, targets[0] ?? entryMid, currentPrice, capital, userLeverage);

  // Grid count: 5~15 for trending (sparser grids)
  const rangePct = range / entryMid;
  let gridCount = Math.round(rangePct * 200); // ~1 grid per 0.5%
  gridCount = Math.max(5, Math.min(15, gridCount));

  // Leverage: based on confidence, slightly higher for strong signals
  const confidence = input.strategy.confidence ?? 0.5;
  let leverage = Math.round(5 + confidence * 10); // 5x ~ 15x
  leverage = Math.min(leverage, MAX_LEVERAGE, userLeverage || MAX_LEVERAGE);
  leverage = Math.max(1, leverage);

  // Investment
  const investmentAmount = round2(capital * 0.4); // 40% of capital for trend grid
  const leveragedAmount = round2(investmentAmount * leverage);
  const perGridAmount = round2(leveragedAmount / gridCount);

  // Grid spacing (geometric for trends)
  const ratio = Math.pow(priceUpper / priceLower, 1 / gridCount);
  const gridSpacing = round4((ratio - 1) * 100); // as percentage

  // Per grid profit
  const gridProfitPct = (ratio - 1) - (TAKER_FEE + MAKER_FEE) * 2;
  const perGridProfitPct = round4(Math.max(0, gridProfitPct * 100));

  // Liquidation
  const estLiquidationLong = isLong ? round2(priceLower * (1 - 1 / leverage * 0.8)) : null;
  const estLiquidationShort = !isLong ? round2(priceUpper * (1 + 1 / leverage * 0.8)) : null;

  // Annual yield estimate (trending: fewer but larger moves)
  const dailyProfit = gridCount * 0.5 * (gridProfitPct * leveragedAmount / gridCount);
  const estAnnualYield = round2(Math.min(999, (dailyProfit / investmentAmount) * 365 * 100));

  // Grid levels (geometric)
  const gridLevels = generateGeometricLevels(priceLower, priceUpper, gridCount);

  return {
    scenario: "trending",
    direction: isLong ? "long" : "short",
    priceUpper,
    priceLower,
    gridCount,
    gridMode: "geometric",
    leverage,
    investmentAmount,
    leveragedAmount,
    perGridAmount,
    perGridProfitPct,
    estLiquidationLong,
    estLiquidationShort,
    takeProfit: round2(isLong ? lastTarget : lastTarget),
    stopLoss: round2(stopLoss),
    shiftUp: isLong,
    shiftDown: !isLong,
    estAnnualYield,
    gridSpacing,
    gridLevels,
  };
}

// ── Grid Level Generators ────────────────────────────────────

function generateArithmeticLevels(lower: number, upper: number, count: number): number[] {
  const levels: number[] = [];
  const step = (upper - lower) / count;
  for (let i = 0; i <= count; i++) {
    levels.push(round2(lower + step * i));
  }
  return levels;
}

function generateGeometricLevels(lower: number, upper: number, count: number): number[] {
  const levels: number[] = [];
  const ratio = Math.pow(upper / lower, 1 / count);
  for (let i = 0; i <= count; i++) {
    levels.push(round2(lower * Math.pow(ratio, i)));
  }
  return levels;
}

// ── Helpers ──────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
