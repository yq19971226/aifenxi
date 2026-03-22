"use client";

import { useState, useMemo } from "react";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTradePreferences } from "@/lib/hooks/useTradePreferences";
import { calculatePosition, type PositionInput } from "@/lib/utils/position-sizing";
import { PreferenceSetupModal } from "./PreferenceSetupModal";

interface Props {
  input: PositionInput;
}

export function PositionSummary({ input }: Props) {
  const t = useTranslations("position.calculator");
  const { preferences, loaded, defaults, savePreferences, needsSetup } =
    useTradePreferences();
  const [showModal, setShowModal] = useState(false);

  const result = useMemo(() => {
    if (!preferences) return null;
    return calculatePosition(input, preferences);
  }, [input, preferences]);

  if (!loaded) return null;

  if (input.direction === "neutral" || input.entryPrice <= 0) return null;

  // 首次引导 — 不再静默隐藏
  if (needsSetup) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-400 transition-colors"
        >
          <Settings size={12} />
          <span>{t("summarySetupHint")}</span>
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

  return (
    <>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-zinc-500">
          {t("summaryMargin")}{" "}
          <span className="font-mono text-white">${result.margin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
        <span className="text-zinc-500">
          {t("summaryMaxLoss")}{" "}
          <span className="font-mono text-red-400">
            ${result.maxLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({((preferences?.riskPct ?? 0) * 100).toFixed(0)}%)
          </span>
        </span>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="text-zinc-400 hover:text-indigo-400 transition-colors ml-auto"
          title={t("editPrefs")}
        >
          <Settings size={12} />
        </button>
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
