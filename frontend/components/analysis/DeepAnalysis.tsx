"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Brain, Swords } from "lucide-react";

import type { ReportSection } from "@/lib/api/analysis";
import { groupSections } from "./helpers";
import { SectionCard } from "./SectionCard";

// ── Tab configuration ────────────────────────────────────────

const REPORT_TABS = [
  { key: "agents" as const, label: "智能体", icon: Brain },
  { key: "structure" as const, label: "市场结构", icon: BarChart3 },
  { key: "adversarial" as const, label: "AI 对抗", icon: Swords },
];

type TabKey = "agents" | "structure" | "adversarial";

const TAB_GROUP_MAP: Record<string, TabKey> = {
  "核心分析": "agents",
  "市场结构": "structure",
  "AI 对抗": "adversarial",
};

// ── Deep analysis (Layer 3) ──────────────────────────────────

export function DeepAnalysis({
  sections,
  reportKey,
}: {
  sections: ReportSection[];
  reportKey: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("agents");
  const [jumpTarget, setJumpTarget] = useState<{ title: string; token: number } | null>(null);
  const { tabGroups, visibleTabs } = useMemo(() => {
    const { groups, ungrouped } = groupSections(sections);
    const nextTabGroups = new Map<TabKey, { label: string; sections: ReportSection[] }[]>();

    for (const g of groups) {
      const tabKey = TAB_GROUP_MAP[g.label];
      if (!tabKey) continue;
      const arr = nextTabGroups.get(tabKey) || [];
      arr.push(g);
      nextTabGroups.set(tabKey, arr);
    }

    if (ungrouped.length > 0) {
      const arr = nextTabGroups.get("agents") || [];
      arr.push({ label: "其他", sections: ungrouped });
      nextTabGroups.set("agents", arr);
    }

    const nextVisibleTabs = REPORT_TABS.filter((tab) => {
      return (nextTabGroups.get(tab.key)?.reduce((n, g) => n + g.sections.length, 0) ?? 0) > 0;
    });

    return { tabGroups: nextTabGroups, visibleTabs: nextVisibleTabs };
  }, [sections]);

  const effectiveTab = visibleTabs.some((t) => t.key === activeTab)
    ? activeTab
    : (visibleTabs[0]?.key ?? "agents");

  useEffect(() => {
    const handleJump = (event: Event) => {
      const title = (event as CustomEvent<string>).detail;
      const targetTab = REPORT_TABS.find((tab) =>
        (tabGroups.get(tab.key) || []).some((group) =>
          group.sections.some((section) => section.title === title),
        ),
      )?.key;
      if (!targetTab) return;
      setActiveTab(targetTab);
      setJumpTarget({ title, token: Date.now() });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById(`section-${title}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    };

    window.addEventListener(
      "analysis:jump-to-section",
      handleJump as EventListener,
    );
    return () => {
      window.removeEventListener(
        "analysis:jump-to-section",
        handleJump as EventListener,
      );
    };
  }, [tabGroups]);

  useEffect(() => {
    if (!jumpTarget) return;
    const timer = window.setTimeout(() => {
      setJumpTarget((current) =>
        current?.token === jumpTarget.token ? null : current,
      );
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [jumpTarget]);

  if (visibleTabs.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = effectiveTab === tab.key;
          const count = tabGroups.get(tab.key)?.reduce((n, g) => n + g.sections.length, 0) ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {count > 0 && (
                <span className="ml-1 text-xs text-zinc-500 font-mono">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={effectiveTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <div className="space-y-2">
            {(tabGroups.get(effectiveTab) || []).map((group) => (
              <div key={group.label} className="space-y-2">
                {(tabGroups.get(effectiveTab)?.length ?? 0) > 1 && (
                  <div className="flex items-center gap-2 pt-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="text-xs uppercase tracking-widest text-zinc-500 font-medium shrink-0">
                      {group.label}
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                )}
                <div className="space-y-2">
                  {group.sections.map((section, idx) => (
                    <SectionCard
                      key={`${reportKey}-${section.title}-${idx}`}
                      section={section}
                      defaultExpanded={false}
                      forceExpandToken={jumpTarget?.title === section.title ? jumpTarget.token : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
