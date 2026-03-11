"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import type { ReportSection } from "@/lib/api/analysis";
import { HIDDEN_FIELDS, COLLAPSED_FIELDS } from "./constants";
import {
  fieldLabel,
  formatDirection,
  formatValue,
  getSectionStatusStyle,
  getSectionIcon,
  isEmpty,
  isFallbackReasoning,
  localizeText,
} from "./helpers";
import {
  CollapsibleSection,
  DirectionBadge,
  ObjectArrayTable,
  PriceLevels,
  PreviewList,
  ReasoningBlock,
  SignalRow,
} from "./renderers";
import { FvgTable, OrderBlockTable, GenericObjectTable } from "./StructuredTables";
import { AdversarialRenderer } from "./AdversarialRenderer";
import { CollusionRenderer } from "./CollusionRenderer";
import { PlaybookRenderer } from "./PlaybookRenderer";

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

          // key_findings 正常为 string[]，但后端降级/fallback 时可能返回单个 string
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
            // Specialized renderers for known data types
            if (key === "fvg_list" && value.length > 0 && typeof value[0] === "object") {
              return <div key={key} className="mt-2"><FvgTable items={value as Record<string, unknown>[]} /></div>;
            }
            if (key === "order_blocks" && value.length > 0 && typeof value[0] === "object") {
              return <div key={key} className="mt-2"><OrderBlockTable items={value as Record<string, unknown>[]} /></div>;
            }

            const hasObjects = value.length > 0 && typeof value[0] === "object" && value[0] !== null;
            if (hasObjects) {
              // Use pattern-aware renderer for patterns, generic table for everything else
              const isPattern = value[0] && "pattern_name" in (value[0] as Record<string, unknown>);
              if (isPattern) {
                return (
                  <div key={key} className="mt-2">
                    <p className="mb-1 text-sm font-medium text-zinc-400">
                      {fieldLabel(key)} <span className="text-zinc-500">({value.length})</span>
                    </p>
                    <ObjectArrayTable items={value as Record<string, unknown>[]} />
                  </div>
                );
              }
              return (
                <div key={key} className="mt-2">
                  <GenericObjectTable items={value as Record<string, unknown>[]} label={fieldLabel(key)} />
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

export function SectionCard({
  section,
  defaultExpanded = false,
  forceExpandToken,
}: {
  section: ReportSection;
  defaultExpanded?: boolean;
  forceExpandToken?: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const statusStyle = getSectionStatusStyle(section.status);
  const sectionIcon = getSectionIcon(section.title);
  const SectionIconComp = sectionIcon.icon;

  const rawSignal = section.data?.signal;
  const sectionSignal = typeof rawSignal === "string" ? rawSignal : undefined;
  const rawConf = section.data?.confidence;
  const sectionConf = typeof rawConf === "number" ? rawConf : undefined;
  const signalColor = sectionSignal === "bullish" ? "text-emerald-400" : sectionSignal === "bearish" ? "text-red-400" : "";

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, section]);

  useEffect(() => {
    if (typeof forceExpandToken === "number") {
      setExpanded(true);
    }
  }, [forceExpandToken]);

  const glowClass = sectionSignal === "bullish" ? "glow-green" : sectionSignal === "bearish" ? "glow-red" : "";

  return (
    <div id={`section-${section.title}`} className={`glass-card overflow-hidden transition-all duration-300 ${glowClass}`}>
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
              {localizeText(section.summary)}
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
                      <PreviewList
                        items={section.data.key_findings as string[]}
                        renderItem={(f, idx) => (
                          <li
                            key={`${section.title}-${idx}`}
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
                            {localizeText(String(f))}
                          </li>
                        )}
                      />
                    )}
                  {typeof section.data.reasoning === "string" &&
                    section.data.reasoning.length > 0 &&
                    !isFallbackReasoning(section.data.reasoning as string) && (
                      <ReasoningBlock text={section.data.reasoning as string} />
                    )}
                  {section.title === "对抗推演" && section.data.raw_data ? (
                    <AdversarialRenderer data={section.data.raw_data as any} />
                  ) : section.title === "合谋检测" && section.data.raw_data ? (
                    <CollusionRenderer data={section.data.raw_data as any} />
                  ) : (section.title === "剧本推演" || section.title === "剧本匹配") && section.data.raw_data ? (
                    <PlaybookRenderer data={section.data.raw_data as any} />
                  ) : (
                    section.data.raw_data &&
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
                    )
                  )}
                </>
              ) : (
                <DataPairs data={section.data} />
              )}
              {section.note && (
                <p className="mt-2 text-xs italic text-zinc-500">
                  {localizeText(section.note)}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
