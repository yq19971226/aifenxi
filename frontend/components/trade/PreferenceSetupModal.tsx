"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X } from "lucide-react";
import type { TradePreferences } from "@/lib/utils/position-sizing";

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20];
const RISK_OPTIONS = [
  { label: "1%", value: 0.01 },
  { label: "2%", value: 0.02 },
  { label: "3%", value: 0.03 },
  { label: "5%", value: 0.05 },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (prefs: TradePreferences) => void;
  defaults: TradePreferences;
  initial?: TradePreferences | null;
}

export function PreferenceSetupModal({
  open,
  onClose,
  onSave,
  defaults,
  initial,
}: Props) {
  const [capital, setCapital] = useState(
    initial?.capital ?? defaults.capital,
  );
  const [leverage, setLeverage] = useState(
    initial?.leverage ?? defaults.leverage,
  );
  const [riskPct, setRiskPct] = useState(
    initial?.riskPct ?? defaults.riskPct,
  );
  const [agreed, setAgreed] = useState(initial?.agreedDisclaimer ?? false);

  useEffect(() => {
    if (open) {
      setCapital(initial?.capital ?? defaults.capital);
      setLeverage(initial?.leverage ?? defaults.leverage);
      setRiskPct(initial?.riskPct ?? defaults.riskPct);
      setAgreed(initial?.agreedDisclaimer ?? false);
    }
  }, [open, initial, defaults]);

  const canSubmit = capital > 0 && agreed;

  function handleSubmit() {
    if (!canSubmit) return;
    onSave({
      capital,
      leverage,
      riskPct,
      agreedDisclaimer: true,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2 }}
            className="card w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">
                  仓位计算偏好设置
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Capital */}
            <div className="mb-5">
              <label className="section-label mb-2 block">可用资金</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={capital}
                  onChange={(e) =>
                    setCapital(Math.max(0, Number(e.target.value)))
                  }
                  className="input w-full pr-16"
                  placeholder="10000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500">
                  USDT
                </span>
              </div>
            </div>

            {/* Leverage */}
            <div className="mb-5">
              <label className="section-label mb-2 block">杠杆倍数</label>
              <div className="flex gap-2">
                {LEVERAGE_OPTIONS.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setLeverage(lv)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                      leverage === lv
                        ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-400"
                        : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04]"
                    }`}
                  >
                    {lv}x
                  </button>
                ))}
              </div>
            </div>

            {/* Risk Percentage */}
            <div className="mb-5">
              <label className="section-label mb-2 block">
                单笔风险比例
              </label>
              <div className="flex gap-2">
                {RISK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRiskPct(opt.value)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                      riskPct === opt.value
                        ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-400"
                        : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <label className="flex items-start gap-2 mb-6 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 rounded border-white/[0.16] bg-white/[0.02] text-indigo-500 focus:ring-indigo-500/30"
              />
              <span className="text-xs text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors">
                我已了解仓位计算结果仅为基于输入参数的数学计算，不构成任何投资建议。交易有风险，请自行判断。
              </span>
            </label>

            {/* Submit */}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              保存偏好
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
