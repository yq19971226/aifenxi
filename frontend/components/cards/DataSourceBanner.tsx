"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import {
  getDataSourceStatus,
  type DataSourceStatusSnapshot,
  type ExchangeStatusItem,
} from "@/lib/api/datasources";

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
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        isDanger
          ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
          : "border-amber-500/20 bg-amber-500/[0.06] text-amber-300"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {isDanger ? (
          <XCircle size={15} className="text-red-400" />
        ) : (
          <AlertTriangle size={15} className="text-amber-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium">
          {isDanger ? "\u6570\u636E\u4E25\u91CD\u4E0D\u8DB3" : "\u90E8\u5206\u6570\u636E\u6E90\u79BB\u7EBF"}
        </div>
        <div className="mt-1 text-xs opacity-80">
          {"\u4FE1\u53F7\u5B8C\u6574\u5EA6\uFF1A"}
          <span className={`stat-value ${isDanger ? "text-red-400" : "text-amber-400"}`}>
            {scorePercent}%
          </span>
          {missingDomains.length > 0 && (
            <>
              {" \u00B7 \u7F3A\u5931\u4E3B\u57DF\uFF1A"}
              <span className="font-medium">{missingDomains.map((d) => DOMAIN_LABEL[d] || d).join(" / ")}</span>
            </>
          )}
          {offlineExchanges.length > 0 && (
            <>
              {" \u00B7 \u79BB\u7EBF\u4EA4\u6613\u6240\uFF1A"}
              {offlineExchanges.map((e, i) => (
                <span key={e.source_id}>
                  {i > 0 && "\u3001"}
                  <span className="font-medium">{e.name}</span>
                  {e.status === "error" && (
                    <span className="ml-1 text-sm opacity-60">{"\uFF08\u8FDE\u63A5\u9519\u8BEF\uFF09"}</span>
                  )}
                  {e.status === "stale" && (
                    <span className="ml-1 text-sm opacity-60">{"\uFF08\u6570\u636E\u9648\u65E7\uFF09"}</span>
                  )}
                </span>
              ))}
            </>
          )}
        </div>
        {isDanger && (
          <div className="mt-1 text-sm opacity-70">
            {"\u6570\u636E\u4E25\u91CD\u4E0D\u8DB3\u65F6\uFF0C\u5206\u6790\u7ED3\u679C\u53EF\u9760\u6027\u663E\u8457\u964D\u4F4E\uFF0C\u8BF7\u8C28\u614E\u53C2\u8003\u3002"}
          </div>
        )}
      </div>

      <button
        onClick={fetchStatus}
        disabled={loading}
        className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
        title={"\u5237\u65B0\u72B6\u6001"}
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
