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
    <div className="flex items-center justify-between p-3.5 rounded-xl bg-bg-surface border border-border">
      <div className="flex items-center gap-3">
        <Icon size={16} className="text-zinc-400" />
        <span className="text-sm font-bold text-zinc-300 tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-bold text-white">{value}</span>
        <div className={`w-2 h-2 rounded-full ${
          status === "active" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
          status === "warning" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
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
  const changeClass = isLong ? "text-bull" : isShort ? "text-bear" : "text-zinc-500";

  return (
    <div className="group flex items-center justify-between p-3.5 rounded-xl hover:bg-bg-surface border border-transparent hover:border-border transition-all cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-bg-elevated border border-border flex items-center justify-center text-sm font-black font-mono text-zinc-300 shadow-inner group-hover:text-white transition-colors">
           {symbol.substring(0, 1)}
        </div>
        <div>
          <div className="text-sm font-black tracking-tight text-zinc-200 group-hover:text-white transition-colors">{symbol.replace("USDT", "")}</div>
          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">永续</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono font-bold text-white tracking-tight">{priceStr}</div>
        <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-mono font-bold tracking-widest ${changeClass}`}>
          {isLong ? (
            <><TrendingUp size={12} strokeWidth={3} /> 看涨</>
          ) : isShort ? (
            <><TrendingDown size={12} strokeWidth={3} /> 看跌</>
          ) : (
             <><Minus size={12} strokeWidth={3} /> 观望</>
          )}
        </div>
      </div>
    </div>
  );
}
