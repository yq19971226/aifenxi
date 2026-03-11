"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Activity, Server, Database, Wifi, Cpu, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { fetchDashboardOverview } from "@/lib/api/dashboard";
import { getDataSourceStatus } from "@/lib/api/datasources";
import type { SymbolOverview } from "@/lib/api/dashboard";

export function ContextSidebar() {
  const t = useTranslations("common.sidebar");
  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: fetchDashboardOverview,
    refetchInterval: 30000,
  });

  const { data: dsStatus } = useQuery({
    queryKey: ["datasources-status"],
    queryFn: getDataSourceStatus,
    refetchInterval: 30000,
  });

  const score = dsStatus?.domain_completeness ?? dsStatus?.completeness_score ?? 1;
  const scorePercent = Math.round(score * 100);
  const offlineExchanges = (dsStatus?.exchanges ?? []).filter(
    (e) => e.enabled && (e.status === "error" || e.status === "stale")
  );
  const missingDomains = dsStatus?.missing_domains ?? [];
  const dataFeedOk = scorePercent >= 100 && offlineExchanges.length === 0 && missingDomains.length === 0;
  const dataFeedStatus = dataFeedOk ? "active" : "warning";
  const dataFeedValue = dataFeedOk ? t("connected") : scorePercent >= 50 ? t("partial") : t("degraded");

  return (
    <div className="space-y-8">
      {/* System Status Section */}
      <section>
        <div className="flex items-center gap-2 mb-4 text-xs font-mono text-muted-foreground uppercase tracking-wider">
          <Activity size={12} />
          <span>{t("systemStatus")}</span>
        </div>
        
        <div className="space-y-3">
          <StatusItem 
            icon={Server} 
            label={t("nsedEngine")} 
            status="active" 
            value={t("online")} 
          />
          <StatusItem 
            icon={Database} 
            label={t("dataFeed")} 
            status={dataFeedStatus} 
            value={dataFeedValue} 
          />
          <StatusItem 
            icon={Cpu} 
            label={t("activeAgents")} 
            status="active" 
            value={t("agentsCount")} 
          />
          <StatusItem 
            icon={Wifi} 
            label={t("networkLatency")} 
            status="active" 
            value="12ms" 
          />
        </div>
      </section>

      {/* Market Pulse: 数据来自 GET /api/dashboard/overview，每币种 latest_price 由 Redis latest_price:{symbol} 提供，无硬编码价格 */}
      <section>
        <div className="flex items-center gap-2 mb-4 text-xs font-mono text-muted-foreground uppercase tracking-wider">
          <Clock size={12} />
          <span>{t("marketPulse")}</span>
        </div>
        
        <div className="space-y-2">
          {(() => {
            const symbols = (dashboardData?.symbols ?? []).slice(0, 5);
            const fallbackSymbols: SymbolOverview[] = [
              { symbol: "BTCUSDT", display_name: "BTC", latest_price: null, direction: "neutral", confidence: 0, alert_level: "none", dealer_intent: "", collusion_detected: false, entry_low: null, entry_high: null, stop_loss: null, reasoning: "", targets: [], risk_reward_ratio: 0, is_worth_taking: false, strategy_updated_at: null },
              { symbol: "ETHUSDT", display_name: "ETH", latest_price: null, direction: "neutral", confidence: 0, alert_level: "none", dealer_intent: "", collusion_detected: false, entry_low: null, entry_high: null, stop_loss: null, reasoning: "", targets: [], risk_reward_ratio: 0, is_worth_taking: false, strategy_updated_at: null },
              { symbol: "SOLUSDT", display_name: "SOL", latest_price: null, direction: "neutral", confidence: 0, alert_level: "none", dealer_intent: "", collusion_detected: false, entry_low: null, entry_high: null, stop_loss: null, reasoning: "", targets: [], risk_reward_ratio: 0, is_worth_taking: false, strategy_updated_at: null },
            ];
            const list = symbols.length > 0 ? symbols : fallbackSymbols;
            return list.map((item) => <WatchlistItem key={item.symbol} item={item} />);
          })()}
        </div>
      </section>
    </div>
  );
}

function StatusItem({ icon: Icon, label, status, value }: { icon: any, label: string, status: "active" | "warning" | "error", value: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded bg-bg-surface border border-border">
      <div className="flex items-center gap-3">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium text-secondary-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-foreground">{value}</span>
        <div className={`w-1.5 h-1.5 rounded-full ${
          status === "active" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" :
          status === "warning" ? "bg-amber-500" : "bg-red-500"
        }`} />
      </div>
    </div>
  );
}

function WatchlistItem({ item }: { item: SymbolOverview }) {
  const { symbol, latest_price, direction } = item;
  const priceStr = latest_price != null
    ? `$${latest_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
  const isLong = direction === "long" || direction === "bullish";
  const isShort = direction === "short" || direction === "bearish";
  const changeClass = isLong ? "text-bull" : isShort ? "text-bear" : "text-muted-foreground";

  return (
    <div className="group flex items-center justify-between p-3 rounded hover:bg-bg-surface border border-transparent hover:border-border transition-all cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-xs font-bold font-mono text-zinc-300">
           {symbol.substring(0, 1)}
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight">{symbol.replace("USDT", "")}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest">PERP</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono font-medium">{priceStr}</div>
        <div className={`flex items-center justify-end gap-1 mt-0.5 text-[9px] font-mono font-bold tracking-widest ${changeClass}`}>
          {isLong ? (
            <><TrendingUp size={10} strokeWidth={3} /> BULL</>
          ) : isShort ? (
            <><TrendingDown size={10} strokeWidth={3} /> BEAR</>
          ) : (
             <><Minus size={10} strokeWidth={3} /> NEUTRAL</>
          )}
        </div>
      </div>
    </div>
  );
}
