"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { isRouteAllowed } from "@/lib/route-permissions";
import { getLocaleFromPathname, isAuthRoute } from "@/lib/utils/locale";
import type { ReactNode } from "react";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);

  useEffect(() => {
    if (loading) return;

    // 未登录用户重定向到 /{locale}/login，避免丢 locale
    if (!user && !isAuthRoute(pathname)) {
      router.push(`/${locale}/login`);
      return;
    }

    // 已登录用户：使用共享权限真相源检查路由权限
    if (user && !isRouteAllowed(pathname, user.role)) {
      router.push(`/${locale}/dashboard`);
    }
  }, [user, loading, pathname, router, locale]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-pulse text-sm font-light tracking-[0.2em] text-zinc-400 select-none">
            AXIOM
          </div>
          <div className="h-1 w-32 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full w-1/2 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-[var(--color-accent)]" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
