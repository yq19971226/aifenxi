import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";
const LOCALES = ["zh-CN", "zh-TW", "en"];

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPages = [
    { path: "", changeFreq: "weekly" as const, priority: 1.0 },
    { path: "/login", changeFreq: "monthly" as const, priority: 0.6 },
    { path: "/guide", changeFreq: "monthly" as const, priority: 0.8 },
    { path: "/insights", changeFreq: "weekly" as const, priority: 0.9 },
    { path: "/insights/what-is-market-maker", changeFreq: "monthly" as const, priority: 0.8 },
    { path: "/insights/onchain-data-guide", changeFreq: "monthly" as const, priority: 0.8 },
    { path: "/insights/btc-manipulation-patterns", changeFreq: "monthly" as const, priority: 0.8 },
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const page of publicPages) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${BASE_URL}/${locale}${page.path}`,
        lastModified: new Date(),
        changeFrequency: page.changeFreq,
        priority: page.priority,
        alternates: {
          languages: Object.fromEntries(
            LOCALES.map((l) => [l, `${BASE_URL}/${l}${page.path}`])
          ),
        },
      });
    }
  }

  return entries;
}
