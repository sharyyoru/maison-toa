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

  // Disable the client-side Router Cache (the in-memory cache Next.js keeps
  // for pages visited via <Link>/router navigation, separate from HTTP
  // caching). Without this, navigating between booking pages client-side
  // could briefly reuse a stale snapshot even though the server itself
  // never caches these routes.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },

  // Belt-and-suspenders cache busting for the public booking flow. These
  // pages show live appointment availability, so any stale copy (browser
  // back/forward cache, an intermediate proxy, etc.) can show a patient
  // slots that are no longer real. Next.js already treats these as
  // dynamic (they have dynamic route segments), but that relies on
  // defaults — make the "never cache" intent explicit and impossible to
  // regress accidentally.
  async headers() {
    return [
      {
        source: "/book-appointment/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/appointments/check-availability",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
