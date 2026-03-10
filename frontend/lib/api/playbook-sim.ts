import { authFetch, authHeaders } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface PlaybookStage {
  name: string;
  phase: string;
  typical_duration: string;
  features: string[];
  key_indicators: string[];
  next_stage_probability: number;
  failure_signal: string;
}

export interface CounterStrategy {
  action: string;
  entry_logic: string;
  stop_loss_logic: string;
  target_logic: string;
  risk_level: string;
  wait_signal: string;
  risk_warning: string;
}

export interface PlaybookMatch {
  name: string;
  match_pct: number;
  signal: string;
  strategy_type: string | null;
  aftermath: string | null;
  matched_features?: number;
  total_features?: number;
  matched_domains?: number;
  total_domains?: number;
  matched_regimes?: number;
  total_regimes?: number;
  market_structure_type?: string | null;
  structure_matched?: boolean;
  inferred_market_structures?: string[];
  matched_confidence_boosters?: string[];
  matched_invalidation_signals?: string[];
  score_breakdown?: {
    feature_score: number;
    domain_score: number;
    regime_score: number;
    structure_score: number;
    booster_bonus: number;
    invalidation_penalty: number;
    stage_bonus: number;
    weighted_score: number;
  };
  dominant_factors?: string[];
  ranking_reason_summary?: string | null;
  decision_sentence?: string | null;
  required_domains?: string[];
  applicable_regimes?: string[];
  confidence_boosters?: string[];
  invalidation_signals?: string[];
  current_stage_idx: number | null;
  stages: PlaybookStage[] | null;
  counter_strategy: CounterStrategy | null;
}

export interface LlmPrediction {
  current_stage: number;
  next_stage_probability: number;
  estimated_transition: string;
  key_observations: string[];
}

export interface DealerPrediction {
  current_stage: number;
  next_stage_probability: number;
  estimated_transition: string;
  dealer_plan: string;
  target_price_range: { low: number; high: number };
  tactics: string[];
  key_observations: string[];
}

export interface DefenseStrategy {
  defense_summary: string;
  entry: { price: number; condition: string };
  stop_loss: { price: number; logic: string };
  take_profit: { price: number; ratio: string }[];
  confirmation_signals: string[];
  risk_level: string;
  risk_warning: string;
  confidence: number;
}

export interface JudgeAdoption {
  dealer_credibility: number;
  defense_feasibility: number;
  adoption: "adopt" | "partial" | "wait";
  final_recommendation: string;
  next_move: string;
  risk_alerts: string[];
  reasoning: string;
}

export interface SimResult {
  symbol: string;
  current_phase: string;
  timestamp: string;
  top_matches: PlaybookMatch[];
  llm_prediction: LlmPrediction | null;
  dealer_prediction: DealerPrediction | null;
  defense_strategy: DefenseStrategy | null;
  judge_adoption: JudgeAdoption | null;
  adversarial_complete: boolean;
  total_playbooks: number;
  snapshot_price?: number | null;
  is_masked?: boolean;
  error?: string;
}

export interface PlazaItem {
  id: string;
  symbol: string;
  playbook_name: string;
  match_pct: number;
  status: string;
  created_at: string | null;
  current_stage_idx: number | null;
  final_accuracy: number | null;
  verified_stages?: number;
  stages: PlaybookStage[] | null;
  signal?: string;
  market_structure_type?: string | null;
  snapshot_price?: number | null;
  stage_entry_price?: number | null;
  failure_reason?: string | null;
  risk_flag?: boolean;
  risk_note?: string | null;
  dominant_factors?: string[];
  ranking_reason_summary?: string | null;
  decision_sentence?: string | null;
  inferred_market_structures?: string[];
  matched_confidence_boosters?: string[];
  matched_invalidation_signals?: string[];
  structure_explanation?: string | null;
}

export interface PlazaFeed {
  items: PlazaItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface PlazaStats {
  total_predictions: number;
  active_count: number;
  completed_count: number;
  avg_accuracy: number;
  top_playbooks: { name: string; count: number; avg_accuracy: number }[];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (item == null ? "" : String(item).trim()))
    .filter((item) => item.length > 0);
}

function normalizeLlmPrediction(prediction: unknown): LlmPrediction | null {
  if (!prediction || typeof prediction !== "object") {
    return null;
  }
  const raw = prediction as Record<string, unknown>;
  if (typeof raw.estimated_transition !== "string" || !raw.estimated_transition.trim()) {
    return null;
  }
  return {
    current_stage: typeof raw.current_stage === "number" ? raw.current_stage : 0,
    next_stage_probability:
      typeof raw.next_stage_probability === "number"
        ? raw.next_stage_probability
        : 0,
    estimated_transition:
      typeof raw.estimated_transition === "string"
        ? raw.estimated_transition
        : "",
    key_observations: normalizeStringArray(raw.key_observations),
  };
}

