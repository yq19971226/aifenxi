import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────

export interface TaskConfig {
  reward_mode: string;
  reward_amount: number;
}

export interface TaskSubmission {
  id: string;
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
}

export interface TaskHome {
  task_config: TaskConfig;
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
    return handleApiResponse(res, "请求失败");
  },

  async generatePromo(): Promise<PromoData> {
    const res = await authFetch(`${API_BASE}/api/tasks/generate-promo`, {
      method: "POST",
    });
    return handleApiResponse(res, "请求失败");
  },

  async submit(data: {
    post_url: string;
    screenshot_url: string;
  }) {
    const res = await authFetch(`${API_BASE}/api/tasks/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleApiResponse(res, "请求失败");
  },

  async getMySubmissions(limit = 30): Promise<TaskSubmission[]> {
    const res = await authFetch(
      `${API_BASE}/api/tasks/my-submissions?limit=${limit}`
    );
    return handleApiResponse(res, "请求失败");
  },

  async getMyBonus(): Promise<Record<string, number>> {
    const res = await authFetch(`${API_BASE}/api/tasks/my-bonus`);
    return handleApiResponse(res, "请求失败");
  },

  async uploadProof(file: File): Promise<{ screenshot_url: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await authFetch(`${API_BASE}/api/tasks/upload-proof`, {
      method: "POST",
      body: formData,
    });
    return handleApiResponse(res, "上传失败");
  },
};

// ── Admin API ────────────────────────────────────────────────

export const adminTasksApi = {
  async listSubmissions(status?: string): Promise<TaskSubmission[]> {
    const params = status ? `?status=${status}` : "";
    const res = await authFetch(
      `${API_BASE}/api/admin/tasks/submissions${params}`
    );
    return handleApiResponse(res, "请求失败");
  },

  async approveSubmission(id: string) {
    const res = await authFetch(
      `${API_BASE}/api/admin/tasks/submissions/${id}/approve`,
      { method: "POST" }
    );
    return handleApiResponse(res, "请求失败");
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
    return handleApiResponse(res, "请求失败");
  },

  async getStats(): Promise<TaskStats> {
    const res = await authFetch(`${API_BASE}/api/admin/tasks/stats`);
    return handleApiResponse(res, "请求失败");
  },
};
