/**
 * 一键综合分析 API 客户端
 *
 * SSE 流式分析请求 + 配额查询 REST 接口
 */

import { authFetch, authHeaders } from "./auth";
import type { StrategyData } from "@/lib/types/strategy";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export type AnalysisMode = "scalping" | "intraday" | "trend";
export type SignalDirection = "bullish" | "bearish" | "neutral";
export type SectionStatus = "completed" | "failed" | "timeout" | "missing";
export type SSEEventType = "progress" | "partial" | "complete" | "cached" | "error";
export type ProgressStatus = "running" | "completed" | "failed" | "timeout";
export type AnalysisStatus = "actionable" | "degraded" | "blocked";

export interface ReportSection {
  title: string;
  status: SectionStatus;
  data: Record<string, unknown>;
  summary: string | null;
  note: string | null;
}

export type MarketRegimeType = "ranging" | "trending" | "volatile";

export interface MarketRegime {
  symbol: string;
  regime: MarketRegimeType;
  confidence: number;
  adx: number | null;
  bb_width_pct: number | null;
  atr_ratio: number | null;
  support: number | null;
  resistance: number | null;
  suggestion: string;
  recommended_mode: string;
}

export interface DataQualitySnapshot {
  interval_completeness: number;
  freshness: number;
  capability_state: Record<string, string>;
  missing_inputs: string[];
}

export interface AnalysisReport {
  symbol: string;
  mode: AnalysisMode;
  timestamp: string;
  signal: SignalDirection;
  confidence: number;
  sections: ReportSection[];
  strategy: StrategyData | null;
  is_partial: boolean;
  cached: boolean;
  cached_at: string | null;
  execution_time_ms: number;
  // unified output protocol (P2)
  status?: AnalysisStatus;
  blocked_reason?: string | null;
  data_quality_snapshot?: DataQualitySnapshot | null;
  engine_type?: string | null;
  mode_contract_version?: string | null;
  // legacy fields
  data_completeness: number;
  missing_sources: string[];
  completeness_warning: string | null;
  market_regime: MarketRegimeType | null;
  regime_suggestion: string | null;
  regime_support: number | null;
  regime_resistance: number | null;
}

export interface ProgressEvent {
  type: "progress";
  step: string;
  status: ProgressStatus;
  message: string;
}

export interface PartialEvent {
  type: "partial";
  section: ReportSection;
}

export interface CompleteEvent {
  type: "complete";
  report: AnalysisReport;
}

export interface CachedEvent {
  type: "cached";
  report: AnalysisReport;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
  reset_time: string | null;
}

export type SSEEvent =
  | ProgressEvent
  | PartialEvent
  | CompleteEvent
  | CachedEvent
  | ErrorEvent;

export interface QuotaInfo {
  mode: AnalysisMode;
  remaining: number;
  limit: number;
  locked: boolean;
}

export interface AnalysisQuotaResponse {
  quotas: Record<string, QuotaInfo>;
  level: number;
}

// ── SSE 流式分析请求 ────────────────────────────────────────

/**
 * 发起分析请求并以 async generator 形式逐条 yield SSE 事件。
 *
 * @param symbol   交易对，如 "BTCUSDT"
 * @param mode     分析模式
 * @param forceRefresh 是否忽略缓存重新分析
 */
export async function* runAnalysis(
  symbol: string,
  mode: AnalysisMode,
  forceRefresh: boolean = false,
): AsyncGenerator<SSEEvent> {
  const res = await fetch(`${API_BASE}/api/analysis/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      symbol,
      mode,
      force_refresh: forceRefresh,
    }),
  });

  if (!res.ok) {
    throw new Error(`分析请求失败: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("无法读取响应流");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const event: SSEEvent = JSON.parse(jsonStr);
            yield event;
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── 市场状态预检 ─────────────────────────────────────────────

/**
 * 快速检测当前市场状态（震荡/趋势/高波动）。
 * 无需登录，直接调用 Binance REST 实时 K 线。
 */
export async function fetchMarketRegime(
  symbol: string,
  interval: string = "1h",
): Promise<MarketRegime> {
  const res = await fetch(
    `${API_BASE}/api/market/regime?symbol=${encodeURIComponent(symbol)}&interval=${interval}`,
  );
  return handleApiResponse(res, "市场状态检测失败");
}

// ── 配额查询 ────────────────────────────────────────────────

/**
 * 获取当前用户各分析模式的剩余配额和每日限额。
 */
export async function fetchAnalysisQuota(): Promise<AnalysisQuotaResponse> {
  const res = await authFetch(`${API_BASE}/api/analysis/quota`);
  return handleApiResponse(res, "获取配额失败");
}
