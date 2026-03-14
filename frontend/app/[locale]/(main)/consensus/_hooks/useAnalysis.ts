"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  runAnalysis,
  type AnalysisMode,
  type AnalysisReport,
  type ProgressEvent,
} from "@/lib/api/analysis";

interface UseAnalysisReturn {
  running: boolean;
  startTime: number | undefined;
  progressSteps: ProgressEvent[];
  analysisReport: AnalysisReport | null;
  error: string | null;
  handleStart: (forceRefresh?: boolean) => Promise<void>;
  handleAbort: () => void;
}

export function useAnalysis(
  symbol: string,
  mode: AnalysisMode,
  canStart: boolean,
): UseAnalysisReturn {
  const [running, setRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | undefined>(undefined);
  const [progressSteps, setProgressSteps] = useState<ProgressEvent[]>([]);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef(false);
  const queryClient = useQueryClient();
  const locale = useLocale();

  const handleAbort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const handleStart = useCallback(
    async (forceRefresh = false) => {
      if (running || !symbol.trim() || !canStart) return;

      abortRef.current = false;
      setRunning(true);
      setStartTime(Date.now());
      setProgressSteps([]);
      setAnalysisReport(null);
      setError(null);

      try {
        for await (const event of runAnalysis(symbol, mode, forceRefresh, locale)) {
          if (abortRef.current) break;
          let shouldStop = false;
          switch (event.type) {
            case "progress":
              setProgressSteps((prev) => {
                const idx = prev.findIndex((s) => s.step === event.step);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = event;
                  return updated;
                }
                return [...prev, event];
              });
              break;
            case "complete":
            case "cached":
              setAnalysisReport(event.report);
              shouldStop = true;
              break;
            case "error":
              setError(event.message);
              shouldStop = true;
              break;
          }
          if (shouldStop) break;
        }
      } catch (err: unknown) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : "连接中断，请重试");
        }
      } finally {
        setRunning(false);
        setStartTime(undefined);
        queryClient.invalidateQueries({ queryKey: ["analysis-quota"] });
        queryClient.invalidateQueries({ queryKey: ["consensus", symbol] });
      }
    },
    [running, symbol, mode, canStart, queryClient, locale],
  );

  return { running, startTime, progressSteps, analysisReport, error, handleStart, handleAbort };
}
