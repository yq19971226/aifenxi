import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { GuideContent } from "./guide-content";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://axiom123.cc";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "guide.meta" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `${BASE_URL}/${locale}/guide`,
      languages: {
        "zh-CN": `${BASE_URL}/zh-CN/guide`,
        "zh-TW": `${BASE_URL}/zh-TW/guide`,
        en: `${BASE_URL}/en/guide`,
      },
    },
  };
}

export default function GuidePage() {
  return <GuideContent />;
}
