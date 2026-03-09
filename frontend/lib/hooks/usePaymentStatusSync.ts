import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPaymentHistory,
  syncPaymentStatus,
  type PaymentInfo,
} from "@/lib/api/payment";

const TERMINAL_STATUSES = new Set(["completed", "failed", "expired"]);

function mergePaymentInfo(base: PaymentInfo, incoming: PaymentInfo): PaymentInfo {
  return {
    ...base,
    id: incoming.id,
    user_id: incoming.user_id,
    plan: incoming.plan,
    amount_usd: incoming.amount_usd,
    network: incoming.network,
    status: incoming.status,
    created_at: incoming.created_at ?? base.created_at,
    pay_address: incoming.pay_address ?? base.pay_address,
    pay_amount: incoming.pay_amount ?? base.pay_amount,
    pay_currency: incoming.pay_currency ?? base.pay_currency,
    provider_status: incoming.provider_status ?? base.provider_status,
    status_reason: incoming.status_reason ?? base.status_reason,
  };
}

export function usePaymentStatusSync(currentPayment: PaymentInfo | null) {
  const historyQuery = useQuery<PaymentInfo[]>({
    queryKey: ["paymentHistory"],
    queryFn: () => fetchPaymentHistory(20),
  });

  const syncQuery = useQuery<PaymentInfo>({
    queryKey: ["paymentStatusSync", currentPayment?.payment_id],
    queryFn: () => syncPaymentStatus(currentPayment!.payment_id),
    enabled: Boolean(currentPayment && !TERMINAL_STATUSES.has(currentPayment.status)),
    refetchInterval:
      currentPayment && !TERMINAL_STATUSES.has(currentPayment.status) ? 5000 : false,
  });

  const syncedCurrentPayment = useMemo(() => {
    if (!currentPayment) {
      return null;
    }

    if (syncQuery.data) {
      return mergePaymentInfo(currentPayment, syncQuery.data);
    }

    const matched = (historyQuery.data ?? []).find(
      (payment) => payment.payment_id === currentPayment.payment_id
    );

    if (!matched) {
      return currentPayment;
    }

    return mergePaymentInfo(currentPayment, matched);
  }, [currentPayment, historyQuery.data, syncQuery.data]);

  const history = useMemo(() => {
    const items = historyQuery.data ?? [];
    if (!syncedCurrentPayment) {
      return items;
    }

    const index = items.findIndex(
      (payment) => payment.payment_id === syncedCurrentPayment.payment_id
    );
    if (index === -1) {
      return [syncedCurrentPayment, ...items];
    }

    return items.map((payment, itemIndex) =>
      itemIndex === index ? mergePaymentInfo(payment, syncedCurrentPayment) : payment
    );
  }, [historyQuery.data, syncedCurrentPayment]);

  return {
    history,
    currentPayment: syncedCurrentPayment,
  };
}
