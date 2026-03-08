"use client";

import { useQuery } from "@tanstack/react-query";
import { PageTransition } from "@/components/layout/PageTransition";
import { adminPartnerApi, type PartnerListItem, type PartnerOverview } from "@/lib/api/partner";
import { Users, DollarSign, ArrowDownToLine, Clock, TrendingUp } from "lucide-react";

export default function PartnerStatsPage() {
  const { data: overview } = useQuery({
    queryKey: ["admin-partner-overview"],
    queryFn: adminPartnerApi.getOverview,
  });

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["admin-partner-list"],
    queryFn: () => adminPartnerApi.getPartnerList(),
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-white">合伙人统计</h1>

        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "总邀请数", value: overview.total_referrals, icon: Users, color: "text-blue-400" },
              { label: "活跃合伙人", value: overview.active_partners, icon: TrendingUp, color: "text-green-400" },
              { label: "累计佣金", value: `$${overview.total_commission.toFixed(2)}`, icon: DollarSign, color: "text-yellow-400" },
              { label: "待审提现", value: overview.pending_withdrawals, icon: Clock, color: "text-orange-400" },
              { label: "已提现总额", value: `$${overview.total_withdrawn.toFixed(2)}`, icon: ArrowDownToLine, color: "text-zinc-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon size={14} className="text-zinc-500" />
                  <span className="text-xs text-zinc-500">{s.label}</span>
                </div>
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Partner List */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">合伙人列表</h2>
          {isLoading ? (
            <div className="py-12 text-center text-zinc-400">加载中...</div>
          ) : partners.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">暂无活跃合伙人</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400">邮箱</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400">邀请码</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400">邀请数</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400">累计佣金</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400">注册时间</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p: PartnerListItem) => (
                    <tr
                      key={p.user_id}
                      className="border-b border-white/5 hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 text-white">{p.email}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                        {p.referral_code}
                      </td>
                      <td className="px-4 py-3 text-center text-zinc-300">
                        {p.invitation_count}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-400">
                        ${p.total_commission.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-500">
                        {new Date(p.created_at).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
