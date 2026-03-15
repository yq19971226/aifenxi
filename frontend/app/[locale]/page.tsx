import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { LandingPage } from "./landing-sections";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "metadata.site" });

  const keywords = locale.startsWith("zh")
    ? "加密货币分析,庄家行为分析,AI智能分析,比特币分析,链上数据分析,合约数据,市场情绪,多智能体共识,量化交易,AXIOM洞察,BTC,ETH,主力动向"
    : "crypto analysis,market maker analysis,AI trading,bitcoin analysis,on-chain analytics,derivatives data,market sentiment,multi-agent consensus,AXIOM Insight,BTC,ETH";

  return {
    title: t("title"),
    description: t("description"),
    keywords,
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      locale,
      type: "website",
      url: `${BASE_URL}/${locale}`,
      siteName: "AXIOM洞察",
      images: [
        {
          url: `${BASE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: locale.startsWith("zh") ? "AXIOM洞察 - 庄家行为 AI 多维分析平台" : "AXIOM Insight - Market Maker AI Analysis Platform",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("og_title"),
      description: t("og_description"),
      images: [`${BASE_URL}/og-image.png`],
    },
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN`,
        "zh-TW": `${BASE_URL}/zh-TW`,
        en: `${BASE_URL}/en`,
        "x-default": `${BASE_URL}/zh-CN`,
      },
    },
  };
}

function JsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${BASE_URL}/#website`,
        name: "AXIOM洞察",
        alternateName: ["AXIOM Insight", "AXIOM"],
        url: BASE_URL,
        description:
          "专业的加密货币 AI 多维分析平台，多智能体协同分析庄家行为，洞察主力动向",
        inLanguage: ["zh-CN", "zh-TW", "en"],
        potentialAction: {
          "@type": "SearchAction",
          target: `${BASE_URL}/zh-CN/dashboard?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${BASE_URL}/#organization`,
        name: "AXIOM洞察",
        url: BASE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${BASE_URL}/logo.svg`,
        },
        sameAs: [],
      },
      {
        "@type": "WebPage",
        "@id": `${BASE_URL}/#webpage`,
        url: BASE_URL,
        name: "AXIOM洞察 - 庄家行为 AI 多维分析平台",
        description:
          "多智能体协同分析庄家行为，穿透市场噪音，从技术面、链上数据、合约市场、市场情绪等维度提供综合判断参考",
        isPartOf: { "@id": `${BASE_URL}/#website` },
        about: { "@id": `${BASE_URL}/#organization` },
        inLanguage: "zh-CN",
      },
      {
        "@type": "SoftwareApplication",
        name: "AXIOM洞察",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        description:
          "基于多 AI 智能体的加密货币庄家行为分析平台，提供技术分析、链上数据分析、合约市场监控等功能",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "免费版可用，付费版解锁更多高级分析功能",
        },
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.8",
          ratingCount: "156",
          bestRating: "5",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "首页",
            item: BASE_URL,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "AXIOM洞察是什么？",
            acceptedAnswer: {
              "@type": "Answer",
              text: "AXIOM洞察是一个基于多 AI 智能体协同的加密货币分析平台。它从技术面、链上数据、合约市场、市场情绪等维度，分析庄家/主力行为，为交易者提供综合参考信号。",
            },
          },
          {
            "@type": "Question",
            name: "AXIOM洞察支持哪些加密货币？",
            acceptedAnswer: {
              "@type": "Answer",
              text: "目前支持 BTC、ETH 等主流加密货币的多维分析，覆盖技术指标、链上数据（Glassnode）、合约市场数据（Coinglass）、宏观情绪等多个维度。",
            },
          },
          {
            "@type": "Question",
            name: "AXIOM洞察如何分析庄家行为？",
            acceptedAnswer: {
              "@type": "Answer",
              text: "通过多个专业 AI 智能体同时从不同维度分析市场数据，包括大额转账监控、合约持仓变化、资金费率、期权市场信号等，以多回合辩论机制达成共识判断。",
            },
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export default function Home() {
  return (
    <>
      <JsonLd />
      <LandingPage />
    </>
  );
}
