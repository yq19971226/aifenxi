"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { motion } from "framer-motion";
import { Target, Shield, Zap, Brain, Activity, Clock } from "lucide-react";
import { PositionSummary } from "@/components/trade/PositionSummary";
import { OnchainSection } from "@/components/dashboard/OnchainSection";
import { fromSymbolOverview } from "@/lib/utils/position-sizing";
import { formatPrice } from "@/lib/utils/format";
import { useDateFormatter, useNumberFormatter } from "@/lib/i18n/formatters";
import type { SymbolOverview } from "@/lib/api/dashboard";
import type { PlanCapabilities } from "@/lib/api/onchain";
import { localizeText } from "@/components/analysis/helpers";

interface ExpandedDetailProps {
  item: SymbolOverview;
  capabilities?: PlanCapabilities["user_capabilities"] | null;
}

export function ExpandedDetail({ item, capabilities = null }: ExpandedDetailProps) {
  const locale = useLocale();
  const { formatDateTime } = useDateFormatter();
  const { formatNumber } = useNumberFormatter();
  
  return (
    <tr>
      <td colSpan={100} className="px-0 py-0">
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="border-t border-white/[0.04] bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 策略摘要 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Target size={13} className="text-blue-400" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{"策略摘要"}</p>
                </div>
                {item.entry_low != null && item.entry_high != null ? (
                  <div className="space-y-2 text-xs md:text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">{"入场区间"}</span>
                      <span className="font-mono text-zinc-200 bg-white/[0.04] px-2 py-0.5 rounded">
                        {formatPrice(item.entry_low)} – {formatPrice(item.entry_high)}
                      </span>
                    </div>
                    {item.stop_loss != null && (
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500">{"止损"}</span>
                        <span className="font-mono text-red-400 bg-red-500/[0.08] px-2 py-0.5 rounded">
                          {formatPrice(item.stop_loss)}
                        </span>
                      </div>
                    )}
                    {item.targets?.length > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500">{"目标价"}</span>
                        <span className="font-mono text-emerald-400 bg-emerald-500/[0.08] px-2 py-0.5 rounded">
                          {item.targets.map((t) => formatPrice(t)).join(" / ")}
                        </span>
                      </div>
                    )}
                    {item.risk_reward_ratio > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500">{"风险回报比"}</span>
                        <span className="font-mono text-zinc-200 bg-white/[0.04] px-2 py-0.5 rounded">
                          1:{formatNumber(item.risk_reward_ratio, 1)}
                        </span>
                      </div>
                    )}
                    {item.strategy_updated_at && (
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500 flex items-center gap-1"><Clock size={10} />{"策略更新"}</span>
                        <span className="text-zinc-400">
                          {formatDateTime(item.strategy_updated_at)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">{"暂无策略数据"}</p>
                )}
              </div>

              {/* 防御状态 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield size={13} className="text-emerald-400" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{"防御状态"}</p>
                </div>
                <div className="space-y-2 text-xs md:text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">{"庄家意图"}</span>
                    <span className="text-zinc-300">{item.dealer_intent ? localizeText(item.dealer_intent) : "未检测"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">{"合谋检测"}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.collusion_detected
                        ? "bg-red-500/10 text-red-400"
                        : "bg-emerald-500/10 text-emerald-400"
                    }`}>
                      {item.collusion_detected ? "异常" : "正常"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 快捷入口 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap size={13} className="text-yellow-400" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{"快捷操作"}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/${locale}/consensus?symbol=${item.symbol}`}
                    className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Brain size={12} />
                    {"综合分析"}
                  </Link>
                  <Link
                    href={`/${locale}/adversarial?symbol=${item.symbol}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/[0.08] text-zinc-300 hover:bg-white/[0.04] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Activity size={12} />
                    {"对抗推演"}
                  </Link>
                </div>
              </div>
            </div>

            {/* On-chain data section */}
            <div className="mt-4">
              <OnchainSection symbol={item.symbol} capabilities={capabilities} />
            </div>

            {/* Position summary */}
            {item.entry_low != null && item.stop_loss != null && (
              <div className="mt-4">
                <PositionSummary input={fromSymbolOverview(item)} />
              </div>
            )}

            {/* AI 简评 */}
            {item.reasoning && (
              <div className="mt-4 rounded-lg bg-white/[0.02] border border-white/[0.06] p-3.5">
                <div className="flex items-start gap-2">
                  <Brain size={13} className="text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs md:text-sm text-zinc-400 leading-relaxed line-clamp-3">
                    {localizeText(item.reasoning)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </td>
    </tr>
  );
}
