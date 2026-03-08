import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface PlaybookLatest {
  symbol: string;
  matched_playbook: string;
  probability: number;
  stage_description: string;
  next_move: string;
  counter_strategy: Record<string, string>;
  all_probabilities: Record<string, number>;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoning: string;
}

export interface PhaseHistory {
  symbol: string;
  current_phase: string;
  current_phase_label: string;
  entered_at: string;
  transitions: Array<{
    from: string;
    to: string;
    reason: string;
    ts: string;
  }>;
}

export async function fetchPlaybookLatest(
  symbol: string
): Promise<PlaybookLatest | null> {
  const res = await authFetch(
    `${API_BASE}/api/playbook/latest/${symbol}`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(body.detail || "请求失败");
  }
  return res.json();
}

export async function fetchPhaseHistory(
  symbol: string
): Promise<PhaseHistory | null> {
  const res = await authFetch(
    `${API_BASE}/api/playbook/phase-history/${symbol}`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}
