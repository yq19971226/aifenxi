"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import type { ReportSection, SignalDirection } from "@/lib/api/analysis";
import { HIDDEN_FIELDS, COLLAPSED_FIELDS } from "./constants";
import {
  fieldLabel,
  formatDirection,
  formatValue,
  getSectionStatusStyle,
  getSectionIcon,
  getSignalStyle,
  isEmpty,
  isFallbackReasoning,
} from "./helpers";
import {
  CollapsibleSection,
  DirectionBadge,
  ObjectArrayTable,
  PriceLevels,
  ReasoningBlock,
  SignalRow,
} from "./renderers";

// ── Data pairs renderer ──────────────────────────────────────

export function DataPairs({ data, hideEmpty = true }: { data: Record<string, unknown>; hideEmpty?: boolean }) {
  const entries = Object.entries(data).filter(([key]) => !HIDDEN_FIELDS.has(key));

  const filtered = entries.filter(([key, value]) => {
    if (key === "reasoning" && typeof value === "string" && isFallbackReasoning(value)) return false;
    if (hideEmpty && isEmpty(value)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return <p className="text-xs text-zinc-500">暂无数据</p>;
  }

  const hasSignalRow = "signal" in data || "confidence" in data || "trend" in data;
  const signalKeys = new Set(["signal", "confidence", "trend"]);
  const hasSupportLevels = Array.isArray(data.support_levels) && data.support_levels.length > 0;
  const hasResistanceLevels = Array.isArray(data.resistance_levels) && data.resistance_levels.length > 0;
  const priceLevelKeys = new Set(["support_levels", "resistance_levels"]);

  return (
    <div className="space-y-2">
      {hasSignalRow && <SignalRow data={data} />}

      {hasSupportLevels && (
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-500">{fieldLabel("support_levels")}</p>
          <PriceLevels levels={data.support_levels as number[]} type="support" />
        </div>
      )}
      {hasResistanceLevels && (
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-500">{fieldLabel("resistance_levels")}</p>
          <PriceLevels levels={data.resistance_levels as number[]} type="resistance" />
        </div>
      )}

      {filtered
        .filter(([key]) => !signalKeys.has(key) && !priceLevelKeys.has(key))
        .map(([key, value]) => {
          if (isEmpty(value)) return null;

          if (key === "reasoning" && typeof value === "string" && value.length > 0) {
            return (
              <div key={key}>
                <p className="mb-1 text-sm font-medium text-zinc-500">{fieldLabel(key)}</p>
                <ReasoningBlock text={value} />
              </div>
            );
          }

          if (key === "key_findings" && typeof value === "string" && value.length > 0) {
            return (
              <div key={key}>
                <p className="mb-1 text-sm font-medium text-zinc-500">{fieldLabel(key)}</p>
                <ReasoningBlock text={value} />
              </div>
            );
          }

          if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            const isCollapsed = COLLAPSED_FIELDS.has(key);
            if (isCollapsed) {
              return (
                <CollapsibleSection key={key} label={fieldLabel(key)}>
                  <DataPairs data={value as Record<string, unknown>} />
                </CollapsibleSection>
              );
            }
            return (
              <div key={key} className="mt-2">
                <p className="mb-1 text-sm font-medium text-zinc-400">{fieldLabel(key)}</p>
                <div className="ml-2 border-l border-white/[0.06] pl-2">
                  <DataPairs data={value as Record<string, unknown>} />
                </div>
              </div>
            );
          }

          if (Array.isArray(value)) {
            const hasObjects = value.length > 0 && typeof value[0] === "object" && value[0] !== null;
            if (hasObjects) {
              return (
                <div key={key} className="mt-2">
                  <p className="mb-1 text-sm font-medium text-zinc-400">
                    {fieldLabel(key)} <span className="text-zinc-500">({value.length})</span>
                  </p>
                  <ObjectArrayTable items={value as Record<string, unknown>[]} />
                </div>
              );
            }
            if (value.length === 0) return null;
            return (
              <div key={key} className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-sm text-zinc-500">{fieldLabel(key)}</span>
                <span className="text-right text-sm font-mono text-zinc-300">
                  {value.map(formatValue).join(", ")}
                </span>
              </div>
            );
          }

          if ((key === "direction" || key === "signal") && typeof value === "string") {
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-sm text-zinc-500">{fieldLabel(key)}</span>
                <DirectionBadge direction={value} />
              </div>
            );
          }

          return (
            <div key={key} className="flex items-start justify-between gap-2">
              <span className="shrink-0 text-sm text-zinc-500">{fieldLabel(key)}</span>
              <span className="text-right text-sm font-mono text-zinc-300">
                {formatValue(value)}
              </span>
            </div>
          );
        })
        .filter(Boolean)}
    </div>
  );
}

