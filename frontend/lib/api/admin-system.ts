import { authFetch } from "@/lib/api/auth";
import { handleApiResponse } from "./helpers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface GitInfo {
  commit: string;
  message: string;
  branch: string;
  behind: number;
  has_update: boolean;
  error?: string;
}

export interface ContainerInfo {
  name: string;
  service: string;
  state: string;
  status: string;
  health: string;
  error?: string;
}

export interface LastDeploy {
  success: boolean;
  elapsed_s: number;
  finished_at: string;
  commit: string;
}

export interface SystemStatus {
  agent_connected: boolean;
  deploying: boolean;
  last_deploy: LastDeploy | null;
  git: GitInfo;
  containers: ContainerInfo[];
  server_time?: string;
  error?: string;
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await authFetch(`${API_BASE}/api/admin/system/status`);
  return handleApiResponse(res, "获取系统状态失败");
}

export interface SystemVersion {
  version: string;
  env: string;
}

export async function fetchSystemVersion(): Promise<SystemVersion> {
  const res = await authFetch(`${API_BASE}/api/admin/system/version`);
  return handleApiResponse(res, "获取版本信息失败");
}

export type DeployEventType = "log" | "done" | "error";

export interface DeployEvent {
  type: DeployEventType;
  data: string;
}

async function startAction(
  path: string,
  body: Record<string, unknown> | null,
  onEvent: (event: DeployEvent) => void,
  onFinish: () => void,
): Promise<void> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "触发部署失败" }));
    throw new Error(err.detail || "触发部署失败");
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("无法读取响应流");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let eventType: DeployEventType = "log";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim() as DeployEventType;
        } else if (line.startsWith("data: ")) {
          const raw = line.slice(6);
          try {
            const data = JSON.parse(raw);
            onEvent({ type: eventType, data });
          } catch {
            onEvent({ type: eventType, data: raw });
          }
          eventType = "log";
        }
      }
    }
  } finally {
    reader.releaseLock();
    onFinish();
  }
}

export async function startDeploy(
  payload: { target?: string },
  onEvent: (event: DeployEvent) => void,
  onFinish: () => void,
): Promise<void> {
  return startAction("/api/admin/system/deploy", payload, onEvent, onFinish);
}

export interface RollbackPayload {
  target?: string;
}

export async function startRollback(
  payload: RollbackPayload,
  onEvent: (event: DeployEvent) => void,
  onFinish: () => void,
): Promise<void> {
  return startAction("/api/admin/system/rollback", payload as Record<string, unknown>, onEvent, onFinish);
}
