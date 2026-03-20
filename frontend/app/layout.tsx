import { type Metadata, type Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AXIOM洞察 - 加密货币庄家行为 AI 分析平台 | 链上数据实时监控",
    template: "%s | AXIOM洞察",
  },
  description: "AXIOM洞察多智能体 AI 协同侦测加密市场庄家行为、巨鲸动向，融合技术面、链上数据、合约市场、市场情绪，为比特币、以太坊等主流币种提供实时交易参考。",
  keywords: [
    // 中文核心词
    "加密货币分析", "庄家行为分析", "AI智能分析", "链上数据", "链上数据分析",
    "合约市场", "资金费率", "多空比", "巨鲸追踪", "聪明钱",
    "比特币分析", "以太坊分析", "BTC分析", "ETH分析", "SOL分析",
    "加密交易信号", "量化交易", "市场情绪分析", "多智能体", "AI交易",
    "AXIOM洞察", "AXIOM分析",
    // 英文核心词
    "crypto analysis", "market maker detection", "whale tracking",
    "on-chain analytics", "smart money", "AI trading signals",
    "Bitcoin analysis", "Ethereum analysis", "crypto AI",
    "derivatives flow", "funding rate", "long short ratio",
    "AXIOM Insight", "market maker AI",
  ],
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.svg",
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc"),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || "",
  },
  other: {
    "baidu-site-verification": process.env.NEXT_PUBLIC_BAIDU_VERIFICATION || "",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "AXIOM洞察",
  "alternateName": "AXIOM Insight",
  "url": SITE_URL,
  "description": "多智能体 AI 协同侦测加密市场庄家行为、巨鲸动向，融合技术面、链上数据、合约市场、市场情绪，为比特币、以太坊等主流币种提供实时交易参考。",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "CNY",
    "description": "免费注册获得体验次数"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "156"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <Script
          id="json-ld-site"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-bg-primary text-foreground overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}
