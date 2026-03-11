const { withSentryConfig } = require("@sentry/nextjs");
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.svg",
      },
      {
        source: "/api/:path*",
        destination: `${process.env.API_PROXY_URL || "http://localhost:8000"}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${process.env.API_PROXY_URL || "http://localhost:8000"}/health`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  compress: true,
};

// 仅在配置了 Sentry DSN 时启用 Sentry webpack 插件
const sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

const configWithIntl = withNextIntl(nextConfig);

module.exports = sentryEnabled
  ? withSentryConfig(configWithIntl, {
      silent: true,
      disableServerWebpackPlugin: !sentryEnabled,
      disableClientWebpackPlugin: !sentryEnabled,
    })
  : configWithIntl;
