import type { Metadata } from "next";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const isZh = locale.startsWith("zh");
  return {
    title: isZh ? "洞察专区 - AXIOM洞察" : "Insights - AXIOM Insight",
    description: isZh
      ? "深度解读加密货币庄家行为、链上数据分析方法、AI 量化交易策略，帮助交易者穿透市场噪音"
      : "Deep analysis of crypto market maker behavior, on-chain data interpretation, and AI-driven trading strategies",
    keywords: isZh
      ? "庄家行为分析,链上数据,加密货币分析,AI交易,比特币主力,市场操纵识别"
      : "market maker analysis,on-chain data,crypto analysis,AI trading,bitcoin whale",
    openGraph: {
      title: isZh ? "洞察专区 - AXIOM洞察" : "Insights - AXIOM Insight",
      description: isZh
        ? "深度解读庄家行为与链上数据"
        : "Deep insights on market maker behavior and on-chain data",
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630 }],
    },
    alternates: {
      canonical: `${BASE_URL}/${locale}/insights`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN/insights`,
        "zh-TW": `${BASE_URL}/zh-TW/insights`,
        en: `${BASE_URL}/en/insights`,
      },
    },
  };
}

const ARTICLES = [
  {
    slug: "what-is-market-maker",
    emoji: "🎯",
    titleZh: "什么是庄家行为？如何识别主力控盘信号",
    titleEn: "What Is Market Maker Behavior? How to Identify Signals",
    descZh: "在加密市场中，庄家掌控着大量筹码，他们的行为模式会在价格、链上数据和合约市场中留下可识别的痕迹。本文详细解析庄家的操盘逻辑与识别方法。",
    descEn: "In crypto markets, market makers control large positions. Their behaviors leave identifiable traces in price action, on-chain data, and derivatives markets.",
    tagZh: "基础知识",
    tagEn: "Fundamentals",
    color: "indigo",
  },
  {
    slug: "onchain-data-guide",
    emoji: "🔗",
    titleZh: "链上数据完全指南：读懂聪明钱的流向",
    titleEn: "Complete Guide to On-Chain Data: Tracking Smart Money",
    descZh: "链上数据是区块链的公开账本，记录了每一笔转账。通过分析大额转账、交易所流入流出、持仓集中度等指标，可以追踪主力资金的真实动向，比技术分析更难被操控。",
    descEn: "On-chain data is the public blockchain ledger. By analyzing large transfers, exchange flows, and holding concentration, you can track smart money before price moves.",
    tagZh: "数据分析",
    tagEn: "Data Analysis",
    color: "emerald",
  },
  {
    slug: "btc-manipulation-patterns",
    emoji: "📊",
    titleZh: "BTC 常见主力操盘套路解析：拉盘、砸盘、洗盘全图解",
    titleEn: "BTC Market Manipulation Patterns: Pump, Dump & Accumulation Explained",
    descZh: "加密市场常见的主力操盘手法包括：吸筹（悄然建仓）、拉升（制造 FOMO）、派发（高位出货）、洗盘（清洗浮筹）四个核心阶段。了解这些套路，避免成为被割的韭菜。",
    descEn: "Common crypto manipulation patterns: accumulation, markup, distribution, and markdown. Understanding these phases helps you avoid being caught on the wrong side.",
    tagZh: "实战策略",
    tagEn: "Strategy",
    color: "amber",
  },
];

const FAQS = [
  {
    q: "AI 能准确预测加密货币价格吗？",
    a: "AI 无法准确预测价格，但可以从多个维度分析市场信号，提高判断的准确率。AXIOM洞察的多智能体系统通过技术面、链上数据、合约市场、情绪面同时分析，提供综合参考，而非单一预测。",
  },
  {
    q: "链上数据和技术分析有什么区别？",
    a: "技术分析基于历史价格和成交量图表，容易被庄家制造假信号（如假突破）。链上数据来自区块链公开账本，记录的是真实的资金流动，相对更难伪造，能更早发现主力动向。",
  },
  {
    q: "什么是合约资金费率，为什么重要？",
    a: "资金费率是永续合约多空双方定期互相支付的费用。当资金费率持续偏高（多方付钱给空方），说明市场过度乐观，往往是回调信号；持续偏低则相反。这是判断市场情绪极值的重要指标之一。",
  },
  {
    q: "庄家如何在链上数据里隐藏行踪？",
    a: "庄家通常会使用多个钱包地址分散资金、利用混币器、在低流动性时段操作，或通过场外交易（OTC）绕过链上记录。但大规模资金移动仍然会在交易所数据和持仓集中度上留下痕迹。",
  },
];

function colorClasses(color: string) {
  if (color === "indigo") return { tag: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20", bar: "bg-indigo-500", glow: "hover:border-indigo-500/30" };
  if (color === "emerald") return { tag: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", bar: "bg-emerald-500", glow: "hover:border-emerald-500/30" };
  return { tag: "text-amber-400 bg-amber-500/10 border-amber-500/20", bar: "bg-amber-500", glow: "hover:border-amber-500/30" };
}

export default async function InsightsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const isZh = locale.startsWith("zh");

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: isZh ? "洞察专区 - AXIOM洞察" : "Insights - AXIOM Insight",
    description: isZh
      ? "深度解读加密货币庄家行为、链上数据分析方法、AI 量化交易策略"
      : "Deep analysis of crypto market maker behavior and on-chain data",
    url: `${BASE_URL}/${locale}/insights`,
    hasPart: ARTICLES.map((a) => ({
      "@type": "Article",
      name: isZh ? a.titleZh : a.titleEn,
      description: isZh ? a.descZh : a.descEn,
      url: `${BASE_URL}/${locale}/insights/${a.slug}`,
    })),
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <div className="min-h-screen bg-black text-white font-sans selection:bg-indigo-500/30">
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-black/60 backdrop-blur-2xl">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href={`/${locale}`} className="flex items-center gap-3 text-white font-black tracking-widest uppercase text-lg hover:opacity-80 transition-opacity">
              AXIOM
            </Link>
            <nav className="flex items-center gap-6 text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-500">
              <Link href={`/${locale}/guide`} className="hover:text-white transition-colors">{isZh ? "使用指南" : "Guide"}</Link>
              <Link href={`/${locale}/login`} className="text-zinc-400 hover:text-white border px-4 py-1.5 border-white/10 hover:border-white/30 hover:bg-white/5 transition-colors">
                {isZh ? "登录" : "Login"}
              </Link>
            </nav>
          </div>
        </header>

        <main className="pt-28 pb-24 max-w-5xl mx-auto px-4">
          <div className="mb-16 border-b border-white/[0.05] pb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 border-l-2 border-indigo-500 bg-indigo-500/10 text-[10px] font-mono text-indigo-400 mb-6 uppercase tracking-[0.2em]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 bg-indigo-500" />
              </span>
              {isZh ? "知识库 · 持续更新" : "Knowledge Base · Updated Regularly"}
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4 uppercase">
              {isZh ? "洞察专区" : "Insights"}
            </h1>
            <p className="text-zinc-500 text-sm font-mono leading-relaxed max-w-2xl">
              {isZh
                ? "深度解读加密货币庄家行为、链上数据分析方法与 AI 量化策略，帮助你穿透市场噪音，做出更理性的交易决策。"
                : "Deep analysis of crypto market maker behavior, on-chain data methods and AI strategies to help you see through market noise."}
            </p>
          </div>

          <section aria-label={isZh ? "深度文章" : "Articles"}>
            <h2 className="text-[10px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
              <span className="w-0.5 h-3 bg-indigo-500" />
              {isZh ? "深度解析" : "Deep Analysis"}
            </h2>
            <div className="grid gap-6">
              {ARTICLES.map((article) => {
                const c = colorClasses(article.color);
                return (
                  <Link
                    key={article.slug}
                    href={`/${locale}/insights/${article.slug}`}
                    className={`group relative bg-black border border-white/[0.07] p-6 lg:p-8 overflow-hidden transition-all duration-300 hover:bg-white/[0.02] ${c.glow} block`}
                  >
                    <div className={`absolute top-0 left-0 w-full h-[1px] ${c.bar} opacity-0 group-hover:opacity-100 transition-opacity`} />
                    <div className="flex items-start gap-4">
                      <span className="text-3xl">{article.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`text-[9px] font-black font-mono tracking-widest uppercase px-2 py-0.5 border ${c.tag}`}>
                            {isZh ? article.tagZh : article.tagEn}
                          </span>
                        </div>
                        <h3 className="text-white font-black text-lg tracking-tight mb-3 group-hover:text-indigo-300 transition-colors">
                          {isZh ? article.titleZh : article.titleEn}
                        </h3>
                        <p className="text-zinc-500 text-[13px] font-mono leading-relaxed">
                          {isZh ? article.descZh : article.descEn}
                        </p>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-bold font-mono text-zinc-400 group-hover:text-indigo-400 uppercase tracking-widest transition-colors">
                          {isZh ? "阅读全文" : "Read More"} →
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="mt-20" aria-label={isZh ? "常见问题" : "FAQ"}>
            <h2 className="text-[10px] font-black font-mono text-zinc-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
              <span className="w-0.5 h-3 bg-zinc-500" />
              {isZh ? "常见问题" : "Frequently Asked Questions"}
            </h2>
            <div className="space-y-4">
              {FAQS.map((faq, i) => (
                <div key={i} className="border border-white/[0.06] bg-white/[0.01] p-6">
                  <h3 className="text-white font-black text-sm mb-3 flex items-start gap-3">
                    <span className="text-indigo-400 font-mono text-[10px] mt-0.5 shrink-0">Q{i + 1}</span>
                    {faq.q}
                  </h3>
                  <p className="text-zinc-500 text-[13px] font-mono leading-relaxed pl-7">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-20 border border-indigo-500/20 bg-indigo-500/5 p-8 text-center">
            <h2 className="text-2xl font-black text-white mb-3">
              {isZh ? "想让 AI 替你分析庄家动向？" : "Want AI to Analyze Market Makers For You?"}
            </h2>
            <p className="text-zinc-500 text-sm font-mono mb-6">
              {isZh
                ? "AXIOM洞察 多智能体协同，实时追踪链上数据、合约市场与市场情绪，直接输出综合研判"
                : "AXIOM Insight multi-agent system tracks on-chain data, derivatives and sentiment in real time"}
            </p>
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 font-black font-mono uppercase tracking-widest text-sm transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]"
            >
              {isZh ? "免费开始使用" : "Start for Free"} →
            </Link>
          </section>
        </main>

        <footer className="py-8 border-t border-white/[0.04] text-center text-[10px] text-zinc-500 font-mono tracking-widest uppercase">
          <p>© {new Date().getFullYear()} AXIOM洞察 · {isZh ? "保留所有权利" : "All Rights Reserved"}</p>
        </footer>
      </div>
    </>
  );
}
