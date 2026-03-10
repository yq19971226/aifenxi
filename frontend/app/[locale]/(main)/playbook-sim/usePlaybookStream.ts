"use client";

import { useState, useCallback, useRef } from "react";
import {
  runPlaybookSimStream,
  type SimResult,
  type PlaybookMatch,
  type DealerPrediction,
  type DefenseStrategy,
  type JudgeAdoption,
} from "@/lib/api/playbook-sim";
import { type StepStatus, type StepStatuses, INITIAL_STEP_STATUS } from "./playbook-constants";

export function usePlaybookStream() {
  const [sim, setSim] = useState<SimResult | null>(null);
  const [stepStatus, setStepStatus] = useState<StepStatuses>(INITIAL_STEP_STATUS);
  const [streaming, setStreaming] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runStream = useCallback(async (sym: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStreaming(true);
    setSimError(null);
    setSim(null);
    setStepStatus({ ...INITIAL_STEP_STATUS, data: "running" });

    try {
      for await (const event of runPlaybookSimStream(sym)) {
        if (ctrl.signal.aborted) break;

        switch (event.type) {
          case "progress":
            setStepStatus((prev) => ({
              ...prev,
              ...(event.step === "data" ? { data: "running" } : {}),
              ...(event.step === "L1" ? { data: "done", L1: "running" } : {}),
              ...(event.step === "L2" ? { L1: "done", L2: "running" } : {}),
              ...(event.step === "L3" ? { L2: "done", L3: "running" } : {}),
              ...(event.step === "L4" ? { L3: "done", L4: "running" } : {}),
            }));
            break;

          case "step_done":
            setStepStatus((prev) => ({ ...prev, [event.step]: "done" as StepStatus }));
            if (event.step === "L1" && event.data) {
              setSim((prev) => ({
                ...(prev || {} as SimResult),
                top_matches: (event.data as Record<string, unknown>).top_matches as PlaybookMatch[],
                total_playbooks: (event.data as Record<string, unknown>).total_playbooks as number,
              }));
            }
            if (event.step === "L2" && event.data) {
              setSim((prev) => prev ? { ...prev, dealer_prediction: event.data as unknown as DealerPrediction } : prev);
            }
            if (event.step === "L3" && event.data) {
              setSim((prev) => prev ? { ...prev, defense_strategy: event.data as unknown as DefenseStrategy } : prev);
            }
            if (event.step === "L4" && event.data) {
              setSim((prev) => prev ? { ...prev, judge_adoption: event.data as unknown as JudgeAdoption } : prev);
            }
            break;

          case "step_fail":
            setStepStatus((prev) => ({ ...prev, [event.step]: "failed" as StepStatus }));
            break;

          case "complete": {
            setSim(event.result);
            const keep = (s: StepStatus) => s === "failed" || s === "idle" ? s : "done" as StepStatus;
            setStepStatus((prev) => ({
              data: "done", L1: keep(prev.L1), L2: keep(prev.L2), L3: keep(prev.L3), L4: keep(prev.L4),
            }));
            break;
          }

          case "cached":
            setSim(event.result);
            setStepStatus({ data: "done", L1: "done", L2: "done", L3: "done", L4: "done" });
            break;

          case "error":
            setSimError(event.message);
            break;
        }
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setSimError(err instanceof Error ? err.message : "SSE 连接失败");
      }
    } finally {
      setStreaming(false);
    }
  }, []);

  const abort = useCallback(() => { abortRef.current?.abort(); }, []);

  return { sim, stepStatus, streaming, simError, runStream, abort };
}
