"use client";

import { Fragment, useState, useCallback, useEffect } from "react";
import type { AdminOrderInfo, AuditLogEntry } from "@/lib/api/admin-orders";
import { getPaymentAuditLog } from "@/lib/api/admin-orders";
import {
  STATUS_STYLES,
  getProviderStatusLabel,
  getStatusReasonLabel,
} from "@/lib/payment-status";
import { OrderSyncButton } from "@/components/admin/orders/OrderSyncButton";
import { useTranslations } from "next-intl";

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

/* ── 事件类型颜色 ───────────────────────────────────── */
const EVENT_COLORS: Record<string, string> = {
  status_completed: "text-emerald-400",
  status_failed: "text-red-400",
  status_expired: "text-orange-400",
  status_pending: "text-amber-400",
  idempotent_skip: "text-zinc-500",
};

/* ── 审计日志时间线行（内联展开） ───────────────────── */
function AuditTimeline({
  paymentId,
  colSpan,
}: {
  paymentId: string;
  colSpan: number;
}) {
  const t = useTranslations("admin.orders.table");
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  // 首次挂载时加载
  useEffect(() => {
    getPaymentAuditLog(paymentId)
      .then((res) => setLogs(res.logs))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [paymentId]);

  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-3 bg-white/[0.02]">
        {loading ? (
          <p className="text-xs text-zinc-500 animate-pulse">
            {t("auditLogLoading")}
          </p>
        ) : !logs || logs.length === 0 ? (
          <p className="text-xs text-zinc-500">{t("auditLogEmpty")}</p>
        ) : (
          <div className="relative pl-4 border-l border-white/[0.08] space-y-2">
            {logs.map((log) => {
              const color =
                EVENT_COLORS[log.event_type] ?? "text-zinc-400";
              return (
                <div key={log.id} className="flex items-start gap-3 text-xs">
                  {/* 时间线圆点 */}
                  <span
                    className={`mt-1 h-2 w-2 rounded-full shrink-0 ${color.replace(
                      "text-",
                      "bg-"
                    )}`}
                  />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                    <span className={`font-mono font-medium ${color}`}>
                      {log.event_type}
                    </span>
                    {log.provider_status && (
                      <span className="text-zinc-500">
                        {t("auditLogProvider")}: {log.provider_status}
                      </span>
                    )}
                    {log.local_status && (
                      <span className="text-zinc-500">
                        {t("auditLogLocal")}: {log.local_status}
                      </span>
                    )}
                    {log.source && (
                      <span className="text-zinc-600">
                        {t("auditLogSource")}: {log.source}
                      </span>
                    )}
                    {log.created_at && (
                      <span className="text-zinc-600">
                        {formatDate(log.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}

/* ── 主表 ──────────────────────────────────────────── */

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
  const t = useTranslations("admin.orders.table");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleAudit = useCallback((paymentId: string) => {
    setExpandedId((prev) => (prev === paymentId ? null : paymentId));
  }, []);

  const PLAN_LABEL: Record<number, string> = {
    1: t("planPro"),
    2: t("planFlagship"),
  };

  const colCount = isAdmin ? 9 : 8;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-xs text-zinc-500">
            <th className="px-5 py-3 font-medium">{t("orderId")}</th>
            <th className="px-5 py-3 font-medium">{t("userEmail")}</th>
            <th className="px-5 py-3 font-medium">{t("plan")}</th>
            <th className="px-5 py-3 font-medium">{t("amount")}</th>
            <th className="px-5 py-3 font-medium">{t("paymentNetwork")}</th>
            <th className="px-5 py-3 font-medium">{t("status")}</th>
            <th className="px-5 py-3 font-medium">{t("providerDiag")}</th>
            <th className="px-5 py-3 font-medium">{t("createdAt")}</th>
            {isAdmin && <th className="px-5 py-3 font-medium">{t("action")}</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((order) => {
            const st = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
            const reasonLabel = getStatusReasonLabel(order.status_reason);
            const providerStatusLabel = getProviderStatusLabel(order.provider_status);
            const isExpanded = expandedId === order.payment_id;
            return (
              <Fragment key={order.id}>
                <tr
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => toggleAudit(order.payment_id)}
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
                        className={`h-1.5 w-1.5 rounded-full ${(st.text ?? "").replace("text-", "bg-")}`}
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
                      <div className="flex items-center gap-2">
                        <OrderSyncButton
                          disabled={loading}
                          paymentId={order.payment_id}
                          onError={onError}
                          onSuccess={onSynced}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAudit(order.payment_id);
                          }}
                          className={`px-2 py-1 text-xs rounded border transition-colors ${
                            isExpanded
                              ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                              : "border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.15]"
                          }`}
                        >
                          {t("auditLog")}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
                {isExpanded && (
                  <AuditTimeline
                    key={`audit-${order.payment_id}`}
                    paymentId={order.payment_id}
                    colSpan={colCount}
                  />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
