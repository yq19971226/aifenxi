import type { Metadata } from "next";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const isZh = locale.startsWith("zh");
  return {
    title: isZh ? "什么是庄家行为？如何识别主力控盘信号 - AXIOM洞察" : "What Is Market Maker Behavior? - AXIOM Insight",
    description: isZh
      ? "在加密市场中，庄家掌控大量筹码，其行为模式在价格、链上数据和合约市场中留下可识别的痕迹。本文详细解析庄家操盘逻辑与识别方法。"
      : "Market makers control large positions. Their behaviors leave identifiable traces in price action, on-chain data, and derivatives markets.",
    keywords: isZh ? "庄家行为,主力控盘,加密货币分析,链上数据,大额转账,合约持仓" : "market maker,crypto manipulation,on-chain whale,large transfers",
    openGraph: {
      title: isZh ? "什么是庄家行为？如何识别主力控盘信号" : "What Is Market Maker Behavior?",
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630 }],
    },
    alternates: {
      canonical: `${BASE_URL}/${locale}/insights/what-is-market-maker`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN/insights/what-is-market-maker`,
        "zh-TW": `${BASE_URL}/zh-TW/insights/what-is-market-maker`,
        en: `${BASE_URL}/en/insights/what-is-market-maker`,
      },
    },
  };
}

export default function ArticlePage({ params: { locale } }: { params: { locale: string } }) {
  const isZh = locale.startsWith("zh");

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: isZh ? "什么是庄家行为？如何识别主力控盘信号" : "What Is Market Maker Behavior? How to Identify Signals",
    description: isZh
      ? "在加密市场中，庄家掌控大量筹码，其行为模式在价格、链上数据和合约市场中留下可识别的痕迹。"
      : "Market makers control large positions. Their behaviors leave identifiable traces in price, on-chain data, and derivatives markets.",
    author: { "@type": "Organization", name: "AXIOM洞察" },
    publisher: { "@type": "Organization", name: "AXIOM洞察", url: BASE_URL },
    url: `${BASE_URL}/${locale}/insights/what-is-market-maker`,
    inLanguage: locale,
    datePublished: "2026-03-01",
    dateModified: "2026-03-15",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE_URL}/${locale}/insights/what-is-market-maker` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <div className="min-h-screen bg-black text-white font-sans">
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-black/60 backdrop-blur-2xl">
          <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href={`/${locale}`} className="font-black tracking-widest text-white uppercase hover:opacity-80 transition-opacity">AXIOM</Link>
            <Link href={`/${locale}/insights`} className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors uppercase tracking-widest">
              ← {isZh ? "洞察专区" : "Insights"}
            </Link>
          </div>
        </header>

        <article className="pt-28 pb-24 max-w-3xl mx-auto px-4">
          <div className="mb-8">
            <span className="text-[9px] font-black font-mono tracking-widest uppercase px-2 py-0.5 border text-indigo-400 bg-indigo-500/10 border-indigo-500/20">
              {isZh ? "基础知识" : "Fundamentals"}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white mb-6 leading-tight">
            {isZh ? "什么是庄家行为？如何识别主力控盘信号" : "What Is Market Maker Behavior? How to Identify Signals"}
          </h1>
          <p className="text-zinc-500 text-sm font-mono mb-12 pb-8 border-b border-white/[0.06]">
            {isZh ? "AXIOM洞察 研究团队 · 2026年3月" : "AXIOM Insight Research · March 2026"}
          </p>

          {isZh ? (
            <div className="prose-custom space-y-8 text-zinc-400 text-[15px] leading-relaxed font-mono">
              <section>
                <h2 className="text-white font-black text-xl mb-4">庄家（主力）是谁？</h2>
                <p>在加密货币市场中，&ldquo;庄家&rdquo;泛指拥有足够大量资金、能够对价格走势产生实质性影响的参与者。他们可能是：</p>
                <ul className="list-none space-y-2 mt-4 pl-4 border-l border-indigo-500/30">
                  <li className="flex items-start gap-3"><span className="text-indigo-400 mt-1">▸</span><span><strong className="text-white">大型交易所和做市商</strong>：负责提供市场流动性，同时也会博取价差利润</span></li>
                  <li className="flex items-start gap-3"><span className="text-indigo-400 mt-1">▸</span><span><strong className="text-white">项目方和早期投资人</strong>：持有大量代币，其卖出行为会直接压低价格</span></li>
                  <li className="flex items-start gap-3"><span className="text-indigo-400 mt-1">▸</span><span><strong className="text-white">巨鲸（Whale）</strong>：持有超过 1000 枚 BTC 的大户，其动向是链上分析的核心对象</span></li>
                  <li className="flex items-start gap-3"><span className="text-indigo-400 mt-1">▸</span><span><strong className="text-white">量化做市机构</strong>：通过算法高频交易，在短时间内影响价格</span></li>
                </ul>
              </section>

              <section>
                <h2 className="text-white font-black text-xl mb-4">庄家操盘的四个核心阶段</h2>
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { phase: "01", name: "吸筹（建仓期）", color: "border-emerald-500/40 bg-emerald-500/5", tc: "text-emerald-400", desc: "在低价区域悄然买入，通常伴随成交量缩减，价格横盘震荡。此阶段散户往往感到无聊而离场，庄家正好趁机低价吸货。" },
                    { phase: "02", name: "拉升（造势期）", color: "border-indigo-500/40 bg-indigo-500/5", tc: "text-indigo-400", desc: "开始拉抬价格，制造 FOMO 情绪吸引散户跟风买入。成交量放大，但庄家已开始在拉升过程中分批出货。" },
                    { phase: "03", name: "派发（出货期）", color: "border-amber-500/40 bg-amber-500/5", tc: "text-amber-400", desc: "在高位向跟风的散户大量出货。价格可能仍在高位甚至创新高，但成交量异常放大，是明显的出货信号。" },
                    { phase: "04", name: "下跌（清洗期）", color: "border-red-500/40 bg-red-500/5", tc: "text-red-400", desc: "庄家出货完成后，价格失去支撑开始下跌。部分庄家会做空获利，散户高位套牢。" },
                  ].map((s) => (
                    <div key={s.phase} className={`border ${s.color} p-5`}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`font-black font-mono text-xs ${s.tc}`}>{s.phase}</span>
                        <h3 className={`font-black text-sm ${s.tc}`}>{s.name}</h3>
                      </div>
                      <p className="text-zinc-500 text-[13px]">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-white font-black text-xl mb-4">五大识别信号</h2>
                <p className="mb-4">以下是识别庄家行为最有效的技术和链上指标：</p>
                <div className="space-y-4">
                  {[
                    { title: "1. 大额链上转账", desc: "当有超过 1000 BTC 的大额转账从冷钱包流向交易所时，往往预示着抛压临近；反之，从交易所流出到冷钱包则是长期持有信号。" },
                    { title: "2. 交易所存量变化", desc: "交易所的 BTC/ETH 余额持续下降（即用户提币到私钥钱包），说明市场整体看多，惜售情绪浓；余额上升则相反。" },
                    { title: "3. 合约未平仓量（OI）", desc: "大量合约多单被清算后价格未跌，是洗盘信号；未平仓量骤然增加配合价格横盘，可能是庄家在对冲操作。" },
                    { title: "4. 资金费率异常", desc: "永续合约资金费率长期偏高（如 &gt;0.1%/8h），说明多头过度拥挤，是调整或插针风险的前兆。" },
                    { title: "5. 巨鲸持仓集中度", desc: "当持有 1000+ BTC 的地址数量快速增加（巨鲸在吸筹），或快速减少（巨鲸在分散出货），是重要的方向信号。" },
                  ].map((item) => (
                    <div key={item.title} className="border border-white/[0.06] p-5 hover:bg-white/[0.02] transition-colors">
                      <h3 className="text-white font-black text-sm mb-2">{item.title}</h3>
                      <p className="text-zinc-500 text-[13px]">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border border-indigo-500/20 bg-indigo-500/5 p-6 mt-8">
                <h2 className="text-white font-black text-lg mb-3">AXIOM洞察如何帮你识别庄家行为？</h2>
                <p className="text-zinc-400 text-sm mb-4">
                  手动分析以上所有信号耗时费力，且容易判断失误。AXIOM洞察的多智能体系统会同时从技术面、链上数据、合约市场、市场情绪四个维度自动分析，经过多轮 AI 辩论后输出综合判断，让你无需盯盘即可掌握主力动向。
                </p>
                <Link href={`/${locale}/login`} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 font-black font-mono uppercase tracking-widest text-[11px] transition-all">
                  免费体验多维分析 →
                </Link>
              </section>
            </div>
          ) : (
            <div className="space-y-8 text-zinc-400 text-[15px] leading-relaxed font-mono">
              <section>
                <h2 className="text-white font-black text-xl mb-4">Who Are Market Makers?</h2>
                <p>In crypto markets, &ldquo;market makers&rdquo; refers to large capital participants who can materially influence price movements. They include large exchanges, project teams, whales (holders of 1000+ BTC), and quantitative trading firms.</p>
              </section>
              <section>
                <h2 className="text-white font-black text-xl mb-4">The 4 Core Phases of Market Maker Activity</h2>
                <div className="grid gap-4">
                  {[
                    { phase: "01", name: "Accumulation", color: "border-emerald-500/40", tc: "text-emerald-400", desc: "Quietly buying at low prices while price consolidates sideways." },
                    { phase: "02", name: "Markup", color: "border-indigo-500/40", tc: "text-indigo-400", desc: "Pumping price to create FOMO while beginning to distribute to retail." },
                    { phase: "03", name: "Distribution", color: "border-amber-500/40", tc: "text-amber-400", desc: "Selling large positions at high prices to latecomers." },
                    { phase: "04", name: "Markdown", color: "border-red-500/40", tc: "text-red-400", desc: "Price drops after distribution is complete, retail is trapped at the top." },
                  ].map((s) => (
                    <div key={s.phase} className={`border ${s.color} p-5`}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`font-black font-mono text-xs ${s.tc}`}>{s.phase}</span>
                        <h3 className={`font-black text-sm ${s.tc}`}>{s.name}</h3>
                      </div>
                      <p className="text-zinc-500 text-[13px]">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="border border-indigo-500/20 bg-indigo-500/5 p-6">
                <h2 className="text-white font-black text-lg mb-3">How AXIOM Insight Identifies Market Maker Behavior</h2>
                <p className="text-zinc-400 text-sm mb-4">AXIOM&apos;s multi-agent system simultaneously analyzes technical indicators, on-chain data, derivatives markets, and sentiment to deliver a consolidated judgment &mdash; no manual research required.</p>
                <Link href={`/${locale}/login`} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 font-black font-mono uppercase tracking-widest text-[11px] transition-all">
                  Try Free Analysis →
                </Link>
              </section>
            </div>
          )}
        </article>
      </div>
    </>
  );
}
