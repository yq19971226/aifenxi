export const STATUS_STYLES: Record<string, { text: string; bg: string; label: string }> = {
  pending: { text: "text-[#F5A623]", bg: "bg-[#F5A623]/20", label: "待确认" },
  completed: { text: "text-bull", bg: "bg-[var(--color-bull)]/20", label: "已完成" },
  failed: { text: "text-bear", bg: "bg-[var(--color-bear)]/20", label: "失败" },
  expired: { text: "text-zinc-400", bg: "bg-zinc-400/20", label: "已过期" },
};

const STATUS_REASON_LABELS: Record<string, string> = {
  partial: "部分支付",
  wrong_asset: "币种/网络不匹配",
  waiting: "等待支付",
  confirming: "链上确认中",
  sending: "通道处理中",
  refunded: "已退款",
};

const PROVIDER_STATUS_LABELS: Record<string, string> = {
  waiting: "waiting",
  confirming: "confirming",
  confirmed: "confirmed",
  sending: "sending",
  partially_paid: "partially_paid",
  finished: "finished",
  failed: "failed",
  refunded: "refunded",
  expired: "expired",
};

export function getStatusReasonLabel(statusReason?: string | null): string | null {
  if (!statusReason) {
    return null;
  }
  return STATUS_REASON_LABELS[statusReason] ?? statusReason;
}

export function getProviderStatusLabel(providerStatus?: string | null): string | null {
  if (!providerStatus) {
    return null;
  }
  return PROVIDER_STATUS_LABELS[providerStatus] ?? providerStatus;
}

export function getPaymentStatusMessage(
  status: string,
  statusReason?: string | null,
  isExpired: boolean = false
): string {
  if (status === "completed") {
    return "支付已确认，会员状态已同步。";
  }
  if (status === "failed") {
    if (statusReason === "refunded") {
      return "支付已退款，请重新创建订单。";
    }
    return "支付失败，请重新创建订单。";
  }
  if (status === "expired") {
    return "支付订单已过期，请重新创建订单。";
  }
  if (statusReason === "wrong_asset") {
    return "检测到付款币种或网络与订单不一致，请停止转账并联系管理员处理。";
  }
  if (statusReason === "partial") {
    return "已检测到部分到账，请按原订单补足差额后等待同步。";
  }
  if (statusReason === "confirming") {
    return "已收到转账，正在等待区块链确认。";
  }
  if (statusReason === "sending") {
    return "支付已确认，通道正在完成入账处理。";
  }
  if (isExpired) {
    return "订单倒计时已结束，如已付款请稍候同步。";
  }
  return "等待区块链确认…";
}
