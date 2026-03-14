"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TradePreferences } from "@/lib/utils/position-sizing";

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20];
const RISK_OPTIONS = [
  { label: "1%", value: 0.01 },
  { label: "2%", value: 0.02 },
  { label: "3%", value: 0.03 },
  { label: "5%", value: 0.05 },
];

const TOTAL_STEPS = 3;

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
  const t = useTranslations("position.modal");
  const [step, setStep] = useState(1);
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
      setStep(initial?.agreedDisclaimer ? 1 : 1); // always start step 1
    }
  }, [open, initial, defaults]);

  const canNext =
    step === 1 ? capital > 0 :
    step === 2 ? true :
    agreed;

  function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      // Final step — save
      onSave({
        capital,
        leverage,
        riskPct,
        agreedDisclaimer: true,
        updatedAt: new Date().toISOString(),
      });
      onClose();
    }
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
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">
                  {t("title")}
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

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i + 1 <= step ? "bg-indigo-500" : "bg-white/[0.06]"
                  }`}
                />
              ))}
              <span className="text-[10px] text-zinc-500 ml-1 shrink-0">
                {t("stepIndicator", { current: step, total: TOTAL_STEPS })}
              </span>
            </div>

            {/* Step Content */}
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                >
                  <h4 className="text-sm font-medium text-white mb-1">{t("step1Title")}</h4>
                  <p className="text-xs text-zinc-500 mb-4">{t("step1Desc")}</p>
                  <label className="section-label mb-2 block">{t("capitalLabel")}</label>
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
                      autoFocus
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500">
                      {t("capitalUnit")}
                    </span>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                >
                  <h4 className="text-sm font-medium text-white mb-1">{t("step2Title")}</h4>
                  <p className="text-xs text-zinc-500 mb-4">{t("step2Desc")}</p>

                  <label className="section-label mb-2 block">{t("leverageLabel")}</label>
                  <p className="text-[10px] text-zinc-500 mb-2">{t("leverageHint")}</p>
                  <div className="flex gap-2 mb-5">
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

                  <label className="section-label mb-2 block">{t("riskLabel")}</label>
                  <p className="text-[10px] text-zinc-500 mb-2">{t("riskHint")}</p>
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
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                >
                  <h4 className="text-sm font-medium text-white mb-1">{t("step3Title")}</h4>
                  <p className="text-xs text-zinc-500 mb-4">{t("step3Desc")}</p>

                  {/* Summary */}
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 mb-4 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-zinc-500">{t("capitalLabel")}</p>
                      <p className="text-sm font-mono text-white">${capital.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500">{t("leverageLabel")}</p>
                      <p className="text-sm font-mono text-white">{leverage}x</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500">{t("riskLabel")}</p>
                      <p className="text-sm font-mono text-white">{(riskPct * 100).toFixed(0)}%</p>
                    </div>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 rounded border-white/[0.16] bg-white/[0.02] text-indigo-500 focus:ring-indigo-500/30"
                    />
                    <span className="text-xs text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors">
                      {t("disclaimerText")}
                    </span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-6">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  <ChevronLeft size={14} />
                  {t("prev")}
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                disabled={!canNext}
                onClick={handleNext}
                className="btn-primary flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step < TOTAL_STEPS ? (
                  <>
                    {t("next")}
                    <ChevronRight size={14} />
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    {t("save")}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
