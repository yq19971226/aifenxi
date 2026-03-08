import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface BacktestStats {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_return_pct: number;
  avg_return_pct: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  profit_loss_ratio: number;
  max_drawdown_pct: number;
  best_trade_pct: number;
  worst_trade_pct: number;
}

export interface EquityCurvePoint {
  date: string;
  trades: number;
  daily_return_pct: number;
  cumulative_return_pct: number;
  daily_wins: number;
}

export interface Benchmark {
  symbol: string;
  start_price: number;
  end_price: number;
  hold_return_pct: number;
}

export interface BacktestSummary {
  days: number;
  is_limited: boolean;
  max_days: number;
  symbol: string | null;
  stats: BacktestStats;
  equity_curve: EquityCurvePoint[];
  benchmark: Benchmark;
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  direction: string;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  confidence: number;
  price_at_generation: number;
  pnl_pct: number;
  status: string;
  created_at: string | null;
}

export interface BacktestTradesResult {
  items: BacktestTrade[];
  total: number;
  page: number;
  page_size: number;
}

async function handleRes<T>(res: Response, msg: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: msg }));
    throw new Error(err.detail || msg);
  }
  return res.json();
}

export async function fetchBacktestSummary(params: {
  days?: number;
  symbol?: string;
}): Promise<BacktestSummary> {
  const sp = new URLSearchParams();
  if (params.days) sp.set("days", String(params.days));
  if (params.symbol) sp.set("symbol", params.symbol);
  const res = await authFetch(`${API_BASE}/api/backtest/summary?${sp}`);
  return handleRes(res, "获取回测数据失败");
}

export async function fetchBacktestTrades(params: {
  days?: number;
  symbol?: string;
  page?: number;
  page_size?: number;
}): Promise<BacktestTradesResult> {
  const sp = new URLSearchParams();
  if (params.days) sp.set("days", String(params.days));
  if (params.symbol) sp.set("symbol", params.symbol);
  sp.set("page", String(params.page || 1));
  sp.set("page_size", String(params.page_size || 20));
  const res = await authFetch(`${API_BASE}/api/backtest/trades?${sp}`);
  return handleRes(res, "获取回测交易列表失败");
}
