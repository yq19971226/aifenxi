"use client";

import { useState, useMemo } from "react";
import { Settings, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useTradePreferences } from "@/lib/hooks/useTradePreferences";
import {
  calculatePosition,
  type PositionInput,
  type PositionResult,
} from "@/lib/utils/position-sizing";
import { StrategyQualityBadge } from "./StrategyQualityBadge";
import { PreferenceSetupModal } from "./PreferenceSetupModal";
import { formatPrice } from "@/components/analysis/helpers";

interface Props {
  input: PositionInput;
  isWorthTaking?: boolean;
  confidence?: number;
  isFallback?: boolean;
}

export function PositionCalculator({
  input,
  isWorthTaking = true,
  confidence = 0.5,
  isFallback = false,
}: Props) {
  const { preferences, loaded, defaults, savePreferences, needsSetup } =
    useTradePreferences();
  const [showModal, setShowModal] = useState(false);

  const result: PositionResult | null = useMemo(() => {
    if (!preferences) return null;
    return calculatePosition(input, preferences);
  }, [input, preferences]);

  if (!loaded) return null;

  // 隐藏条件：fallback 或 neutral — 直接不渲染
  if (isFallback || input.direction === "neutral") return null;

  // 首次引导
  if (needsSetup) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="card p-4 w-full text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-1">
            <Settings size={14} className="text-indigo-400" />
            <span className="text-xs font-medium text-white">仓位计算器</span>
          </div>
          <p className="text-xs text-zinc-500">
            设置资金偏好后查看仓位建议 →
          </p>
        </button>
        <PreferenceSetupModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onSave={savePreferences}
          defaults={defaults}
        />
      </>
    );
  }

  if (!result) return null;

  const isLong = input.direction === "long";

  return (
    <>
      <div className="card p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLong ? (
              <TrendingUp size={14} className="text-emerald-400" />
            ) : (
              <TrendingDown size={14} className="text-red-400" />
            )}
            <span className="text-xs font-medium text-white">仓位计算器</span>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="text-zinc-500 hover:text-indigo-400 transition-colors"
            title="修改偏好"
          >
            <Settings size={14} />
          </button>
        </div>

        {/* Warning for low quality */}
        {!isWorthTaking && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400/80">
              策略盈亏比不足或置信度偏低，请谨慎参考
            </p>
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-2">
          <MetricCell label="保证金" value={fmtUSD(result.margin)} />
          <MetricCell label="名义仓位" value={fmtUSD(result.positionSize)} />
          <MetricCell
            label="最大亏损"
            value={fmtUSD(result.maxLoss)}
            valueClass="text-red-400"
          />
        </div>

        {/* Target results */}
        {result.targetResults.length > 0 && (
          <div>
            <p className="section-label mb-2">目标收益</p>
            <div className="space-y-1.5">
              {result.targetResults.map((tr, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md bg-white/[0.02] border border-white/[0.06] px-3 py-1.5"
                >
                  <span className="text-xs md:text-sm text-zinc-400">
                    TP{i + 1}: {formatPrice(tr.price)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs md:text-sm font-mono text-emerald-400">
                      +{fmtUSD(tr.profit)}
                    </span>
                    <span className="text-xs md:text-sm font-mono text-zinc-500">
                      R:R {tr.riskRewardRatio}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quality badge */}
        <div className="flex items-center justify-between">
          <StrategyQualityBadge
            isWorthTaking={isWorthTaking}
            confidence={confidence}
          />
          <span className="text-xs text-zinc-500">
            {preferences?.leverage}x · {((preferences?.riskPct ?? 0) * 100).toFixed(0)}% 风险
          </span>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-zinc-500 border-t border-white/[0.04] pt-2">
          以上为基于您输入参数的数学计算结果，不构成投资建议
        </p>
      </div>

      <PreferenceSetupModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSave={savePreferences}
        defaults={defaults}
        initial={preferences}
      />
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────

function MetricCell({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md bg-white/[0.02] border border-white/[0.06] p-2.5">
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className={`text-sm font-mono font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

