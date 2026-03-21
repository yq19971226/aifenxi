import type { Metadata } from "next";
import Link from "next/link";
import { LeaderboardClient } from "./client";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";
const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "";

/* ── SEO Metadata ──────────────────────────────────────── */

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const isZh = locale.startsWith("zh");
  return {
    title: isZh
      ? "AI 策略排行榜 — AXIOM 洞察 | 实时 Profit Factor 排名"
      : "AI Strategy Leaderboard — AXIOM Insight | Live Profit Factor Rankings",
    description: isZh
      ? "查看 AXIOM 多智能体系统所有交易员的实时策略排名。按 Profit Factor 排序，包含胜率、平均收益等关键指标。公开透明的绩效追踪。"
      : "View real-time AI strategy rankings across all AXIOM traders. Sorted by Profit Factor with win rate, avg PnL, and Sharpe ratio. Transparent performance tracking.",
    keywords: isZh
      ? "AI策略排行榜,加密货币排名,Profit Factor,交易员排名,策略绩效,量化排行,做多做空,胜率排名"
      : "AI strategy leaderboard,crypto ranking,profit factor,trader ranking,strategy performance,quant ranking,long short,win rate",
    openGraph: {
      title: isZh
        ? "AI 策略排行榜 — AXIOM 洞察"
        : "AI Strategy Leaderboard — AXIOM Insight",
      description: isZh
        ? "公开透明的 AI 策略绩效排名，实时追踪"
        : "Transparent AI strategy performance rankings, tracked in real time",
      images: [{ url: `${BASE_URL}/og-image.png`, width: 1200, height: 630 }],
    },
    alternates: {
      canonical: `${BASE_URL}/${locale}/rankings`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN/rankings`,
        "zh-TW": `${BASE_URL}/zh-TW/rankings`,
        en: `${BASE_URL}/en/rankings`,
      },
    },
  };
}

/* ── Server-side data fetching ──────────────────────────── */

async function fetchPublicRankings() {
  try {
    const res = await fetch(`${API_BASE}/api/public/leaderboard/rankings?period=7d&mode=all&page=1&page_size=20`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPublicReport() {
  try {
    const res = await fetch(`${API_BASE}/api/public/leaderboard/report?period=7d&mode=all`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPublicAccuracy() {
  try {
    const res = await fetch(`${API_BASE}/api/public/leaderboard/system-accuracy?period=7d`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ── Page Component (Server) ───────────────────────────── */

export default async function PublicRankingsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const isZh = locale.startsWith("zh");

  const [rankingsData, reportData, accuracyData] = await Promise.all([
    fetchPublicRankings(),
    fetchPublicReport(),
    fetchPublicAccuracy(),
  ]);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: isZh ? "AI 策略排行榜" : "AI Strategy Leaderboard",
    description: isZh
      ? "AXIOM 多智能体系统交易员策略绩效排名"
      : "AXIOM multi-agent system trader strategy performance rankings",
    url: `${BASE_URL}/${locale}/rankings`,
    publisher: {
      "@type": "Organization",
      name: "AXIOM Insight",
      url: BASE_URL,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: rankingsData?.total ?? 0,
      itemListElement: (rankingsData?.rankings ?? []).slice(0, 10).map(
        (r: { anonymous_id: string; profit_factor: number; win_rate: number }, idx: number) => ({
          "@type": "ListItem",
          position: idx + 1,
          name: r.anonymous_id,
          description: `Profit Factor: ${r.profit_factor}, Win Rate: ${(r.win_rate * 100).toFixed(1)}%`,
        })
      ),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="min-h-screen bg-black text-white font-sans selection:bg-indigo-500/30">
        {/* Fixed Header */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-black/60 backdrop-blur-2xl">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link
              href={`/${locale}`}
              className="flex items-center gap-3 text-white font-black tracking-widest uppercase text-lg hover:opacity-80 transition-opacity"
            >
              AXIOM
            </Link>
            <nav className="flex items-center gap-6 text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-500">
              <Link href={`/${locale}/insights`} className="hover:text-white transition-colors">
                {isZh ? "洞察" : "Insights"}
              </Link>
              <Link href={`/${locale}/guide`} className="hover:text-white transition-colors">
                {isZh ? "指南" : "Guide"}
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
        <main className="pt-28 pb-24 max-w-6xl mx-auto px-4">
          <div className="mb-12 border-b border-white/[0.05] pb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 border-l-2 border-amber-500 bg-amber-500/10 text-[10px] font-mono text-amber-400 mb-6 uppercase tracking-[0.2em]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 bg-amber-500" />
              </span>
              {isZh ? "实时更新 · 公开透明" : "Live Updates · Transparent"}
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4 uppercase">
              {isZh ? "AI 策略排行榜" : "AI Strategy Leaderboard"}
            </h1>
            <p className="text-zinc-500 text-sm font-mono leading-relaxed max-w-2xl">
              {isZh
                ? "按 Profit Factor 排名的多智能体共识策略排行。所有策略由 AI 生成并自动结算追踪，数据公开透明。登录后可发布自己的策略参与排名。"
                : "Multi-agent consensus strategies ranked by Profit Factor. All strategies are AI-generated and auto-tracked. Log in to publish your own strategies and join the rankings."}
            </p>
          </div>

          <LeaderboardClient
            initialRankings={rankingsData}
            initialReport={reportData}
            initialAccuracy={accuracyData}
            locale={locale}
          />

          {/* CTA */}
          <section className="mt-20 border border-indigo-500/20 bg-indigo-500/5 p-8 text-center">
            <h2 className="text-2xl font-black text-white mb-3">
              {isZh ? "想参与排名？发布你的 AI 策略" : "Want to Rank? Publish Your AI Strategy"}
            </h2>
            <p className="text-zinc-500 text-sm font-mono mb-6">
              {isZh
                ? "注册免费账户，使用 AI 分析生成策略，系统会自动追踪结算并参与排名"
                : "Sign up for a free account, generate strategies with AI analysis, and they'll be auto-tracked & ranked"}
            </p>
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 font-black font-mono uppercase tracking-widest text-sm transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]"
            >
              {isZh ? "免费开始" : "Start for Free"} →
            </Link>
          </section>
        </main>

        <footer className="py-8 border-t border-white/[0.04] text-center">
          <p className="max-w-2xl mx-auto px-4 mb-4 text-[9px] leading-relaxed text-zinc-500/80 font-sans">
            {isZh
              ? "本平台提供的所有分析内容仅供参考研究，不构成任何投资建议。加密货币市场风险极高，请根据自身情况独立判断。"
              : "All analysis provided is for reference only and does not constitute investment advice. Cryptocurrency markets carry extremely high risk."}
          </p>
          <p className="text-[10px] text-zinc-700 font-mono tracking-widest uppercase">
            © {new Date().getFullYear()} AXIOM · {isZh ? "保留所有权利" : "All Rights Reserved"}
          </p>
        </footer>
      </div>
    </>
  );
}
