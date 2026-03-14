import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

export const locales = ['zh-CN', 'zh-TW', 'en'] as const;
export type Locale = (typeof locales)[number];

async function loadMessages(locale: string): Promise<Record<string, any>> {
  // 1. 加载扁平主文件 messages/{locale}.json
  let base: Record<string, any> = {};
  try {
    base = (await import(`./messages/${locale}.json`)).default;
  } catch {
    console.warn(`Failed to load base messages for ${locale}`);
  }

  // 2. 加载目录分文件 messages/{locale}/*.json，合并覆盖
  const namespaces = [
    'common', 'nav', 'dashboard', 'consensus', 'analysis', 'login',
    'alerts', 'performance', 'settings', 'onchain', 'errors', 'metadata',
    'playbook-sim', 'tasks', 'partner', 'leaderboard', 'backtest', 'announcements', 'landing', 'guide', 'admin',
    'autopilots', 'position',
  ];
  for (const ns of namespaces) {
    try {
      const mod = (await import(`./messages/${locale}/${ns}.json`)).default;
      base[ns] = { ...base[ns], ...mod };
    } catch {
      // 目录分文件不存在则跳过，使用扁平文件中的值
    }
  }

  return base;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;

  // 验证语言代码
  if (!locale || !locales.includes(locale as Locale)) {
    notFound();
  }

  let messages: Record<string, any>;
  try {
    messages = await loadMessages(locale);
  } catch {
    console.error(`Failed to load locale ${locale}, falling back to en`);
    messages = await loadMessages('en');
  }

  return {
    locale,
    messages,
    
    // 错误处理
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('i18n error:', error);
      } else {
        // 生产环境记录到日志系统
        console.warn('i18n_error', { error: error.message });
      }
    },
    
    // 降级处理：缺失翻译键时的回退策略
    getMessageFallback: ({ namespace, key, error }) => {
      const path = [namespace, key].filter(Boolean).join('.');
      if (process.env.NODE_ENV === 'development') {
        return `⚠️ ${path}`;
      }
      return path;
    },
  };
});
