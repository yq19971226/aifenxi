/**
 * API 错误提取工具 — 安全解析 FastAPI 错误响应。
 *
 * FastAPI 错误格式：
 * - 业务错误: { detail: "string" }
 * - 验证错误: { detail: [{ loc, msg, type }] }
 */

/** 从 API 错误响应体中提取可读错误消息。 */
export function extractDetail(
  body: unknown,
  fallback: string,
): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as Record<string, unknown>).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((e) => (typeof e === "object" && e && "msg" in e ? (e as { msg: string }).msg : ""))
      .filter(Boolean);
    return msgs.length > 0 ? msgs.join("; ") : fallback;
  }
  return fallback;
}

/** 通用 API 响应处理：非 ok 时抛出可读错误，ok 时返回 JSON。 */
export async function handleApiResponse<T>(
  res: Response,
  fallbackMsg: string,
): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: fallbackMsg }));
    throw new Error(extractDetail(body, fallbackMsg));
  }
  return res.json();
}
