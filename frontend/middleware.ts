import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Root path → redirect to /dashboard
  // AuthGuard handles unauthenticated users → /login
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url, 302);
  }

  // All other matched paths: let them through
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image, _next/data (Next.js internals)
     * - api routes (proxied by rewrites)
     * - static assets (favicon, images, etc.)
     */
    "/((?!_next|api|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
