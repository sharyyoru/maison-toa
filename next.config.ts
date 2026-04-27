import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl plugin. Picks up our request config at src/i18n/request.ts (the
// default location). Uses cookie-based locale with no URL prefix.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  eslint: {
    // Warnings don't fail build - can be fixed incrementally
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["heic-convert", "libheif-js"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "mwtdhbllkzuryswrumrd.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Disable x-powered-by header for security
  poweredByHeader: false,

  // Enable compression
  compress: true,

  // Optimize production builds
  productionBrowserSourceMaps: false,
};

export default withNextIntl(nextConfig);
