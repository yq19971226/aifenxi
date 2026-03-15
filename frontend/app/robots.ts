import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.axiom123.cc";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/*/dashboard",
          "/*/dashboard/*",
          "/*/admin",
          "/*/admin/*",
          "/*/settings",
          "/*/settings/*",
          "/*/alerts",
          "/*/alerts/*",
          "/*/consensus",
          "/*/consensus/*",
          "/*/playbook-sim",
          "/*/playbook-sim/*",
          "/*/performance",
          "/*/performance/*",
          "/*/backtest",
          "/*/backtest/*",
          "/*/leaderboard",
          "/*/leaderboard/*",
          "/*/tasks",
          "/*/tasks/*",
          "/*/partner",
          "/*/partner/*",
          "/*/announcements",
          "/*/announcements/*",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
