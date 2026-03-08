import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface PartnerDashboard {
  referral_code: string;
  referral_link: string;
  balance: number;
  frozen: number;
  total_invitations: number;
  total_paid_referees: number;
  total_commission: number;
  commission_rate: number;
}

export interface ReferralCodeInfo {
  referral_code: string;
  referral_link: string;
}

export interface Invitation {
  user_id: string;
  email_masked: string;
  registered_at: string | null;
  membership_level: number;
  total_commission: number;
}

export interface CommissionRecord {
  id: string;
  referee_email_masked: string;
  payment_amount_usd: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  created_at: string;
}

export interface PartnerDetail {
  user_id: string;
  email: string;
  referral_code: string;
  membership_level: number;
  created_at: string;
  balance: number;
  frozen: number;
  invitation_count: number;
  total_commission: number;
  commission_count: number;
  wallet: {
    trc20_address: string | null;
    is_verified: boolean;
  };
  recent_withdrawals: Array<{
    id: string;
    amount: number;
    status: string;
    created_at: string;
  }>;
}

export interface PartnerConfigUpdate {
  partner_commission_rate?: number;
  partner_min_withdrawal?: number;
  partner_withdrawal_cooldown_days?: number;
  partner_address_cooldown_hours?: number;
}

export interface WalletInfo {
  trc20_address: string | null;
  is_verified: boolean;
  id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WithdrawalRecord {
  id: string;
  amount: number;
  trc20_address: string;
  status: string;
  tx_hash: string | null;
  reject_reason: string | null;
  created_at: string;
  reviewed_at?: string | null;
  // admin fields
  user_id?: string;
  email?: string;
}

export interface PartnerOverview {
  total_referrals: number;
  active_partners: number;
  total_commission: number;
  pending_withdrawals: number;
  total_withdrawn: number;
}

export interface PartnerListItem {
  user_id: string;
  email: string;
  referral_code: string;
  invitation_count: number;
  total_commission: number;
  created_at: string;
}

// ── User API ─────────────────────────────────────────────────

export const partnerApi = {
  async getDashboard(): Promise<PartnerDashboard> {
    const res = await authFetch(`${API_BASE}/api/partner/dashboard`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getReferralCode(): Promise<ReferralCodeInfo> {
    const res = await authFetch(`${API_BASE}/api/partner/referral-code`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getInvitations(limit = 50, offset = 0): Promise<Invitation[]> {
    const res = await authFetch(
      `${API_BASE}/api/partner/invitations?limit=${limit}&offset=${offset}`
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getCommissions(limit = 50, offset = 0): Promise<CommissionRecord[]> {
    const res = await authFetch(
      `${API_BASE}/api/partner/commissions?limit=${limit}&offset=${offset}`
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getWallet(): Promise<WalletInfo> {
    const res = await authFetch(`${API_BASE}/api/partner/wallet`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async upsertWallet(trc20_address: string) {
    const res = await authFetch(`${API_BASE}/api/partner/wallet`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trc20_address }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async requestWithdrawal() {
    const res = await authFetch(`${API_BASE}/api/partner/withdraw`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getWithdrawals(limit = 20): Promise<WithdrawalRecord[]> {
    const res = await authFetch(
      `${API_BASE}/api/partner/withdrawals?limit=${limit}`
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

// ── Admin API ────────────────────────────────────────────────

export const adminPartnerApi = {
  async getOverview(): Promise<PartnerOverview> {
    const res = await authFetch(`${API_BASE}/api/admin/partner/overview`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getPartnerList(
    limit = 50,
    offset = 0
  ): Promise<PartnerListItem[]> {
    const res = await authFetch(
      `${API_BASE}/api/admin/partner/list?limit=${limit}&offset=${offset}`
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getPartnerDetail(userId: string): Promise<PartnerDetail> {
    const res = await authFetch(`${API_BASE}/api/admin/partner/${userId}/detail`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async updateConfig(payload: PartnerConfigUpdate) {
    const res = await authFetch(`${API_BASE}/api/admin/partner/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getWithdrawals(status?: string): Promise<WithdrawalRecord[]> {
    const params = status ? `?status=${status}` : "";
    const res = await authFetch(
      `${API_BASE}/api/admin/withdrawals${params}`
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async approveWithdrawal(id: string, tx_hash: string) {
    const res = await authFetch(
      `${API_BASE}/api/admin/withdrawals/${id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx_hash }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async rejectWithdrawal(id: string, reason: string) {
    const res = await authFetch(
      `${API_BASE}/api/admin/withdrawals/${id}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
