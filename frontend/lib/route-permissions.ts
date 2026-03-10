/**
 * 路由权限真相源 — AuthGuard、TopNav、AdminSidebar 共用此配置。
 *
 * 规则：
 * 1. `/admin/*` 默认 admin-only
 * 2. 放宽白名单：`/admin/orders`、`/admin/users` → admin + operator（只读）
 * 3. 其他需要额外保护的非 admin 路径在 EXTRA_PROTECTED 中声明
 *
 * 注意：i18n 模式下 usePathname() 返回带 locale 前缀的路径（如 /zh-CN/admin/...），
 * 因此所有判断前必须先通过 stripLocalePrefix() 归一化。
 */

export type UserRole = "admin" | "operator" | "user";

export const ROLE_LEVEL: Record<UserRole, number> = {
  user: 0,
  operator: 1,
  admin: 2,
};

const SUPPORTED_LOCALES = ["zh-CN", "zh-TW", "en"];

/**
 * 去除路径中的 locale 前缀，返回归一化的路径。
 * 例: "/zh-CN/admin/dashboard" → "/admin/dashboard"
 * 例: "/admin/dashboard" → "/admin/dashboard"（无 locale 时不变）
 */
export function stripLocalePrefix(pathname: string): string {
  for (const loc of SUPPORTED_LOCALES) {
    const prefix = `/${loc}`;
    if (pathname === prefix) return "/";
    if (pathname.startsWith(prefix + "/")) return pathname.slice(prefix.length);
  }
  return pathname;
}

const ADMIN_WHITELIST: Record<string, UserRole[]> = {
  "/admin/orders": ["admin", "operator"],
  "/admin/users": ["admin", "operator"],
};

const EXTRA_PROTECTED: Record<string, UserRole[]> = {
  "/settings/configs": ["admin"],
};

// ── Public API ────────────────────────────────────────────────

export function isRouteAllowed(pathname: string, role: UserRole): boolean {
  const p = stripLocalePrefix(pathname);

  if (p.startsWith("/admin")) {
    const matched = Object.entries(ADMIN_WHITELIST).find(([path]) =>
      p === path || p.startsWith(path + "/")
    );
    const allowedRoles = matched ? matched[1] : ["admin"] as UserRole[];
    return allowedRoles.includes(role);
  }

  const extraMatch = Object.entries(EXTRA_PROTECTED).find(([path]) =>
    p === path || p.startsWith(path + "/")
  );
  if (extraMatch) {
    return extraMatch[1].includes(role);
  }

  return true;
}

export function isNavItemVisible(href: string, role: UserRole): boolean {
  return isRouteAllowed(href, role);
}

export function getMinRole(href: string): UserRole {
  const h = stripLocalePrefix(href);

  if (h.startsWith("/admin")) {
    const matched = Object.entries(ADMIN_WHITELIST).find(([path]) =>
      h === path || h.startsWith(path + "/")
    );
    if (matched) {
      if (matched[1].includes("user")) return "user";
      if (matched[1].includes("operator")) return "operator";
      return "admin";
    }
    return "admin";
  }

  const extraMatch = Object.entries(EXTRA_PROTECTED).find(([path]) =>
    h === path || h.startsWith(path + "/")
  );
  if (extraMatch) {
    if (extraMatch[1].includes("user")) return "user";
    if (extraMatch[1].includes("operator")) return "operator";
    return "admin";
  }

  return "user";
}
