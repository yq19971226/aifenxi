"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import {
  getDataSourceStatus,
  type DataSourceStatusSnapshot,
  type ExchangeStatusItem,
} from "@/lib/api/datasources";
import { cn } from "@/lib/utils";

const POLL_INTERVAL = 30_000;

const DOMAIN_LABEL: Record<string, string> = {
  market: "行情",
  derivatives: "衍生品",
  onchain: "链上",
  macro: "宏观",
  auxiliary: "辅助",
};

function getOfflineExchanges(exchanges: ExchangeStatusItem[]): ExchangeStatusItem[] {
  return exchanges.filter(
    (e) => e.enabled && (e.status === "error" || e.status === "stale")
  );
}

export function DataSourceBanner() {
  const [snapshot, setSnapshot] = useState<DataSourceStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await getDataSourceStatus();
      setSnapshot(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  if (!snapshot) return null;

  const score = snapshot.domain_completeness ?? snapshot.completeness_score;
  const missingDomains = snapshot.missing_domains ?? [];
  const offlineExchanges = getOfflineExchanges(snapshot.exchanges);
  const scorePercent = Math.round(score * 100);

  if (scorePercent >= 100 && offlineExchanges.length === 0 && missingDomains.length === 0) return null;

  const isDanger = scorePercent < 50;

  return (
    <div
      className={`flex items-start gap-3.5 rounded-xl border p-4 text-sm shadow-sm transition-colors ${
        isDanger
          ? "border-red-500/30 bg-red-500/10 text-red-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {isDanger ? (
          <XCircle size={18} className="text-red-400" />
        ) : (
          <AlertTriangle size={18} className="text-amber-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-bold tracking-wide">
          {isDanger ? "\u6570\u636E\u4E25\u91CD\u4E0D\u8DB3" : "\u90E8\u5206\u6570\u636E\u6E90\u79BB\u7EBF"}
        </div>
        <div className="mt-1.5 text-xs text-zinc-300/90 leading-relaxed font-medium">
          <span className="opacity-80">{"\u4FE1\u53F7\u5B8C\u6574\u5EA6\uFF1A"}</span>
          <span className={`font-mono font-bold ml-1 ${isDanger ? "text-red-400" : "text-amber-400"}`}>
            {scorePercent}%
          </span>
          {missingDomains.length > 0 && (
            <>
              <span className="opacity-50 mx-1.5">{"\u00B7"}</span>
              <span className="opacity-80">{"\u7F3A\u5931\u4E3B\u57DF\uFF1A"}</span>
              <span className="font-bold text-white">{missingDomains.map((d) => DOMAIN_LABEL[d] || d).join(" / ")}</span>
            </>
          )}
          {offlineExchanges.length > 0 && (
            <>
              <span className="opacity-50 mx-1.5">{"\u00B7"}</span>
              <span className="opacity-80">{"\u79BB\u7EBF\u4EA4\u6613\u6240\uFF1A"}</span>
              {offlineExchanges.map((e, i) => (
                <span key={e.source_id}>
                  {i > 0 && "\u3001"}
                  <span className="font-bold text-white">{e.name}</span>
                  {e.status === "error" && (
                    <span className="text-[10px] font-mono opacity-70 ml-1">{"\uFF08\u8FDE\u63A5\u9519\u8BEF\uFF09"}</span>
                  )}
                  {e.status === "stale" && (
                    <span className="text-[10px] font-mono opacity-70 ml-1">{"\uFF08\u6570\u636E\u9648\u65E7\uFF09"}</span>
                  )}
                </span>
              ))}
            </>
          )}
        </div>
        {isDanger && (
          <div className="mt-2 text-xs font-medium text-red-300/80 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
            {"\u6570\u636E\u4E25\u91CD\u4E0D\u8DB3\u65F6\uFF0C\u5206\u6790\u7ED3\u679C\u53EF\u9760\u6027\u663E\u8457\u964D\u4F4E\uFF0C\u8BF7\u8C28\u614E\u53C2\u8003\u3002"}
          </div>
        )}
      </div>

      <button
        onClick={fetchStatus}
        disabled={loading}
        className={cn(
          "shrink-0 p-2 rounded-lg transition-colors border",
          isDanger ? "text-red-400 hover:bg-red-500/20 border-transparent hover:border-red-500/30" : "text-amber-400 hover:bg-amber-500/20 border-transparent hover:border-amber-500/30"
        )}
        title={"\u5237\u65B0\u72B6\u6001"}
      >
        <RefreshCw size={16} className={cn(loading && "animate-spin")} />
      </button>
    </div>
  );
}
