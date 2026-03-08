"use client";

import { BarChart3, Loader2 } from "lucide-react";
import type { PlazaFeed, PlazaStats } from "@/lib/api/playbook-sim";
import { getStatusBadge } from "./playbook-constants";

interface Props {
  plaza?: PlazaFeed;
  plazaLoading: boolean;
  plazaStats?: PlazaStats;
}

export default function PlazaSection({ plaza, plazaLoading, plazaStats }: Props) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      {plazaStats && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-amber-400" />
            <span className="text-sm font-semibold text-white">剧本广场统计</span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">总预测</span>
              <p className="text-sm font-semibold text-white mt-1">{plazaStats.total_predictions}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">进行中</span>
              <p className="text-sm font-semibold text-emerald-400 mt-1">{plazaStats.active_count}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">已完成</span>
              <p className="text-sm font-semibold text-white mt-1">{plazaStats.completed_count}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-500">平均准确率</span>
              <p className="text-sm font-semibold text-amber-400 mt-1">
                {(plazaStats.avg_accuracy * 100).toFixed(1)}%
              </p>
            </div>
          </div>
          {plazaStats.top_playbooks.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              <span className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">热门剧本</span>
              <div className="space-y-1.5">
                {plazaStats.top_playbooks.slice(0, 3).map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.02]">
                    <span className="text-xs text-zinc-300">{p.name}</span>
                    <span className="text-sm font-mono text-indigo-400">{p.count} 次</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="xl:col-span-2 card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <span className="text-sm font-semibold text-white">剧本广场</span>
          <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
            {plaza?.total || 0} 条预测
          </span>
        </div>
        {plazaLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="animate-spin text-zinc-600" />
          </div>
        ) : !plaza || plaza.items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-zinc-500">暂无剧本预测记录</span>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {plaza.items.map((item) => {
              const badge = getStatusBadge(item.status, item.risk_flag);
              return (
                <div key={item.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-medium text-white font-mono">{item.symbol}</span>
                    <span className="text-xs text-zinc-400 truncate">{item.playbook_name}</span>
                    {item.created_at && (
                      <span className="text-xs text-zinc-600">
                        {new Date(item.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-mono font-semibold ${item.match_pct >= 70 ? "text-red-400" : item.match_pct >= 40 ? "text-amber-400" : "text-zinc-400"}`}>
                      {item.match_pct.toFixed(0)}%
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.bg} ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
