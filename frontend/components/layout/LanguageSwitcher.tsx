'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authHeaders } from '@/lib/api/auth';

const LOCALES = [
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
  { code: 'zh-TW', name: '繁體中文', flag: '🇭🇰' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
] as const;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const currentLocale = LOCALES.find(l => l.code === locale) || LOCALES[0];

  const switchLocale = async (newLocale: string) => {
    const startMark = `locale-switch-start-${Date.now()}`;
    const endMark = `locale-switch-end-${Date.now()}`;
    const measureName = `locale-switch-${Date.now()}`;

    // 性能监控开始
    performance.mark(startMark);

    // 保存到 localStorage
    localStorage.setItem('preferred_locale', newLocale);

    // 同步到服务器（已登录用户）
    try {
      await fetch(`${API_BASE}/api/user/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ locale: newLocale }),
      });
    } catch (error) {
      console.warn('Failed to sync locale to server:', error);
    }

    // 切换路由
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    startTransition(() => {
      router.replace(newPath);
      
      // 性能监控结束 - 在路由切换后测量
      requestAnimationFrame(() => {
        performance.mark(endMark);
        performance.measure(measureName, startMark, endMark);
        
        const measure = performance.getEntriesByName(measureName)[0];
        if (measure) {
          const duration = Math.round(measure.duration);
          
          // 记录性能日志
          if (duration > 500) {
            console.warn(
              `[Performance] Slow locale switch detected: ${duration}ms (target: <500ms)`,
              {
                from: locale,
                to: newLocale,
                duration,
                timestamp: new Date().toISOString(),
              }
            );
            
            // 在生产环境可以上报到监控系统
            if (typeof window !== 'undefined' && (window as any).analytics) {
              (window as any).analytics.track('slow_locale_switch', {
                from: locale,
                to: newLocale,
                duration,
              });
            }
          } else {
            console.log(
              `[Performance] Locale switch completed: ${duration}ms`,
              {
                from: locale,
                to: newLocale,
                duration,
              }
            );
          }
          
          // 清理性能标记，避免内存泄漏
          performance.clearMarks(startMark);
          performance.clearMarks(endMark);
          performance.clearMeasures(measureName);
        }
      });
    });
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <motion.button
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors w-[120px] h-[36px]"
          disabled={isPending}
          aria-label="Switch language"
          key={locale}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.span 
            className="text-lg"
            key={`flag-${locale}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {currentLocale.flag}
          </motion.span>
          <motion.span 
            className="text-sm text-zinc-300"
            key={`name-${locale}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {currentLocale.name}
          </motion.span>
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc.code}
            onClick={() => switchLocale(loc.code)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 w-full"
            >
              <span className="text-lg">{loc.flag}</span>
              <span className="text-sm">{loc.name}</span>
              {loc.code === locale && (
                <motion.span 
                  className="ml-auto text-indigo-400"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  ✓
                </motion.span>
              )}
            </motion.div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
