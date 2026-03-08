import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export type PaymentNetwork = "TRC-20" | "ERC-20" | "BEP-20";

export interface PaymentInfo {
  id: string;
  payment_id: string;
  user_id: string;
  plan: number;
  amount_usd: number;
  network: string | null;
  status: string;
  created_at: string | null;
  pay_address: string | null;
  pay_amount: number | null;
  pay_currency: string | null;
}

export type DurationMonths = 1 | 3 | 12;

interface CreatePaymentRequest {
  plan: 1 | 2;
  network: PaymentNetwork;
  duration_months?: DurationMonths;
}

// ── API calls ────────────────────────────────────────────────

export async function createPayment(
  request: CreatePaymentRequest
): Promise<PaymentInfo> {
  const res = await authFetch(`${API_BASE}/api/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "创建支付失败" }));
    throw new Error(err.detail || "创建支付失败");
  }
  return res.json();
}

export async function fetchPaymentHistory(
  limit: number = 20
): Promise<PaymentInfo[]> {
  const res = await authFetch(
    `${API_BASE}/api/payment/history?limit=${limit}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取支付历史失败" }));
    throw new Error(err.detail || "获取支付历史失败");
  }
  return res.json();
}
