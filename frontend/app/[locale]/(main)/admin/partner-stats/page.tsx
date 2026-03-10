"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PageTransition } from "@/components/layout/PageTransition";
import { adminPartnerApi, type PartnerListItem } from "@/lib/api/partner";
import { Users, DollarSign, ArrowDownToLine, Clock, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function PartnerStatsPage() {
  const { user } = useAuth();
  const t = useTranslations('partner.admin');
  const isAdmin = user?.role === "admin";

  const { data: overview } = useQuery({
    queryKey: ["admin-partner-overview"],
    queryFn: adminPartnerApi.getOverview,
    enabled: isAdmin,
  });

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["admin-partner-list"],
    queryFn: () => adminPartnerApi.getPartnerList(),
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>

        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: t('overview.totalReferrals'), value: overview.total_referrals, icon: Users, color: "text-blue-400" },
              { label: t('overview.activePartners'), value: overview.active_partners, icon: TrendingUp, color: "text-green-400" },
              { label: t('overview.totalCommission'), value: `$${overview.total_commission.toFixed(2)}`, icon: DollarSign, color: "text-yellow-400" },
              { label: t('overview.pendingWithdrawals'), value: overview.pending_withdrawals, icon: Clock, color: "text-orange-400" },
              { label: t('overview.totalWithdrawn'), value: `$${overview.total_withdrawn.toFixed(2)}`, icon: ArrowDownToLine, color: "text-zinc-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
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
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">{t('list.title')}</h2>
          {isLoading ? (
            <div className="py-12 text-center text-zinc-400">{t('list.loading')}</div>
          ) : partners.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">{t('list.empty')}</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400">{t('list.columns.email')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400">{t('list.columns.referralCode')}</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400">{t('list.columns.invitationCount')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400">{t('list.columns.totalCommission')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-400">{t('list.columns.registeredAt')}</th>
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