// ── Collapsible section card ─────────────────────────────────

export function SectionCard({ section, defaultExpanded = false }: { section: ReportSection; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const statusStyle = getSectionStatusStyle(section.status);
  const sectionIcon = getSectionIcon(section.title);
  const SectionIconComp = sectionIcon.icon;

  const sectionSignal = section.data?.signal as string | undefined;
  const sectionConf = section.data?.confidence as number | undefined;
  const signalColor = sectionSignal === "bullish" ? "text-emerald-400" : sectionSignal === "bearish" ? "text-red-400" : "";

  return (
    <div id={`section-${section.title}`} className="rounded-lg border border-white/[0.06] bg-zinc-900/60">
      {/* Header — clickable */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <SectionIconComp className={`h-3.5 w-3.5 shrink-0 ${sectionIcon.color}`} />
          <span className="truncate text-sm font-medium text-zinc-200">
            {section.title}
          </span>
          {sectionSignal && sectionSignal !== "neutral" && (
            <span className={`text-xs font-semibold ${signalColor}`}>
              {formatDirection(sectionSignal)}
            </span>
          )}
          {typeof sectionConf === "number" && sectionConf > 0 && (
            <span className="text-xs font-mono text-zinc-500">
              {(sectionConf * 100).toFixed(0)}%
            </span>
          )}
          {section.summary && !sectionSignal && (
            <span className="text-xs text-zinc-400 truncate max-w-[260px]">
              {section.summary}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </motion.div>
        </div>
      </button>

      {/* Body — collapsible */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-3 py-3 space-y-3">
              {sectionSignal ? (
                <>
                  {Array.isArray(section.data.key_findings) &&
                    section.data.key_findings.length > 0 && (
                      <ul className="space-y-1.5">
                        {(section.data.key_findings as string[]).map(
                          (f, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2.5 text-sm text-zinc-300 leading-relaxed"
                            >
                              <span
                                className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                                  sectionSignal === "bullish"
                                    ? "bg-emerald-400"
                                    : sectionSignal === "bearish"
                                      ? "bg-red-400"
                                      : "bg-zinc-500"
                                }`}
                              />
                              {String(f)}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  {typeof section.data.reasoning === "string" &&
                    section.data.reasoning.length > 0 &&
                    !isFallbackReasoning(section.data.reasoning as string) && (
                      <ReasoningBlock text={section.data.reasoning as string} />
                    )}
                  {section.data.raw_data &&
                    typeof section.data.raw_data === "object" &&
                    Object.keys(
                      section.data.raw_data as Record<string, unknown>,
                    ).length > 0 && (
                      <CollapsibleSection label="详细数据">
                        <DataPairs
                          data={
                            section.data.raw_data as Record<string, unknown>
                          }
                        />
                      </CollapsibleSection>
                    )}
                </>
              ) : (
                <DataPairs data={section.data} />
              )}
              {section.note && (
                <p className="mt-2 text-xs italic text-zinc-500">
                  {section.note}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
