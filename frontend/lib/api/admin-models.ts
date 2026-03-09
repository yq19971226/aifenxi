import { authFetch } from "./auth";
import { handleApiResponse } from "./helpers";

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
  const data = await handleApiResponse<any>(res, "获取可用模型失败");
  return data.models;
}

export async function fetchModelAssignments(): Promise<ModelAssignment[]> {
  const res = await authFetch(`${API}/api/admin/models/assignments`);
  const data = await handleApiResponse<any>(res, "获取模型分配失败");
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
  await handleApiResponse<void>(res, "更新模型分配失败");
}

export async function batchUpdateAssignments(
  assignments: Record<string, string>
): Promise<void> {
  const res = await authFetch(`${API}/api/admin/models/assignments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignments }),
  });
  await handleApiResponse<void>(res, "批量更新失败");
}

export async function resetModelAssignment(agentId: string): Promise<void> {
  const res = await authFetch(`${API}/api/admin/models/reset/${agentId}`, {
    method: "POST",
  });
  await handleApiResponse<void>(res, "重置失败");
}

export async function resetAllAssignments(): Promise<void> {
  const res = await authFetch(`${API}/api/admin/models/reset`, {
    method: "POST",
  });
  await handleApiResponse<void>(res, "重置全部失败");
}
