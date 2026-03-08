import { authFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface TaskTemplate {
  id: string;
  title: string;
  platform: string;
  icon: string | null;
  description: string | null;
  rules: string | null;
  reward_mode: string;
  reward_amount: number;
  min_views: number;
  verify_window_hours: number;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TaskSubmission {
  id: string;
  template_id?: string;
  template_title: string;
  post_url?: string;
  screenshot_url?: string;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  reward_granted: boolean;
  reward_mode: string;
  reward_amount: number;
  submitted_at: string;
  reviewed_at: string | null;
  // admin fields
  user_id?: string;
  email?: string;
  min_views?: number;
}

export interface TaskHome {
  templates: TaskTemplate[];
  today_submission: TaskSubmission | null;
  can_submit: boolean;
  bonus_credits: Record<string, number>;
}

export interface PromoData {
  copies: { style: string; text: string }[];
  image_data: Record<string, string | boolean>;
  generated_at: string;
}

export interface TaskStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
  unique_users: number;
}

// ── User API ─────────────────────────────────────────────────

export const tasksApi = {
  async getHome(): Promise<TaskHome> {
    const res = await authFetch(`${API_BASE}/api/tasks`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async generatePromo(): Promise<PromoData> {
    const res = await authFetch(`${API_BASE}/api/tasks/generate-promo`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async submit(data: {
    template_id: string;
    post_url: string;
    screenshot_url: string;
  }) {
    const res = await authFetch(`${API_BASE}/api/tasks/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getMySubmissions(limit = 30): Promise<TaskSubmission[]> {
    const res = await authFetch(
      `${API_BASE}/api/tasks/my-submissions?limit=${limit}`
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getMyBonus(): Promise<Record<string, number>> {
    const res = await authFetch(`${API_BASE}/api/tasks/my-bonus`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

// ── Admin API ────────────────────────────────────────────────

export const adminTasksApi = {
  async listTemplates(): Promise<TaskTemplate[]> {
    const res = await authFetch(`${API_BASE}/api/admin/tasks/templates`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async createTemplate(data: Partial<TaskTemplate>) {
    const res = await authFetch(`${API_BASE}/api/admin/tasks/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async updateTemplate(id: string, data: Partial<TaskTemplate>) {
    const res = await authFetch(`${API_BASE}/api/admin/tasks/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async deleteTemplate(id: string) {
    const res = await authFetch(`${API_BASE}/api/admin/tasks/templates/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async listSubmissions(status?: string): Promise<TaskSubmission[]> {
    const params = status ? `?status=${status}` : "";
    const res = await authFetch(
      `${API_BASE}/api/admin/tasks/submissions${params}`
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async approveSubmission(id: string) {
    const res = await authFetch(
      `${API_BASE}/api/admin/tasks/submissions/${id}/approve`,
      { method: "POST" }
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async rejectSubmission(id: string, reason: string) {
    const res = await authFetch(
      `${API_BASE}/api/admin/tasks/submissions/${id}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getStats(): Promise<TaskStats> {
    const res = await authFetch(`${API_BASE}/api/admin/tasks/stats`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
