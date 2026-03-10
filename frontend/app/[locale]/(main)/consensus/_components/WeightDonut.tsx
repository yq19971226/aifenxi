"use client";

import { useTranslations } from "next-intl";
import { MODEL_COLORS, MODEL_NAMES } from "./consensus-config";

const DONUT_SIZE = 160;
const DONUT_RADIUS = 55;
const DONUT_STROKE = 18;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function WeightDonut({ weights }: { weights: Record<string, number> }) {
  const t = useTranslations("consensus");
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let accumulated = 0;
  const segments = entries.map(([key, w]) => {
    const pct = total > 0 ? w / total : 0;
    const offset = accumulated;
    accumulated += pct;
    const c = MODEL_COLORS[key] ?? MODEL_COLORS.deepseek;
    return { key, pct, offset, hex: c.hex };
  });

  return (
    <div className="card-surface rounded-lg p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {t("weights.title")}
      </p>
      <div className="mt-3 flex flex-col items-center gap-3">
        <div className="relative" style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
          <svg width={DONUT_SIZE} height={DONUT_SIZE} className="-rotate-90">
            <circle
              cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={DONUT_STROKE}
            />
            {segments.map((seg) => (
              <circle
                key={seg.key} cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS}
                fill="none" stroke={seg.hex} strokeWidth={DONUT_STROKE}
                strokeDasharray={`${seg.pct * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE}`}
                strokeDashoffset={-seg.offset * DONUT_CIRCUMFERENCE} strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-lg font-bold text-zinc-200">{entries.length}</span>
            <span className="text-xs text-zinc-500">{t("weights.models")}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {entries.map(([key, w]) => {
            const c = MODEL_COLORS[key] ?? MODEL_COLORS.deepseek;
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${c.bg}`} />
                <span className="text-xs text-zinc-400">{MODEL_NAMES[key] ?? key}</span>
                <span className="font-mono text-xs text-zinc-300">
                  {(w * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
