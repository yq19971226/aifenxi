"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AdminSidebar, AdminMobileNav } from "./AdminSidebar";
import { isRouteAllowed, type UserRole } from "@/lib/route-permissions";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const role: UserRole = user?.role ?? "user";

  if (!user || (role !== "admin" && role !== "operator")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-zinc-500">无权限访问管理后台</p>
      </div>
    );
  }

  if (!isRouteAllowed(pathname, role)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-zinc-500">无权限访问此页面</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-3.5rem)]">
      <AdminMobileNav userRole={role} />
      <AdminSidebar userRole={role} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
