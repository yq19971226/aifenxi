"use client";

import { useCallback, useState } from "react";
import { syncAdminOrderStatus } from "@/lib/api/admin-orders";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

interface OrderSyncButtonProps {
  disabled?: boolean;
  paymentId: string;
  onError: (message: string) => void;
  onSuccess: () => void;
}

export function OrderSyncButton({
  disabled = false,
  paymentId,
  onError,
  onSuccess,
}: OrderSyncButtonProps) {
  const t = useTranslations("admin.orderSync");
  const [syncing, setSyncing] = useState(false);

  const handleClick = useCallback(async () => {
    setSyncing(true);
    onError("");
    try {
      await syncAdminOrderStatus(paymentId);
      onSuccess();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("syncFailed");
      // 判断是否为网关错误：包含"网关"或"重试"关键字
      const isGateway = msg.includes("网关") || msg.includes("重试") || msg.includes("超时");
      onError(isGateway
        ? `⚠️ ${msg}`
        : msg
      );
    } finally {
      setSyncing(false);
    }
  }, [onError, onSuccess, paymentId, t]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || syncing}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? t("syncing") : t("sync")}
    </button>
  );
}
