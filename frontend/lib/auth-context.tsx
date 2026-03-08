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
  register: (email: string, password: string, referralCode?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const token = getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const u = await fetchCurrentUser();
        setUser(u);
      } catch {
        try {
          await refreshAccessToken();
          const u = await fetchCurrentUser();
          setUser(u);
        } catch {
          clearTokens();
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    const u = await fetchCurrentUser();
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string, referralCode?: string) => {
    await apiRegister(email, password, referralCode);
    await apiLogin(email, password);
    const u = await fetchCurrentUser();
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
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
