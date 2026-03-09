import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

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
  return handleApiResponse(res, "请求失败");
}

export async function fetchConsensusWeights(): Promise<Record<string, number>> {
  const res = await authFetch(`${API_BASE}/api/consensus/weights`);
  return handleApiResponse(res, "请求失败");
}
