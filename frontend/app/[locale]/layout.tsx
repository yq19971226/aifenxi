import type { Metadata } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';
import { Providers } from "@/lib/providers";
import { ToastProvider } from "@/components/ui/Toast";
import { LangAttr } from "@/components/layout/LangAttr";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'metadata.site' });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.axiom123.cc';

  const keywords = locale.startsWith('zh')
    ? '加密货币分析,庄家行为分析,AI智能分析,比特币分析,链上数据,AXIOM洞察'
    : 'crypto analysis,market maker,AI trading,on-chain analytics,AXIOM Insight';

  return {
    title: t('title'),
    description: t('description'),
    keywords,
    openGraph: {
      title: t('og_title'),
      description: t('og_description'),
      locale,
      type: 'website',
      siteName: 'AXIOM洞察',
      images: [{
        url: `${baseUrl}/og-image.png`,
        width: 1200,
        height: 630,
      }],
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        ...Object.fromEntries(
          locales.map((l) => [l, `${baseUrl}/${l}`])
        ),
        'x-default': `${baseUrl}/zh-CN`,
      },
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // 验证语言代码
  if (!locales.includes(locale as any)) {
    notFound();
  }

  // 加载翻译资源
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LangAttr />
      <Providers>
        <ToastProvider>
          {children}
        </ToastProvider>
      </Providers>
    </NextIntlClientProvider>
  );
}
