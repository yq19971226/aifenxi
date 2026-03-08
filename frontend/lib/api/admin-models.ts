import { authFetch } from "./auth";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export interface AvailableModel {
  model_key: string;
  model_name: string;
  display_name: string;
  description: string;
  pricing: { input: number; output: number };
  strengths: string[];
}

export interface ModelAssignment {
  agent_id: string;
  agent_name: string;
  agent_desc: string;
  phase: string;
  current_model_key: string;
  current_model_name: string;
  current_model_display: string;
  default_model_key: string;
  is_custom: boolean;
}

export async function fetchAvailableModels(): Promise<AvailableModel[]> {
  const res = await authFetch(`${API}/api/admin/models/available`);
  if (!res.ok) throw new Error("获取可用模型失败");
  const data = await res.json();
  return data.models;
}

export async function fetchModelAssignments(): Promise<ModelAssignment[]> {
  const res = await authFetch(`${API}/api/admin/models/assignments`);
  if (!res.ok) throw new Error("获取模型分配失败");
  const data = await res.json();
  return data.assignments;
}

export async function updateModelAssignment(
  agentId: string,
  modelKey: string
): Promise<void> {
  const res = await authFetch(`${API}/api/admin/models/assignments/${agentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_key: modelKey }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "更新失败" }));
    throw new Error(body.detail ?? "更新模型分配失败");
  }
}

export async function batchUpdateAssignments(
  assignments: Record<string, string>
): Promise<void> {
  const res = await authFetch(`${API}/api/admin/models/assignments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignments }),
  });
  if (!res.ok) throw new Error("批量更新失败");
}

export async function resetModelAssignment(agentId: string): Promise<void> {
  const res = await authFetch(`${API}/api/admin/models/reset/${agentId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("重置失败");
}

export async function resetAllAssignments(): Promise<void> {
  const res = await authFetch(`${API}/api/admin/models/reset`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("重置全部失败");
}
