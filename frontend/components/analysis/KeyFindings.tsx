"use client";

import type { ReportSection } from "@/lib/api/analysis";

// ── Key findings summary ─────────────────────────────────────

export function KeyFindingsSummary({ sections }: { sections: ReportSection[] }) {
  const allFindings: { text: string; signal: string }[] = [];

  sections.forEach((s) => {
    if (s.status !== "completed" || !s.data) return;
    const kf = s.data.key_findings;
    const sig = String(s.data.signal || "neutral");
    if (Array.isArray(kf)) {
      kf.slice(0, 3).forEach((item) => {
        const text = typeof item === "string" ? item : JSON.stringify(item);
        if (text && text.length > 2) allFindings.push({ text, signal: sig });
      });
    }
  });

  if (allFindings.length === 0) return null;

  const display = allFindings.slice(0, 10);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        关键发现
      </p>
      <ul className="space-y-2">
        {display.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                f.signal === "bullish"
                  ? "bg-emerald-400"
                  : f.signal === "bearish"
                    ? "bg-red-400"
                    : "bg-zinc-500"
              }`}
            />
            <span className="text-sm text-zinc-300 leading-relaxed">
              {f.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