function normalizeDealerPrediction(prediction: unknown): DealerPrediction | null {
  if (!prediction || typeof prediction !== "object") {
    return null;
  }
  const raw = prediction as Record<string, unknown>;
  if (typeof raw.dealer_plan !== "string" || !raw.dealer_plan.trim()) {
    return null;
  }
  const targetPriceRange =
    raw.target_price_range && typeof raw.target_price_range === "object"
      ? (raw.target_price_range as Record<string, unknown>)
      : {};
  return {
    current_stage: typeof raw.current_stage === "number" ? raw.current_stage : 0,
    next_stage_probability:
      typeof raw.next_stage_probability === "number"
        ? raw.next_stage_probability
        : 0,
    estimated_transition:
      typeof raw.estimated_transition === "string"
        ? raw.estimated_transition
        : "",
    dealer_plan: typeof raw.dealer_plan === "string" ? raw.dealer_plan : "",
    target_price_range: {
      low: typeof targetPriceRange.low === "number" ? targetPriceRange.low : 0,
      high: typeof targetPriceRange.high === "number" ? targetPriceRange.high : 0,
    },
    tactics: normalizeStringArray(raw.tactics),
    key_observations: normalizeStringArray(raw.key_observations),
  };
}

function normalizeSimResult(result: SimResult): SimResult {
  return {
    ...result,
    llm_prediction: normalizeLlmPrediction(result.llm_prediction),
    dealer_prediction: normalizeDealerPrediction(result.dealer_prediction),
  };
}

export async function fetchSimulation(symbol: string): Promise<SimResult> {
  const res = await authFetch(`${API_BASE}/api/playbook-sim/simulate/${symbol}`);
  const result = await handleApiResponse<SimResult>(res, "剧本演练失败");
  return normalizeSimResult(result);
}

// ── SSE 流式剧本演练 ──────────────────────────────────────────

export type PlaybookSSEType = "progress" | "step_done" | "step_fail" | "complete" | "cached" | "error";

export interface PlaybookProgressEvent {
  type: "progress";
  step: string;
  message: string;
}

export interface PlaybookStepDoneEvent {
  type: "step_done";
  step: string;
  data: Record<string, unknown>;
}

export interface PlaybookStepFailEvent {
  type: "step_fail";
  step: string;
  message: string;
}

export interface PlaybookCompleteEvent {
  type: "complete";
  result: SimResult;
}

export interface PlaybookCachedEvent {
  type: "cached";
  result: SimResult;
}

export interface PlaybookErrorEvent {
  type: "error";
  message: string;
}

export type PlaybookSSEEvent =
  | PlaybookProgressEvent
  | PlaybookStepDoneEvent
  | PlaybookStepFailEvent
  | PlaybookCompleteEvent
  | PlaybookCachedEvent
  | PlaybookErrorEvent;

export async function* runPlaybookSimStream(
  symbol: string,
): AsyncGenerator<PlaybookSSEEvent> {
  const res = await fetch(`${API_BASE}/api/playbook-sim/simulate/${symbol}/stream`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`剧本演练请求失败: ${res.status}`);
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
            const event: PlaybookSSEEvent = JSON.parse(jsonStr);
            if (event.type === "step_done" && event.step === "L2") {
              const normalized = normalizeDealerPrediction(event.data);
              if (!normalized) continue;
              event.data = normalized as unknown as Record<string, unknown>;
            }
            if (event.type === "complete" || event.type === "cached") {
              event.result = normalizeSimResult(event.result);
            }
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

export async function fetchPlazaFeed(params: {
  symbol?: string;
  playbook?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<PlazaFeed> {
  const sp = new URLSearchParams();
  if (params.symbol) sp.set("symbol", params.symbol);
  if (params.playbook) sp.set("playbook", params.playbook);
  if (params.status) sp.set("status", params.status);
  sp.set("page", String(params.page || 1));
  sp.set("page_size", String(params.page_size || 20));
  const res = await authFetch(`${API_BASE}/api/playbook-sim/plaza/feed?${sp}`);
  return handleApiResponse(res, "获取剧本广场失败");
}

export async function fetchPlazaStats(): Promise<PlazaStats> {
  const res = await authFetch(`${API_BASE}/api/playbook-sim/plaza/stats`);
  return handleApiResponse(res, "获取剧本广场统计失败");
}
