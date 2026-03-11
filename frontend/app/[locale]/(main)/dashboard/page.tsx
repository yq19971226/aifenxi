"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchDashboardOverview } from "@/lib/api/dashboard";
import { UnifiedResultCard } from "@/components/analysis/UnifiedResultCard";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  
  const { 
    data: overview, 
    isLoading, 
    isError, 
    refetch 
  } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: fetchDashboardOverview,
    refetchInterval: 30000, // Real-time pulse
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 size={32} className="animate-spin mb-4" />
        <p className="text-sm font-mono tracking-widest uppercase">Initializing NSED Engine...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-bear">
        <AlertCircle size={48} className="mb-4 opacity-50" />
        <h2 className="text-lg font-bold mb-2">System Connection Failed</h2>
        <p className="text-sm text-muted-foreground mb-6">Unable to establish secure link with analysis nodes.</p>
        <button 
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded bg-bg-surface border border-border hover:bg-bg-elevated transition-colors text-sm font-medium text-foreground"
        >
          <RefreshCw size={14} /> Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header Section ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            Command Center
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            {">"} WELCOME BACK, {user?.username?.toUpperCase()}
          </p>
        </div>
        
        {/* Quick Stats Ticker */}
        <div className="flex items-center gap-6 px-4 py-2 rounded bg-bg-surface border border-border text-xs font-mono">
          <div>
            <span className="text-muted-foreground mr-2">CREDITS</span>
            <span className="text-foreground font-bold">{overview?.credits_remaining || 0}</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div>
            <span className="text-muted-foreground mr-2">RANK</span>
            <span className="text-bull font-bold">TOP 5%</span>
          </div>
        </div>
      </div>

      {/* ── Active Analysis Grid ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-bull animate-pulse" />
            Live Analysis Feed
          </h2>
        </div>

        {(!overview?.recent_reports || overview.recent_reports.length === 0) ? (
          <div className="rounded-lg border border-border border-dashed p-12 text-center">
            <p className="text-muted-foreground mb-4">No active analysis sessions.</p>
            <button className="px-4 py-2 rounded bg-foreground text-bg-primary font-bold text-sm hover:bg-muted-foreground transition-colors">
              Start New Analysis
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {overview.recent_reports.map((report: any, i: number) => (
              <UnifiedResultCard key={report.report_id} report={report} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
