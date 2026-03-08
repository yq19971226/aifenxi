import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface ModelVote {
  model_key: string;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoning: string;
  key_findings: string[];
}

export interface ConsensusReport {
  symbol: string;
  timestamp: string;
  consensus_signal: "bullish" | "bearish" | "neutral";
  consensus_confidence: number;
  model_votes: ModelVote[];
  weights: Record<string, number>;
  divergence: number;
  minority_warnings: string[];
}

export async function fetchConsensusLatest(
  symbol: string
): Promise<ConsensusReport | null> {
  const res = await authFetch(
    `${API_BASE}/api/consensus/latest?symbol=${symbol}`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

export async function fetchConsensusWeights(): Promise<Record<string, number>> {
  const res = await authFetch(`${API_BASE}/api/consensus/weights`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}
