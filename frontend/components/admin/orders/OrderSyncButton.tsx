"use client";

import { useCallback, useState } from "react";
import { syncAdminOrderStatus } from "@/lib/api/admin-orders";
import { useTranslations } from "next-intl";

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
      onError(error instanceof Error ? error.message : t("syncFailed"));
    } finally {
      setSyncing(false);
    }
  }, [onError, onSuccess, paymentId]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || syncing}
      className="rounded-md border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {syncing ? t("syncing") : t("sync")}
    </button>
  );
}
