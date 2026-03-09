"use client";

import type { AdminOrderInfo } from "@/lib/api/admin-orders";
import {
  STATUS_STYLES,
  getProviderStatusLabel,
  getStatusReasonLabel,
} from "@/lib/payment-status";
import { OrderSyncButton } from "@/components/admin/orders/OrderSyncButton";

const PLAN_LABEL: Record<number, string> = { 1: "专业", 2: "旗舰" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

interface AdminOrdersTableProps {
  isAdmin: boolean;
  items: AdminOrderInfo[];
  loading: boolean;
  onError: (message: string) => void;
  onSynced: () => void;
}

export function AdminOrdersTable({
  isAdmin,
  items,
  loading,
  onError,
  onSynced,
}: AdminOrdersTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
            <th className="px-5 py-3 font-medium">订单ID</th>
            <th className="px-5 py-3 font-medium">用户邮箱</th>
            <th className="px-5 py-3 font-medium">套餐</th>
            <th className="px-5 py-3 font-medium">金额</th>
            <th className="px-5 py-3 font-medium">支付网络</th>
            <th className="px-5 py-3 font-medium">状态</th>
            <th className="px-5 py-3 font-medium">Provider 诊断</th>
            <th className="px-5 py-3 font-medium">创建时间</th>
            {isAdmin && <th className="px-5 py-3 font-medium">操作</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((order) => {
            const st = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
            const reasonLabel = getStatusReasonLabel(order.status_reason);
            const providerStatusLabel = getProviderStatusLabel(order.provider_status);
            return (
              <tr
                key={order.id}
                className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-5 py-3 text-zinc-300 font-mono text-xs">
                  {order.payment_id}
                </td>
                <td className="px-5 py-3 text-white">{order.user_email}</td>
                <td className="px-5 py-3 text-zinc-300">
                  {PLAN_LABEL[order.plan] ?? `Plan ${order.plan}`}
                </td>
                <td className="px-5 py-3 text-white font-medium">
                  {formatUSD(order.amount_usd)}
                </td>
                <td className="px-5 py-3 text-zinc-400">{order.network ?? "—"}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${st.text.replace("text-", "bg-")}`}
                    />
                    {st.label}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-zinc-400">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-zinc-300">
                      {providerStatusLabel ?? "—"}
                    </span>
                    {reasonLabel && <span>{reasonLabel}</span>}
                    {order.provider_observation_source && order.provider_observed_at && (
                      <span>
                        {order.provider_observation_source} · {formatDate(order.provider_observed_at)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-zinc-400">{formatDate(order.created_at)}</td>
                {isAdmin && (
                  <td className="px-5 py-3">
                    <OrderSyncButton
                      disabled={loading}
                      paymentId={order.payment_id}
                      onError={onError}
                      onSuccess={onSynced}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
