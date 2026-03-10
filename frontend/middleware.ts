import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales } from './i18n';

// 创建 next-intl 中间件
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale: 'zh-CN',
  localePrefix: 'always', // 始终显示语言前缀
  localeDetection: true, // 自动检测浏览器语言
});

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 根路径：检测语言后重定向到 /{locale} 首页（Landing Page）
  if (pathname === '/') {
    const locale = detectUserLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    return NextResponse.redirect(url, 302);
  }

  // 应用 next-intl 中间件处理语言路由
  return intlMiddleware(request);
}

/**
 * 检测用户语言偏好
 * 优先级：localStorage (通过 cookie) > Accept-Language > 默认语言
 */
function detectUserLocale(request: NextRequest): string {
  // 1. 尝试从 cookie 读取（前端会将 localStorage 同步到 cookie）
  const cookieLocale = request.cookies.get('preferred_locale')?.value;
  if (cookieLocale && locales.includes(cookieLocale as any)) {
    return cookieLocale;
  }

  // 2. 从 Accept-Language header 检测
  const acceptLanguage = request.headers.get('Accept-Language');
  if (acceptLanguage) {
    for (const langRange of acceptLanguage.split(',')) {
      const lang = langRange.split(';')[0].trim();
      if (locales.includes(lang as any)) {
        return lang;
      }
      // 处理简化形式（如 "zh" -> "zh-CN"）
      if (lang.startsWith('zh')) {
        return 'zh-CN';
      }
      if (lang.startsWith('en')) {
        return 'en';
      }
    }
  }

  // 3. 默认语言
  return 'zh-CN';
}

export const config = {
  // 匹配所有路径，除了 API、静态文件、Next.js 内部路径
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
