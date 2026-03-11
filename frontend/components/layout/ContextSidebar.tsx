"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Server, Database, Wifi, Cpu, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { fetchDashboardOverview } from "@/lib/api/dashboard";

export function ContextSidebar() {
  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: fetchDashboardOverview,
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-8">
      {/* System Status Section */}
      <section>
        <div className="flex items-center gap-2 mb-4 text-xs font-mono text-muted-foreground uppercase tracking-wider">
          <Activity size={12} />
          <span>System Status</span>
        </div>
        
        <div className="space-y-3">
          <StatusItem 
            icon={Server} 
            label="NSED Engine" 
            status="active" 
            value="Online" 
          />
          <StatusItem 
            icon={Database} 
            label="Data Feed" 
            status="active" 
            value="Connected" 
          />
          <StatusItem 
            icon={Cpu} 
            label="Active Agents" 
            status="active" 
            value="11/11" 
          />
          <StatusItem 
            icon={Wifi} 
            label="Network Latency" 
            status="active" 
            value="45ms" 
          />
        </div>
      </section>

      {/* Watchlist Section */}
      <section>
        <div className="flex items-center gap-2 mb-4 text-xs font-mono text-muted-foreground uppercase tracking-wider">
          <Clock size={12} />
          <span>Market Pulse</span>
        </div>
        
        <div className="space-y-2">
          {(() => {
            const symbolList = (dashboardData?.symbols ?? []).slice(0, 5).map((s) => s.symbol);
            const displaySymbols = symbolList.length > 0 ? symbolList : ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
            return displaySymbols.map((symbol) => <WatchlistItem key={symbol} symbol={symbol} />);
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
        <div className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`} />
      </div>
    </div>
  );
}

function WatchlistItem({ symbol }: { symbol: string }) {
  // Mock data for visual structure - in real app would connect to price socket
  const isUp = Math.random() > 0.5;
  const change = (Math.random() * 5).toFixed(2);
  
  return (
    <div className="group flex items-center justify-between p-3 rounded hover:bg-bg-surface border border-transparent hover:border-border transition-all cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] font-bold">
           {symbol.substring(0, 1)}
        </div>
        <div>
          <div className="text-sm font-bold">{symbol.replace("USDT", "")}</div>
          <div className="text-[10px] text-muted-foreground">PERP</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono">$64,230.50</div>
        <div className={`text-[10px] font-mono ${isUp ? 'text-bull' : 'text-bear'}`}>
          {isUp ? '+' : '-'}{change}%
        </div>
      </div>
    </div>
  );
}
