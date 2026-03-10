import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { LandingPage } from "./landing-sections";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://axiom123.cc";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "metadata.site" });

  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      locale,
      type: "website",
      url: `${BASE_URL}/${locale}`,
    },
    twitter: {
      card: "summary_large_image",
      title: t("og_title"),
      description: t("og_description"),
    },
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN`,
        "zh-TW": `${BASE_URL}/zh-TW`,
        en: `${BASE_URL}/en`,
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
        name: "AXIOM洞察",
        alternateName: "AXIOM Insight",
        url: BASE_URL,
        description:
          "庄家行为 AI 多维分析平台 — Market Maker AI Analysis Platform",
        inLanguage: ["zh-CN", "zh-TW", "en"],
      },
      {
        "@type": "Organization",
        name: "AXIOM洞察",
        url: BASE_URL,
        logo: `${BASE_URL}/logo.svg`,
      },
      {
        "@type": "SoftwareApplication",
        name: "AXIOM Insight",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free tier available",
        },
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
