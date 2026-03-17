"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { EmptyPerformance } from "@/components/ui/EmptyState";

// ── Props ────────────────────────────────────────────────────

export interface AgentAccuracyCardProps {
  byAgent: Record<string, number>;
}

// ── Constants ────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  technical: "技术分析",
  onchain: "链上解读",
  adversarial: "对抗推演",
  risk: "风险预警",
};

const BAR_COLOR = "rgb(99,102,241)";
const BAR_BG = "rgba(255,255,255,0.06)";

// ── Helpers ──────────────────────────────────────────────────

function agentLabel(agentId: string): string {
  return AGENT_LABELS[agentId] ?? agentId;
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 70) return "text-emerald-400";
  if (accuracy >= 50) return "text-indigo-400";
  return "text-red-400";
}

interface RankedAgent {
  id: string;
  accuracy: number;
}

// ── Component ────────────────────────────────────────────────

export function AgentAccuracyCard({ byAgent }: AgentAccuracyCardProps) {
  const ranked: RankedAgent[] = useMemo(() => {
    return Object.entries(byAgent)
      .map(([id, accuracy]) => ({ id, accuracy }))
      .sort((a, b) => b.accuracy - a.accuracy);
  }, [byAgent]);

  const maxAccuracy = useMemo(
    () => Math.max(...ranked.map((r) => r.accuracy), 1),
    [ranked],
  );

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
    >
      <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
        智能体准确率排行
      </p>

      {ranked.length === 0 ? (
        <EmptyPerformance />
      ) : (
        <div className="flex flex-col gap-3">
          {ranked.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              {/* Label row */}
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  {i + 1}. {agentLabel(agent.id)}
                </span>
                <span
                  className={`text-xs font-mono font-semibold ${accuracyColor(agent.accuracy)}`}
                >
                  {agent.accuracy.toFixed(1)}%
                </span>
              </div>

              {/* Bar */}
              <div
                className="h-2 w-full rounded-full overflow-hidden"
                style={{ background: BAR_BG }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: BAR_COLOR }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(agent.accuracy / maxAccuracy) * 100}%`,
                  }}
                  transition={{ delay: i * 0.06 + 0.1, duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
