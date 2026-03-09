/**
 * 路由权限真相源 — AuthGuard、TopNav、AdminSidebar 共用此配置。
 *
 * 规则（按 requirements.md 冻结决策）：
 * 1. `/admin/*` 默认 admin-only
 * 2. 唯一冻结放宽白名单：`/admin/orders` → admin + operator
 * 3. 其他需要额外保护的非 admin 路径在 EXTRA_PROTECTED 中声明
 */

export type UserRole = "admin" | "operator" | "user";

export const ROLE_LEVEL: Record<UserRole, number> = {
  user: 0,
  operator: 1,
  admin: 2,
};

/**
 * /admin/* 路径下的角色放宽白名单。
 * 未在此列出的 /admin/* 路径一律 admin-only。
 */
const ADMIN_WHITELIST: Record<string, UserRole[]> = {
  "/admin/orders": ["admin", "operator"],
  "/admin/users": ["admin", "operator"],
};

/**
 * 非 /admin 前缀但仍需额外角色保护的路径。
 */
const EXTRA_PROTECTED: Record<string, UserRole[]> = {
  "/settings/configs": ["admin"],
};

// ── Public API ────────────────────────────────────────────────

/**
 * 判断给定路径是否允许指定角色访问。
 * 返回 true 表示允许，false 表示拒绝。
 */
export function isRouteAllowed(pathname: string, role: UserRole): boolean {
  // /admin/* 前缀匹配
  if (pathname.startsWith("/admin")) {
    const matched = Object.entries(ADMIN_WHITELIST).find(([path]) =>
      pathname === path || pathname.startsWith(path + "/")
    );
    const allowedRoles = matched ? matched[1] : ["admin"] as UserRole[];
    return allowedRoles.includes(role);
  }

  // 额外保护路径
  const extraMatch = Object.entries(EXTRA_PROTECTED).find(([path]) =>
    pathname === path || pathname.startsWith(path + "/")
  );
  if (extraMatch) {
    return extraMatch[1].includes(role);
  }

  // 其余路径对所有已登录用户开放
  return true;
}

/**
 * 判断导航项是否对指定角色可见。
 * TopNav 用此函数过滤子菜单项。
 */
export function isNavItemVisible(href: string, role: UserRole): boolean {
  return isRouteAllowed(href, role);
}

/**
 * 获取某路径所需的最低角色（供 TopNav minRole 使用）。
 */
export function getMinRole(href: string): UserRole {
  if (href.startsWith("/admin")) {
    const matched = Object.entries(ADMIN_WHITELIST).find(([path]) =>
      href === path || href.startsWith(path + "/")
    );
    if (matched) {
      // 白名单中最低角色
      if (matched[1].includes("user")) return "user";
      if (matched[1].includes("operator")) return "operator";
      return "admin";
    }
    return "admin";
  }

  const extraMatch = Object.entries(EXTRA_PROTECTED).find(([path]) =>
    href === path || href.startsWith(path + "/")
  );
  if (extraMatch) {
    if (extraMatch[1].includes("user")) return "user";
    if (extraMatch[1].includes("operator")) return "operator";
    return "admin";
  }

  return "user";
}
