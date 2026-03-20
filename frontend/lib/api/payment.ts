import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

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
  provider_status: string | null;
  status_reason: string | null;
  payment_url: string | null;  // Oxapay 托管支付页面
}

export type DurationMonths = 1 | 3 | 12;

interface CreatePaymentRequest {
  plan: 1 | 2 | 3 | 4 | 5;  // 1=专业订阅, 2=旗舰订阅, 3=积分包S, 4=积分包M, 5=积分包L
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
  return handleApiResponse(res, "创建支付失败");
}

export async function fetchPaymentHistory(
  limit: number = 20
): Promise<PaymentInfo[]> {
  const res = await authFetch(
    `${API_BASE}/api/payment/history?limit=${limit}`
  );
  return handleApiResponse(res, "获取支付历史失败");
}

export async function syncPaymentStatus(
  paymentId: string
): Promise<PaymentInfo> {
  const res = await authFetch(`${API_BASE}/api/payment/${paymentId}/sync`, {
    method: "POST",
  });
  return handleApiResponse(res, "同步支付状态失败");
}
