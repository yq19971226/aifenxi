import type { Metadata } from "next";
import Link from "next/link";
import { AdversarialPublicClient } from "./client";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";
const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "";

/* ── SEO Metadata ── */

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const isZh = locale.startsWith("zh");
  return {
    title: isZh
      ? "AI 对抗推演 — AXIOM 洞察 | 庄家操盘意图 · 实时预警"
      : "AI Adversarial Analysis — AXIOM Insight | Market Maker Intent · Real-time Alerts",
    description: isZh
      ? "站在庄家AI视角反推下一步操盘策略。实时对抗推演分析，识别止损猎杀、假突破、FOMO诱多等主力手法。风险区/安全区/机会区全面展示。"
      : "Analyze market from the market maker's AI perspective. Real-time adversarial analysis identifies stop hunts, fake breakouts, and FOMO traps. Danger/Safety/Opportunity zones displayed.",
    keywords: isZh
      ? "AI对抗推演,庄家操盘意图,主力手法识别,止损猎杀,假突破分析,FOMO陷阱,加密货币风险预警,做市商行为分析"
      : "AI adversarial analysis,market maker intent,whale manipulation,stop hunt detection,fake breakout,FOMO trap,crypto risk alert,dealer behavior",
    openGraph: {
      title: isZh
        ? "AI 对抗推演 — AXIOM 洞察"
        : "AI Adversarial Analysis — AXIOM Insight",
      description: isZh
        ? "AI 视角分析庄家操盘意图，实时风险预警"
        : "AI-powered market maker intent analysis with real-time risk alerts",
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630 }],
    },
    alternates: {
      canonical: `${BASE_URL}/${locale}/ai-adversarial`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN/ai-adversarial`,
        "zh-TW": `${BASE_URL}/zh-TW/ai-adversarial`,
        en: `${BASE_URL}/en/ai-adversarial`,
      },
    },
  };
}

/* ── Server-side data fetch ── */

async function fetchPublicDefense(symbol: string) {
  try {
    const res = await fetch(
      `${API_BASE}/api/public/defense/latest?symbol=${symbol}`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ── Page Component (Server) ── */

export default async function PublicAdversarialPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const isZh = locale.startsWith("zh");

  // 默认加载 BTC 和 ETH 的数据
  const [btcData, ethData] = await Promise.all([
    fetchPublicDefense("BTCUSDT"),
    fetchPublicDefense("ETHUSDT"),
  ]);

  const currentData = btcData; // 默认展示 BTC

  // 提取 adversarial 信号信息供结构化数据使用
  const adv = currentData?.adversarial;
  const signal = adv?.signal || "neutral";
  const confidence = typeof adv?.confidence === "number" ? adv.confidence : 0;
  const rawData = adv?.raw_data as Record<string, unknown> | undefined;
  const strategyType = (rawData?.strategy_type as string) || "wait";
  const dealerIntent = (rawData?.dealer_intent as string) || "";

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: isZh ? "AI 对抗推演" : "AI Adversarial Analysis",
    description: isZh
      ? "站在庄家AI视角反推下一步操盘策略"
      : "Analyze market from the market maker's AI perspective",
    url: `${BASE_URL}/${locale}/ai-adversarial`,
    publisher: {
      "@type": "Organization",
      name: "AXIOM Insight",
      url: BASE_URL,
    },
    mainEntity: {
      "@type": "AnalysisNewsArticle",
      headline: dealerIntent || (isZh ? "AI 对抗推演分析" : "AI Adversarial Analysis"),
      description: isZh
        ? `信号方向: ${signal === "bullish" ? "看涨" : signal === "bearish" ? "看跌" : "中性"}, 置信度: ${(confidence * 100).toFixed(0)}%, 策略: ${strategyType}`
        : `Signal: ${signal}, Confidence: ${(confidence * 100).toFixed(0)}%, Strategy: ${strategyType}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500/30">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-black/60 backdrop-blur-2xl">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link
              href={`/${locale}`}
              className="flex items-center gap-3 text-white font-black tracking-widest uppercase text-lg hover:opacity-80 transition-opacity"
            >
              AXIOM
            </Link>
            <nav className="flex items-center gap-6 text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-500">
              <Link href={`/${locale}/rankings`} className="hover:text-white transition-colors">
                {isZh ? "排行榜" : "Rankings"}
              </Link>
              <Link href={`/${locale}/insights`} className="hover:text-white transition-colors">
                {isZh ? "洞察" : "Insights"}
              </Link>
              <Link
                href={`/${locale}/login`}
                className="text-zinc-400 hover:text-white border px-4 py-1.5 border-white/10 hover:border-white/30 hover:bg-white/5 transition-colors"
              >
                {isZh ? "登录" : "Login"}
              </Link>
            </nav>
          </div>
        </header>

        {/* Main */}
        <main className="pt-28 pb-24 max-w-5xl mx-auto px-4">
          <div className="mb-12 border-b border-white/[0.05] pb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 border-l-2 border-red-500 bg-red-500/10 text-[10px] font-mono text-red-400 mb-6 uppercase tracking-[0.2em]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 bg-red-500" />
              </span>
              {isZh ? "AI 实时推演 · 每分钟更新" : "AI Real-time · Updated Every Minute"}
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4 uppercase">
              {isZh ? "AI 对抗推演" : "AI Adversarial Analysis"}
            </h1>
            <p className="text-zinc-500 text-sm font-mono leading-relaxed max-w-2xl">
              {isZh
                ? "站在庄家AI视角反推下一步操盘策略。通过多智能体对抗推演，识别止损猎杀、假突破、FOMO诱多等主力手法，帮助散户提前防范。登录后可实时交互、切换币种并获得完整分析。"
                : "Analyze market movements from the market maker's perspective using multi-agent adversarial simulation. Identifies stop hunts, fake breakouts, and FOMO traps. Log in for real-time interaction and full analysis."}
            </p>
          </div>

          <AdversarialPublicClient
            initialBtcData={btcData}
            initialEthData={ethData}
            locale={locale}
          />

          {/* CTA */}
          <section className="mt-20 border border-red-500/20 bg-red-500/5 p-8 text-center">
            <h2 className="text-2xl font-black text-white mb-3">
              {isZh ? "解锁完整对抗推演" : "Unlock Full Adversarial Analysis"}
            </h2>
            <p className="text-zinc-500 text-sm font-mono mb-6">
              {isZh
                ? "旗舰会员可实时查看完整推演、切换币种、自动刷新，系统每分钟分析一次最新数据"
                : "Flagship members get real-time full analysis, symbol switching, auto-refresh with per-minute data updates"}
            </p>
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-8 py-3 font-black font-mono uppercase tracking-widest text-sm transition-all hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]"
            >
              {isZh ? "免费注册" : "Sign Up Free"} →
            </Link>
          </section>
        </main>

        <footer className="py-8 border-t border-white/[0.04] text-center">
          <p className="max-w-2xl mx-auto px-4 mb-4 text-[9px] leading-relaxed text-zinc-500/80 font-sans">
            {isZh
              ? "本平台提供的所有分析内容仅供参考研究，不构成任何投资建议。加密货币市场风险极高，请根据自身情况独立判断。"
              : "All analysis provided is for reference only and does not constitute investment advice. Cryptocurrency markets carry extremely high risk."}
          </p>
          <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">
            © {new Date().getFullYear()} AXIOM · {isZh ? "保留所有权利" : "All Rights Reserved"}
          </p>
        </footer>
      </div>
    </>
  );
}
