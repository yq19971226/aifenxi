import { authFetch } from "./auth";

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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取交易对列表失败" }));
    throw new Error(err.detail || "获取交易对列表失败");
  }
  return res.json();
}

export const symbolsApi = { listSymbols };
