import type { Metadata } from "next";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const isZh = locale.startsWith("zh");
  return {
    title: isZh
      ? "BTC 常见主力操盘套路解析：拉盘、砸盘、洗盘全图解 - AXIOM洞察"
      : "BTC Market Manipulation Patterns: Pump, Dump & Wash Trading Explained - AXIOM Insight",
    description: isZh
      ? "加密市场常见主力操盘手法：吸筹、拉升、派发、洗盘四个核心阶段详解。识别这些套路，避免成为被割的韭菜，学会跟庄而不是对抗庄家。"
      : "Common crypto manipulation: accumulation, markup, distribution, and markdown phases explained. Learn to identify these patterns and avoid being the exit liquidity.",
    keywords: isZh
      ? "BTC操盘套路,拉盘砸盘,洗盘信号,主力出货,加密货币操控,跟庄技巧"
      : "BTC manipulation,pump dump,wash trading,market maker exit,crypto manipulation,stop hunt",
    openGraph: {
      title: isZh ? "BTC 常见主力操盘套路解析" : "BTC Market Manipulation Patterns Explained",
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630 }],
    },
    alternates: {
      canonical: `${BASE_URL}/${locale}/insights/btc-manipulation-patterns`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN/insights/btc-manipulation-patterns`,
        "zh-TW": `${BASE_URL}/zh-TW/insights/btc-manipulation-patterns`,
        en: `${BASE_URL}/en/insights/btc-manipulation-patterns`,
      },
    },
  };
}

const PATTERNS = [
  {
    name: "插针（止损猎杀）",
    nameEn: "Wick / Stop Hunt",
    icon: "📍",
    color: "red",
    signalZh: [
      "价格瞬间跌破重要支撑位后迅速反弹",
      "下影线极长，但收盘价在支撑位上方",
      "成交量在瞬间暴增后迅速缩减",
    ],
    signalEn: ["Price briefly breaks key support then rapidly recovers", "Long lower wick with close above support", "Volume spike followed by rapid reduction"],
    howZh: "庄家先将价格砸破大量散户设置的止损位，触发连锁止损，快速吸收廉价筹码，随后翻多拉升。",
    howEn: "Market makers drive price below retail stop-loss clusters, trigger chain liquidations, absorb cheap supply, then reverse upward.",
  },
  {
    name: "假突破吸引追涨",
    nameEn: "Fake Breakout / Bull Trap",
    icon: "🪤",
    color: "amber",
    signalZh: [
      "价格突破关键阻力位后成交量未放大",
      "突破后1-3根K线即快速回落",
      "链上数据显示交易所流入增加（出货）",
    ],
    signalEn: ["Price breaks resistance without volume confirmation", "Quick rejection within 1-3 candles", "Exchange inflows increase (distribution signal)"],
    howZh: "庄家在高位制造假突破，吸引追涨的散户买入，然后快速反向打压，将新进散户套在高位。",
    howEn: "Market makers create a fake breakout at highs, attract FOMO buyers, then rapidly reverse to trap latecomers.",
  },
  {
    name: "横盘震荡洗盘",
    nameEn: "Consolidation / Shake-Out",
    icon: "↔️",
    color: "zinc",
    signalZh: [
      "价格在一个区间内反复震荡数天甚至数周",
      "成交量逐渐缩减，但价格守住支撑",
      "链上数据显示长期持有者继续增持",
    ],
    signalEn: ["Price oscillates in a range for days or weeks", "Volume gradually decreasing while support holds", "LTH on-chain data shows continued accumulation"],
    howZh: "庄家通过长时间横盘消磨散户耐心，让不坚定的持有者主动卖出，庄家低价接盘。洗盘结束后往往是大幅拉升的前奏。",
    howEn: "Extended sideways action exhausts retail patience, causing weak holders to sell. Market makers accumulate this supply at low prices before a major markup.",
  },
  {
    name: "放量砸盘清洗",
    nameEn: "Volume Dump / Distribution",
    icon: "💧",
    color: "blue",
    signalZh: [
      "价格在高位出现放量下跌",
      "多次反弹均以失败告终，高点逐渐降低",
      "合约未平仓量下降，多头持续被清算",
    ],
    signalEn: ["High-volume drops at elevated prices", "Failed rallies with lower highs", "OI declining with long liquidations"],
    howZh: "庄家已完成出货，开始主动做空获利。价格每次反弹都是庄家出货的机会，最终形成下降趋势。",
    howEn: "Market makers have completed distribution and begin shorting for profit. Each rally is used to sell more, ultimately establishing a downtrend.",
  },
];

function colorBorder(color: string) {
  const map: Record<string, string> = {
    red: "border-red-500/30 bg-red-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    zinc: "border-zinc-500/30 bg-zinc-500/5",
    blue: "border-blue-500/30 bg-blue-500/5",
  };
  return map[color] ?? map.zinc;
}

function tagColor(color: string) {
  const map: Record<string, string> = {
    red: "text-red-400",
    amber: "text-amber-400",
    zinc: "text-zinc-400",
    blue: "text-blue-400",
  };
  return map[color] ?? map.zinc;
}

export default function ManipulationPatternsPage({ params: { locale } }: { params: { locale: string } }) {
  const isZh = locale.startsWith("zh");

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: isZh
      ? "BTC 常见主力操盘套路解析：拉盘、第盘、洗盘全图解"
      : "BTC Market Manipulation Patterns: Pump, Dump & Wash Trading Explained",
    author: { "@type": "Organization", name: "AXIOM洞察", url: BASE_URL },
    publisher: { "@type": "Organization", name: "AXIOM洞察", url: BASE_URL,
      logo: { "@type": "ImageObject", url: `${BASE_URL}/favicon.svg` }
    },
    url: `${BASE_URL}/${locale}/insights/btc-manipulation-patterns`,
    image: `${BASE_URL}/og-image.png`,
    inLanguage: locale,
    datePublished: "2026-03-10",
    dateModified: "2026-03-20",
    keywords: isZh
      ? "BTC操盘套路,拉盘第盘,洗盘信号,主力出货,加密货币操控,跟庄技巧"
      : "BTC manipulation,pump dump,wash trading,stop hunt,market maker patterns,crypto manipulation signals",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE_URL}/${locale}/insights/btc-manipulation-patterns` },
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
            <span className="text-[9px] font-black font-mono tracking-widest uppercase px-2 py-0.5 border text-amber-400 bg-amber-500/10 border-amber-500/20">
              {isZh ? "实战策略" : "Strategy"}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white mb-6 leading-tight">
            {isZh
              ? "BTC 常见主力操盘套路解析：拉盘、砸盘、洗盘全图解"
              : "BTC Market Manipulation Patterns: Pump, Dump & Wash Trading Explained"}
          </h1>
          <p className="text-zinc-500 text-sm font-mono mb-12 pb-8 border-b border-white/[0.06]">
            {isZh ? "AXIOM洞察 研究团队 · 2026年3月" : "AXIOM Insight Research · March 2026"}
          </p>

          <div className="space-y-10 text-zinc-400 text-[15px] leading-relaxed font-mono">
            <section>
              <h2 className="text-white font-black text-xl mb-4">
                {isZh ? "为什么要了解操盘套路？" : "Why Learn Manipulation Patterns?"}
              </h2>
              <p>
                {isZh
                  ? "加密市场监管相对宽松，价格操控行为普遍存在。与其对抗庄家，不如学习识别他们的套路，在他们完成建仓后跟进，在他们开始出货时离场。这不是找到完美的圣杯策略，而是让你在概率上站到更有利的一边。"
                  : "Crypto markets have loose regulation, making manipulation widespread. Rather than fighting market makers, learn to identify their patterns — enter after they accumulate, exit before they distribute. This improves your probability edge significantly."}
              </p>
            </section>

            <section>
              <h2 className="text-white font-black text-xl mb-6">
                {isZh ? "4 个最常见的操盘套路" : "4 Most Common Manipulation Patterns"}
              </h2>
              <div className="space-y-6">
                {PATTERNS.map((p) => (
                  <div key={p.name} className={`border p-6 ${colorBorder(p.color)}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{p.icon}</span>
                      <h3 className={`font-black text-base ${tagColor(p.color)}`}>
                        {isZh ? p.name : p.nameEn}
                      </h3>
                    </div>
                    <div className="mb-4">
                      <p className="text-[10px] font-black font-mono text-zinc-400 uppercase tracking-widest mb-2">
                        {isZh ? "识别信号" : "Recognition Signals"}
                      </p>
                      <ul className="space-y-1.5">
                        {(isZh ? p.signalZh : p.signalEn).map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-500">
                            <span className={`mt-0.5 ${tagColor(p.color)}`}>▸</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="border-t border-white/[0.05] pt-4">
                      <p className="text-[10px] font-black font-mono text-zinc-400 uppercase tracking-widest mb-2">
                        {isZh ? "庄家如何操作" : "How Market Makers Execute"}
                      </p>
                      <p className="text-zinc-500 text-[13px]">{isZh ? p.howZh : p.howEn}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-white font-black text-xl mb-4">
                {isZh ? "实战原则：如何应对这些套路" : "Practical Principles: How to Respond"}
              </h2>
              <div className="space-y-3">
                {(isZh ? [
                  { title: "不追高，等回踩", desc: "价格放量突破新高时，最危险的操作是追涨。等价格回踩测试支撑位成功后再买入，安全边际更高。" },
                  { title: "结合链上数据验证", desc: "技术面看到突破信号时，同步检查交易所净流量。如果突破时交易所涌入大量资金（净流入），可能是出货而非真实突破。" },
                  { title: "设置合理止损，但不要放在明显位置", desc: "庄家会专门猎杀集中在圆整数位（如 $60,000）的止损。将止损设置在稍微不那么明显的位置，避免被精准猎杀。" },
                  { title: "轻仓迎接不确定性，重仓等待确认信号", desc: "在假突破高发的区域轻仓测试，在多维信号共振确认后才加仓。时间在耐心者一边。" },
                ] : [
                  { title: "Don't Chase Highs — Wait for Retests", desc: "Buying high-volume breakouts is the most dangerous trade. Wait for a successful retest of the breakout level before entering." },
                  { title: "Verify With On-Chain Data", desc: "When you see a technical breakout, check exchange net flows. High inflows during a breakout may signal distribution, not real demand." },
                  { title: "Set Stops Thoughtfully", desc: "Market makers target obvious stop clusters at round numbers. Place your stops slightly off obvious levels to avoid being hunted." },
                  { title: "Small Size in Uncertainty, Full Size on Confirmation", desc: "Use small positions in ambiguous zones, scale up only when multiple signals align. Patience is an edge." },
                ]).map((item, i) => (
                  <div key={i} className="border border-white/[0.06] p-5 hover:bg-white/[0.02] transition-colors">
                    <h3 className="text-white font-black text-sm mb-2">{item.title}</h3>
                    <p className="text-zinc-500 text-[13px]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-amber-500/20 bg-amber-500/5 p-6">
              <h2 className="text-white font-black text-lg mb-3">
                {isZh ? "用 AI 实时识别这些套路" : "Use AI to Identify These Patterns in Real Time"}
              </h2>
              <p className="text-zinc-400 text-sm mb-4">
                {isZh
                  ? "AXIOM洞察 的多智能体分析框架会持续监控技术形态、链上异动、合约多空情绪等信号，当多个指标同时出现操盘特征时，AI 会主动输出风险提示，帮助你提前意识到当前市场可能处于洗盘或出货阶段。"
                  : "AXIOM Insight's multi-agent framework continuously monitors technical patterns, on-chain anomalies, and derivatives sentiment. When multiple signals align suggesting manipulation, the AI proactively alerts you."}
              </p>
              <Link href={`/${locale}/login`} className="inline-flex items-center gap-2 bg-amber-700 hover:bg-amber-600 text-white px-6 py-2.5 font-black font-mono uppercase tracking-widest text-[11px] transition-all">
                {isZh ? "开始智能分析 →" : "Start Smart Analysis →"}
              </Link>
            </section>
          </div>
        </article>
      </div>
    </>
  );
}
