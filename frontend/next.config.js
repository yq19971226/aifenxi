const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [
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
};

// 仅在配置了 Sentry DSN 时启用 Sentry webpack 插件
const sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

module.exports = sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableServerWebpackPlugin: !sentryEnabled,
      disableClientWebpackPlugin: !sentryEnabled,
    })
  : nextConfig;
