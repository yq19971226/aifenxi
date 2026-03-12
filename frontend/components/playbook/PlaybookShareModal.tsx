"use client";

import { useCallback, useRef, useState } from "react";
import { X, Download, Loader2, Check } from "lucide-react";
import type { SimResult } from "@/lib/api/playbook-sim";
import type { PlaybookLatest } from "@/lib/api/playbook";
import { PlaybookShareCard } from "./PlaybookShareCard";

interface Props {
  sim: SimResult;
  latest?: PlaybookLatest | null;
  onClose: () => void;
}

export function PlaybookShareModal({ sim, latest, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      link.download = `${sim.symbol}_playbook_${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("生成分享图片失败:", err);
    } finally {
      setSaving(false);
    }
  }, [sim.symbol, saving]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[92vw] sm:max-w-[420px] flex-col items-center gap-4 rounded-xl bg-zinc-900 border border-white/10 p-4 sm:p-6 shadow-2xl mx-3 sm:mx-0">
        <div className="flex w-full items-center justify-between">
          <h3 className="text-sm font-semibold text-white">预览剧本分享卡片</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="w-full overflow-auto rounded-lg flex justify-center">
          <PlaybookShareCard ref={cardRef} sim={sim} latest={latest} />
        </div>

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
          {saving ? "生成中…" : saved ? "已保存" : "保存图片"}
        </button>

        <p className="text-xs text-zinc-500">不含具体点位，可安全分享</p>
      </div>
    </div>
  );
}
