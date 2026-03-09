import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface SymbolConfig {
  symbol: string;
  enabled: boolean;
  display_name?: string;
  has_onchain?: boolean;
  has_derivatives?: boolean;
}

export async function listSymbols(): Promise<SymbolConfig[]> {
  const res = await authFetch(`${API_BASE}/api/symbols/`);
  return handleApiResponse(res, "获取交易对列表失败");
}

export const symbolsApi = { listSymbols };
