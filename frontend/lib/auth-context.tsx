"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  type UserInfo,
  login as apiLogin,
  register as apiRegister,
  fetchCurrentUser,
  refreshAccessToken,
  getAccessToken,
  clearTokens,
} from "@/lib/api/auth";

interface AuthContextValue {
  user: UserInfo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, code: string, referralCode?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

// ── HMR 状态缓存 ─────────────────────────────────────────────
// 模块级变量在 Fast Refresh 时不会被重置，
// 避免每次 HMR re-mount 时 user→null → loading→true → 白屏。
let __cachedUser: UserInfo | null = null;
let __cachedReady = false;

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserInfo | null>(__cachedUser);
  const [loading, setLoading] = useState(!__cachedReady);

  useEffect(() => {
    if (__cachedReady) {
      setUser(__cachedUser);
      setLoading(false);
      return;
    }
    async function init() {
      const token = getAccessToken();
      if (!token) {
        __cachedUser = null;
        __cachedReady = true;
        setLoading(false);
        return;
      }
      try {
        const u = await fetchCurrentUser();
        __cachedUser = u;
        setUser(u);
      } catch {
        try {
          await refreshAccessToken();
          const u = await fetchCurrentUser();
          __cachedUser = u;
          setUser(u);
        } catch {
          clearTokens();
          __cachedUser = null;
        }
      } finally {
        __cachedReady = true;
        setLoading(false);
      }
    }
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    const u = await fetchCurrentUser();
    __cachedUser = u;
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string, code: string, referralCode?: string) => {
    if (referralCode) {
      await apiRegister(email, password, code, referralCode);
    } else {
      await apiRegister(email, password, code);
    }
    const u = await fetchCurrentUser();
    __cachedUser = u;
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    __cachedUser = null;
    __cachedReady = false;
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
