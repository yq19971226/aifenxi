/**
 * Shared locale utilities — single source of truth for locale extraction.
 */

export const SUPPORTED_LOCALES = ["zh-CN", "zh-TW", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: SupportedLocale = "zh-CN";

/** Auth-related route segments (used by AuthGuard to skip redirect). */
export const AUTH_SEGMENTS = new Set(["login", "register", "forgot-password"]);

/**
 * Extract locale from a pathname like `/{locale}/dashboard`.
 * Returns the default locale when the first segment is not recognised.
 */
export function getLocaleFromPathname(pathname: string): SupportedLocale {
  const segment = pathname.split("/")[1] || "";
  return (SUPPORTED_LOCALES as readonly string[]).includes(segment)
    ? (segment as SupportedLocale)
    : DEFAULT_LOCALE;
}

/**
 * Check whether the pathname points to a public auth page
 * (login / register / forgot-password).
 *
 * Uses segment-level comparison so `/admin/login-logs` won't match.
 */
export function isAuthRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments.some((seg) => AUTH_SEGMENTS.has(seg));
}
