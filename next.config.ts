import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // swcMinify: true,
  images: {
    domains: ["media.sketchfab.com"],
  },
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  // output: 'export',
  trailingSlash: true,
};

export default nextConfig;
