"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  RefreshCw, Target, AlertTriangle,
  Loader2, BookOpen, Share2,
} from "lucide-react";
import {
  fetchPlazaFeed,
  fetchPlazaStats,
  type PlazaFeed,
  type PlazaStats,
} from "@/lib/api/playbook-sim";
import {
  fetchPlaybookLatest,
  fetchPhaseHistory,
  type PlaybookLatest,
  type PhaseHistory,
} from "@/lib/api/playbook";
import { SymbolSelector } from "@/components/layout/SymbolSelector";
import { useFeatureFlags } from "@/lib/hooks/useFeatureFlags";
import { MaintenancePlaceholder } from "@/components/layout/MaintenancePlaceholder";
import { PositionCalculator } from "@/components/trade/PositionCalculator";
import { fromDefenseStrategy } from "@/lib/utils/position-sizing";
import { localizeText } from "@/components/analysis/helpers";
import { SIGNAL_MAP, getMarketStructureLabel } from "./playbook-constants";
import { usePlaybookStream } from "./usePlaybookStream";
import AdversarialL4 from "./AdversarialL4";
import PlaybookStoryline from "./PlaybookStoryline";
import MatchCard from "./MatchCard";
import PlazaSection from "./PlazaSection";
import AnalysisColumn from "./AnalysisColumn";
import { PlaybookShareModal } from "@/components/playbook/PlaybookShareModal";

