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

/**
 * SSR-only 页面：仅搜索引擎/AI 引擎可直接访问，
 * 普通用户访问时重定向到登录页。
 */
const SSR_ONLY_PATHS = ['/rankings', '/ai-adversarial'];

/** 已知搜索引擎和 AI 爬虫 User-Agent 关键词 */
const BOT_UA_PATTERNS = [
  // Search engines
  'googlebot', 'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot',
  'slurp', 'sogou', 'exabot', 'facebot', 'ia_archiver',
  // AI crawlers — 国际
  'gptbot', 'chatgpt-user', 'oai-searchbot',           // OpenAI / GPT
  'claude-web', 'claudebot', 'anthropic',               // Claude / Anthropic
  'google-extended', 'gemini',                           // Google Gemini
  'perplexitybot',                                       // Perplexity
  'cohere-ai',                                           // Cohere
  'applebot',                                            // Apple / Siri
  'meta-externalagent',                                  // Meta AI
  'ccbot',                                               // Common Crawl (训练数据)
  // AI crawlers — 中国
  'bytespider', 'doubao',                                // 字节跳动 / 豆包
  'deepseek',                                            // DeepSeek
  'erniebot', 'yisou',                                   // 百度 文心一言
  'tongyi', 'qwen',                                      // 阿里 通义千问
  'moonshotbot', 'kimi',                                 // Moonshot / Kimi
  'baichuanbot', 'baichuan',                             // 百川
  'chatglm', 'zhipuai',                                  // 智谱 ChatGLM
  'minimax', 'abacus',                                   // MiniMax / 阶跃星辰
  'sensenovabot',                                        // 商汤 SenseNova
  '360spider',                                           // 360 搜索/AI
  // SEO / 社交分享爬虫
  'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'petalbot',
  'twitterbot', 'linkedinbot', 'whatsapp', 'telegrambot',
  'discordbot', 'slackbot',
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_UA_PATTERNS.some((pattern) => ua.includes(pattern));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 根路径：检测语言后重定向到 /{locale} 首页（Landing Page）
  if (pathname === '/') {
    const locale = detectUserLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    return NextResponse.redirect(url, 302);
  }

  // SSR-only 页面：爬虫放行，普通用户重定向到登录页
  const ua = request.headers.get('user-agent');
  const pathWithoutLocale = pathname.replace(/^\/(zh-CN|zh-TW|en)/, '');
  if (SSR_ONLY_PATHS.some((p) => pathWithoutLocale === p || pathWithoutLocale === `${p}/`)) {
    if (!isBot(ua)) {
      const locale = detectUserLocale(request);
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/login`;
      return NextResponse.redirect(url, 302);
    }
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
