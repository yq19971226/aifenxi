import type { Metadata } from "next";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const isZh = locale.startsWith("zh");
  return {
    title: isZh ? "链上数据完全指南：读懂聪明钱的流向 - AXIOM洞察" : "Complete Guide to On-Chain Data: Tracking Smart Money - AXIOM Insight",
    description: isZh
      ? "链上数据来自区块链公开账本，记录每笔真实转账。通过分析大额转账、交易所流入流出、持仓集中度等指标，追踪主力资金流向，比技术分析更难被操控。"
      : "On-chain data from the blockchain ledger records real transfers. Analyzing exchange flows, whale concentration, and large transfers reveals smart money before price moves.",
    keywords: isZh
      ? "链上数据,聪明钱,交易所流入流出,巨鲸追踪,UTXO,Glassnode,链上分析"
      : "on-chain data,smart money,exchange inflow outflow,whale tracking,UTXO,Glassnode",
    openGraph: {
      title: isZh ? "链上数据完全指南：读懂聪明钱的流向" : "Complete Guide to On-Chain Data",
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630 }],
    },
    alternates: {
      canonical: `${BASE_URL}/${locale}/insights/onchain-data-guide`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN/insights/onchain-data-guide`,
        "zh-TW": `${BASE_URL}/zh-TW/insights/onchain-data-guide`,
        en: `${BASE_URL}/en/insights/onchain-data-guide`,
      },
    },
  };
}

const METRICS = [
  {
    name: "交易所净流量",
    nameEn: "Exchange Net Flow",
    color: "emerald",
    icon: "📥",
    desc: "统计流入和流出交易所的代币数量差值。净流入（资金进交易所）代表抛压增加；净流出（资金离开交易所）代表囤币意愿增强、看多信号。",
    descEn: "Measures the difference between tokens flowing into and out of exchanges. Net inflows = selling pressure; net outflows = holding signal.",
  },
  {
    name: "巨鲸持仓集中度",
    nameEn: "Whale Concentration",
    color: "indigo",
    icon: "🐋",
    desc: "持有 1000 BTC 以上的地址数量及持仓占比变化。集中度快速上升说明巨鲸在吸筹；快速下降说明在分散出货，是重要的方向指标。",
    descEn: "Tracks addresses holding 1000+ BTC. Rising concentration = whales accumulating; falling = distribution. A key directional signal.",
  },
  {
    name: "MVRV 比率",
    nameEn: "MVRV Ratio",
    color: "amber",
    icon: "📐",
    desc: "市场价值与已实现价值之比。MVRV > 3.5 历史上是明显高估、市场顶部区域；MVRV < 1 是严重低估、历史底部区域，是判断市场周期位置的利器。",
    descEn: "Market Value to Realized Value ratio. MVRV > 3.5 historically signals overvaluation (market tops); MVRV < 1 signals undervaluation (market bottoms).",
  },
  {
    name: "STH / LTH 持仓盈亏",
    nameEn: "STH / LTH Profitability",
    color: "purple",
    icon: "💡",
    desc: "短期持有者（<155天）和长期持有者（>155天）的整体浮盈浮亏情况。STH 普遍亏损+LTH 不抛售 = 底部特征；STH 大量获利了结 = 宏观风险信号。",
    descEn: "Short-term holder (<155d) and long-term holder (>155d) profitability. STH underwater + LTH holding = bottom signal; STH taking profits = top risk.",
  },
  {
    name: "资金费率",
    nameEn: "Funding Rate",
    color: "rose",
    icon: "⚡",
    desc: "永续合约多空双方定期结算的费用。持续正费率（多头付给空头）说明市场存在过热情绪；长期负费率则反映恐慌情绪，往往是反弹的前置条件。",
    descEn: "The periodic payment between longs and shorts in perpetual contracts. Sustained positive rates = market overheating; sustained negative rates = panic and potential reversal.",
  },
];

function colorStyle(color: string) {
  const map: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    indigo: "border-indigo-500/30 bg-indigo-500/5 text-indigo-400",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-400",
    purple: "border-purple-500/30 bg-purple-500/5 text-purple-400",
    rose: "border-rose-500/30 bg-rose-500/5 text-rose-400",
  };
  return map[color] ?? map.indigo;
}

export default function OnchainGuidePage({ params: { locale } }: { params: { locale: string } }) {
  const isZh = locale.startsWith("zh");

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: isZh ? "链上数据完全指南：读懂聪明錢的流向" : "Complete Guide to On-Chain Data: Tracking Smart Money",
    author: { "@type": "Organization", name: "AXIOM洞察", url: BASE_URL },
    publisher: { "@type": "Organization", name: "AXIOM洞察", url: BASE_URL,
      logo: { "@type": "ImageObject", url: `${BASE_URL}/favicon.svg` }
    },
    url: `${BASE_URL}/${locale}/insights/onchain-data-guide`,
    image: `${BASE_URL}/og-image.png`,
    inLanguage: locale,
    datePublished: "2026-03-05",
    dateModified: "2026-03-20",
    keywords: isZh
      ? "链上数据,聪明錢,交易所流入流出,巨鲸追踪,MVRV,资金费率,UTXO"
      : "on-chain data,smart money,exchange inflow outflow,whale tracking,MVRV,funding rate,UTXO,Glassnode",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE_URL}/${locale}/insights/onchain-data-guide` },
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
            <span className="text-[9px] font-black font-mono tracking-widest uppercase px-2 py-0.5 border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
              {isZh ? "数据分析" : "Data Analysis"}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white mb-6 leading-tight">
            {isZh ? "链上数据完全指南：读懂聪明钱的流向" : "Complete Guide to On-Chain Data: Tracking Smart Money"}
          </h1>
          <p className="text-zinc-500 text-sm font-mono mb-12 pb-8 border-b border-white/[0.06]">
            {isZh ? "AXIOM洞察 研究团队 · 2026年3月" : "AXIOM Insight Research · March 2026"}
          </p>

          <div className="space-y-10 text-zinc-400 text-[15px] leading-relaxed font-mono">
            <section>
              <h2 className="text-white font-black text-xl mb-4">
                {isZh ? "为什么链上数据比技术分析更可靠？" : "Why On-Chain Data Is More Reliable Than Technical Analysis?"}
              </h2>
              <p>
                {isZh
                  ? "技术分析依赖历史价格图表，而价格本身是可以被操控的。庄家可以轻松制造假突破、假信号来吸引散户。但是，区块链的公开账本记录了每一笔真实的资金转移——这些数据无法造假，是主力真实意图最忠实的记录。"
                  : "Technical analysis relies on historical price charts, which can be manipulated. Market makers easily create fake breakouts. But blockchain ledger records every real fund transfer — this data cannot be faked, making it the most honest record of smart money intentions."}
              </p>
            </section>

            <section>
              <h2 className="text-white font-black text-xl mb-6">
                {isZh ? "5 个最核心的链上指标" : "5 Most Critical On-Chain Metrics"}
              </h2>
              <div className="space-y-4">
                {METRICS.map((m) => (
                  <div key={m.name} className={`border p-5 ${colorStyle(m.color)}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{m.icon}</span>
                      <h3 className="font-black text-sm text-white">{isZh ? m.name : m.nameEn}</h3>
                    </div>
                    <p className="text-zinc-500 text-[13px]">{isZh ? m.desc : m.descEn}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-white font-black text-xl mb-4">
                {isZh ? "链上数据的局限性" : "Limitations of On-Chain Data"}
              </h2>
              <div className="space-y-3">
                {(isZh ? [
                  "大型机构越来越多地使用 OTC（场外交易）绕过链上记录，导致部分资金流动不透明",
                  "地址归属分析存在误差，同一个机构可能操作数千个钱包地址",
                  "链上数据具有滞后性，不适合用于高频短线交易",
                  "数据解读需要一定专业背景，同样的数据在不同市场环境下含义可能截然不同",
                ] : [
                  "Large institutions increasingly use OTC deals that bypass on-chain records",
                  "Address attribution is imperfect — one institution may control thousands of wallets",
                  "On-chain data has latency and is not suitable for high-frequency trading",
                  "Data interpretation requires expertise — the same data can mean opposite things in different market conditions",
                ]).map((item, i) => (
                  <div key={i} className="flex items-start gap-3 border border-white/[0.05] p-4">
                    <span className="text-amber-400 font-mono text-xs mt-0.5 shrink-0">⚠</span>
                    <p className="text-zinc-500 text-[13px]">{item}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-emerald-500/20 bg-emerald-500/5 p-6">
              <h2 className="text-white font-black text-lg mb-3">
                {isZh ? "AXIOM洞察 如何处理链上数据？" : "How AXIOM Insight Processes On-Chain Data?"}
              </h2>
              <p className="text-zinc-400 text-sm mb-4">
                {isZh
                  ? "AXIOM洞察 接入 Glassnode 专业链上数据源，并通过专门的链上分析 AI 智能体实时解读以上指标。链上数据会与技术分析、合约市场、情绪数据共同纳入多智能体共识分析框架，输出综合判断，规避单一数据源的局限性。"
                  : "AXIOM Insight integrates professional Glassnode on-chain data and uses a dedicated on-chain AI agent to interpret these metrics in real-time — combined with technicals, derivatives, and sentiment in a multi-agent consensus framework."}
              </p>
              <Link href={`/${locale}/login`} className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-2.5 font-black font-mono uppercase tracking-widest text-[11px] transition-all">
                {isZh ? "查看实时链上分析 →" : "View Live On-Chain Analysis →"}
              </Link>
            </section>
          </div>
        </article>
      </div>
    </>
  );
}