export default function PlaybookSimPage() {
  const t = useTranslations('playbook-sim');
  const { getState } = useFeatureFlags();
  const playbookState = getState("playbook");

  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || "BTCUSDT";
  const [symbol, setSymbol] = useState(initialSymbol);
  const [expandedMatch, setExpandedMatch] = useState<number>(0);
  const [showShare, setShowShare] = useState(false);

  const { sim, stepStatus, streaming, simError, runStream, abort } = usePlaybookStream();

  useEffect(() => {
    if (symbol) runStream(symbol);
    return () => { abort(); };
  }, [symbol, runStream, abort]);

  const { data: latest } = useQuery<PlaybookLatest | null>({
    queryKey: ["playbookLatest", symbol],
    queryFn: () => fetchPlaybookLatest(symbol),
    enabled: !!symbol,
    retry: false,
    staleTime: 30_000,
  });

  const { data: phaseHistory } = useQuery<PhaseHistory | null>({
    queryKey: ["phaseHistory", symbol],
    queryFn: () => fetchPhaseHistory(symbol),
    enabled: !!symbol,
    retry: false,
    staleTime: 30_000,
  });

  const { data: plaza, isLoading: plazaLoading } = useQuery<PlazaFeed>({
    queryKey: ["plazaFeed", symbol, 1],
    queryFn: () => fetchPlazaFeed({ symbol, page: 1, page_size: 10 }),
    retry: false,
    staleTime: 30_000,
  });

  const { data: plazaStats } = useQuery<PlazaStats>({
    queryKey: ["plazaStats"],
    queryFn: fetchPlazaStats,
    retry: false,
    staleTime: 60_000,
  });

  const activeMatch = (expandedMatch >= 0 && sim?.top_matches?.[expandedMatch]) || sim?.top_matches?.[0] || null;
  const signalInfo = SIGNAL_MAP[activeMatch?.signal || latest?.signal || "neutral"] || SIGNAL_MAP.neutral;
  const SignalIcon = signalInfo.icon;
  const isInitialLoading = streaming && !sim;
  const activeMarketStructureLabel = getMarketStructureLabel(activeMatch?.market_structure_type);

  const bestMatch = sim?.top_matches?.[0] || null;
  const secondMatch = sim?.top_matches?.[1] || null;
  const isLowConfidence = !!bestMatch && bestMatch.match_pct < 30;
  const isCrowdedMatch = !!bestMatch && !!secondMatch && Math.abs(bestMatch.match_pct - secondMatch.match_pct) <= 5;

  const storylinePred = bestMatch
    ? plaza?.items?.find(
        (p) => p.symbol === symbol.toUpperCase() && p.playbook_name === bestMatch.name
      )
    : undefined;

  if (playbookState !== "active") {
    return <MaintenancePlaceholder featureName={t('title')} />;
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 md:px-8 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('title')}</h1>
          <p className="text-sm text-zinc-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <SymbolSelector value={symbol} onChange={(v) => { setSymbol(v); setExpandedMatch(0); }} allowedSymbols={["BTCUSDT", "ETHUSDT"]} />
          {sim && !streaming && (
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-all"
            >
              <Share2 size={13} />
              {t('share')}
            </button>
          )}
          <button
            onClick={() => runStream(symbol)}
            disabled={streaming}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={streaming ? "animate-spin" : ""} />
            {t('refresh')}
          </button>
        </div>
      </div>

      {/* ── Guide card ── */}
      <div className="card p-4 flex items-start gap-3">
        <BookOpen size={16} className="text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          <span className="text-zinc-300 font-medium">{t('guide.label')}</span>
          {t('guide.content')}
        </div>
      </div>

      {isInitialLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-zinc-500" />
          <span className="ml-3 text-sm text-zinc-500">{t('loading', { symbol })}</span>
        </div>
      )}

      {simError && (
        <div className="card p-5 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm text-zinc-300">{t('analysisFailed')}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{simError}</p>
          </div>
        </div>
      )}

      {sim && !simError && (isLowConfidence || isCrowdedMatch) && (
        <div className="card p-4 flex items-start gap-3 border-amber-500/20">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <span className="text-xs font-semibold text-amber-400">{t('lowConfidence.title')}</span>
            {isLowConfidence && (
              <p className="text-xs text-zinc-400 leading-relaxed">
                {t('lowConfidence.lowMatch', { pct: bestMatch!.match_pct.toFixed(1) })}
              </p>
            )}
            {isCrowdedMatch && (
              <p className="text-xs text-zinc-400 leading-relaxed">
                {t('lowConfidence.crowded')}
              </p>
            )}
          </div>
        </div>
      )}

      {sim && !simError && (
        <div className="space-y-6">
          <AdversarialL4 sim={sim} latest={latest ?? null} stepStatus={stepStatus} />

          {bestMatch && bestMatch.stages && bestMatch.stages.length > 0 && (
            <PlaybookStoryline
              match={bestMatch}
              status={storylinePred?.status}
              riskFlag={storylinePred?.risk_flag}
              riskNote={storylinePred?.risk_note}
              failureReason={storylinePred?.failure_reason}
              verifiedStages={storylinePred?.verified_stages}
              finalAccuracy={storylinePred?.final_accuracy}
            />
          )}

          {sim.defense_strategy && (
            <PositionCalculator
              input={fromDefenseStrategy(sim.defense_strategy)}
              confidence={sim.defense_strategy.confidence}
              isWorthTaking={sim.judge_adoption?.adoption !== "wait"}
            />
          )}

          {/* Overview cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t('overview.currentPhase')}</span>
              <p className="text-lg font-semibold text-white mt-1">{localizeText(sim.current_phase)}</p>
              {phaseHistory && (
                <p className="text-xs text-indigo-400 mt-1">{phaseHistory.current_phase_label}</p>
              )}
            </div>
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t('overview.currentPlaybook')}</span>
              <p className="text-lg font-semibold text-white mt-1">{activeMatch?.name || "---"}</p>
              <p className={`text-xs mt-1 ${activeMatch?.match_pct && activeMatch.match_pct >= 70 ? "text-red-400" : activeMatch?.match_pct && activeMatch.match_pct >= 40 ? "text-amber-400" : "text-zinc-500"}`}>
                {t('overview.matchPct', { pct: activeMatch?.match_pct?.toFixed(1) || '0' })}
              </p>
            </div>
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">市场结构</span>
              <p className="text-lg font-semibold text-white mt-1">{activeMarketStructureLabel || "—"}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {activeMatch?.matched_domains != null && activeMatch?.total_domains != null
                  ? `数据域 ${activeMatch.matched_domains}/${activeMatch.total_domains}`
                  : "等待结构匹配"}
                {activeMatch?.matched_regimes != null && activeMatch?.total_regimes != null
                  ? ` · 环境 ${activeMatch.matched_regimes}/${activeMatch.total_regimes}`
                  : ""}
              </p>
            </div>
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t('overview.signalDirection')}</span>
              <div className="flex items-center gap-2 mt-1">
                <SignalIcon size={18} className={signalInfo.color} />
                <span className={`text-lg font-semibold ${signalInfo.color}`}>{signalInfo.label}</span>
              </div>
              {latest && (
                <p className="text-xs text-zinc-500 mt-1">{t('overview.confidence', { pct: (latest.confidence * 100).toFixed(0) })}</p>
              )}
            </div>
            <div className="card p-5">
              <span className="text-xs uppercase tracking-widest text-zinc-500">{t('overview.scannedPlaybooks')}</span>
              <p className="text-lg font-semibold text-white mt-1">{sim.total_playbooks}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {t('overview.matched', { count: sim.top_matches.length })}
              </p>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-5 space-y-5">
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
                  <Target size={14} className="text-indigo-400" />
                  <span className="text-sm font-semibold text-white">{t('matchedPlaybooks')}</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {sim.top_matches.map((match, idx) => (
                    <MatchCard
                      key={match.name}
                      match={match}
                      rank={idx + 1}
                      expanded={expandedMatch === idx}
                      onToggle={() => setExpandedMatch(expandedMatch === idx ? -1 : idx)}
                    />
                  ))}
                  {sim.top_matches.length === 0 && (
                    <div className="flex items-center justify-center py-12">
                      <span className="text-sm text-zinc-500">{t('noMatches')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <AnalysisColumn sim={sim} activeMatch={activeMatch} latest={latest} phaseHistory={phaseHistory} />
          </div>

          <PlazaSection plaza={plaza} plazaLoading={plazaLoading} plazaStats={plazaStats} />
        </div>
      )}

      {!sim && !streaming && !simError && (
        <div className="flex flex-col items-center justify-center py-20">
          <Target size={32} className="text-zinc-500 mb-3" />
          <p className="text-sm text-zinc-400">{t('emptyState.title')}</p>
          <p className="text-xs text-zinc-500 mt-1">{t('emptyState.subtitle')}</p>
        </div>
      )}

      {showShare && sim && (
        <PlaybookShareModal
          sim={sim}
          latest={latest}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
