"use client";

import { useCallback, useRef, useState } from "react";
import { X, Download, Loader2, Check } from "lucide-react";

import type { AnalysisReport } from "@/lib/api/analysis";
import { ShareCard, type ShareCardConfig } from "./ShareCard";
import { useTranslations } from "next-intl";

interface ShareModalProps {
  report: AnalysisReport;
  config?: Partial<ShareCardConfig>;
  onClose: () => void;
}

export function ShareModal({ report, config, onClose }: ShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const t = useTranslations("consensus.shareModal");

  const handleSave = useCallback(async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `${report.symbol}_${report.mode}_${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("生成分享图片失败:", err);
    } finally {
      setSaving(false);
    }
  }, [report.symbol, report.mode, saving]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal：移动端限制宽度，避免卡片撑满整屏 */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[92vw] sm:max-w-[420px] flex-col items-center gap-4 rounded-xl bg-zinc-900 border border-white/10 p-4 sm:p-6 shadow-2xl mx-3 sm:mx-0">
        {/* Header */}
        <div className="flex w-full items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{t("title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Card preview：使用 transform scale 来完美自适应显示 */}
        <div className="w-full relative flex justify-center py-2 overflow-y-auto overflow-x-hidden rounded-lg mx-auto custom-scrollbar" style={{ maxHeight: '65vh' }}>
          <div className="origin-top" style={{ transform: 'scale(var(--scale-factor, 1))', transformOrigin: 'top center', marginBottom: 'calc(400px * (var(--scale-factor, 1) - 1))', ['--scale-factor' as string]: 'min(1, calc((100vw - 48px) / 420))' }}>
            <ShareCard ref={cardRef} report={report} config={config} />
          </div>
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saved ? (
            <Check size={16} />
          ) : (
            <Download size={16} />
          )}
          {saving ? t("saving") : saved ? t("saved") : t("save")}
        </button>

        <p className="text-xs text-zinc-500">
          {report.strategy &&
          (report.strategy.entry_low != null ||
            report.strategy.entry_high != null ||
            report.strategy.stop_loss != null ||
            (report.strategy.targets && report.strategy.targets.length > 0))
            ? t("privacyWarning")
            : t("safeToShare")}
        </p>
      </div>
    </div>
  );
}
