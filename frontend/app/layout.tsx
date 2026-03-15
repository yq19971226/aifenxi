import { type Metadata, type Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
    default: "AXIOM洞察 - 庄家行为 AI 多维分析平台 | 加密货币智能分析",
    template: "%s | AXIOM洞察",
  },
  description: "AXIOM洞察是专业的加密货币 AI 多维分析平台，多智能体协同分析庄家行为，从技术面、链上数据、合约市场、市场情绪等维度洞察主力动向，为交易决策提供参考。",
  keywords: [
    "加密货币分析", "庄家行为分析", "AI智能分析", "比特币分析",
    "链上数据分析", "合约数据", "市场情绪", "多智能体",
    "量化交易", "加密市场", "BTC分析", "ETH分析",
    "crypto analysis", "market maker", "AI trading",
    "on-chain analytics", "AXIOM Insight",
  ],
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.svg",
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://axiom123.cc"),
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-bg-primary text-foreground overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}
