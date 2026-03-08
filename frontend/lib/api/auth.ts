const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const TOKEN_KEY = "axiom_access_token";
const REFRESH_KEY = "axiom_refresh_token";

// ── Types ────────────────────────────────────────────────────

export interface UserInfo {
  id: string;
  email: string;
  membership_level: number;
  is_active: boolean;
  is_admin: boolean;
  role: "admin" | "operator" | "user";
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface RefreshResponse {
  access_token: string;
  token_type: string;
}

interface RegisterResponse {
  user_id: string;
  email: string;
  message: string;
}

// ── Token helpers ────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function saveTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ── Fetch with auto-refresh ─────────────────────────────────

let _refreshPromise: Promise<string> | null = null;

/**
 * Authenticated fetch wrapper — automatically retries once with a
 * refreshed access token when the server returns 401.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401 && getRefreshToken()) {
    try {
      // Deduplicate concurrent refresh calls
      if (!_refreshPromise) {
        _refreshPromise = refreshAccessToken();
      }
      const newToken = await _refreshPromise;
      _refreshPromise = null;

      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(input, { ...init, headers });
    } catch {
      _refreshPromise = null;
      clearTokens();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  }
  return res;
}

// ── API calls ────────────────────────────────────────────────

export async function register(
  email: string,
  password: string,
  referralCode?: string
): Promise<RegisterResponse> {
  const body: Record<string, string> = { email, password };
  if (referralCode) body.referral_code = referralCode;
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "注册失败" }));
    throw new Error(err.detail || "注册失败");
  }
  return res.json();
}

export async function login(
  email: string,
  password: string
): Promise<TokenResponse> {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);

  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "登录失败" }));
    throw new Error(err.detail || "登录失败");
  }
  const data: TokenResponse = await res.json();
  saveTokens(data.access_token, data.refresh_token);
  return data;
}

export async function refreshAccessToken(): Promise<string> {
  const rt = getRefreshToken();
  if (!rt) throw new Error("无 refresh_token");

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  });
  if (!res.ok) {
    clearTokens();
    throw new Error("refresh_token 已过期");
  }
  const data: RefreshResponse = await res.json();
  localStorage.setItem(TOKEN_KEY, data.access_token);
  return data.access_token;
}

export async function fetchCurrentUser(): Promise<UserInfo> {
  const res = await authFetch(`${API_BASE}/api/auth/me`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "获取用户信息失败" }));
    throw new Error(err.detail || "获取用户信息失败");
  }
  return res.json();
}
