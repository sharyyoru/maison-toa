import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["heic-convert", "libheif-js"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "rfwhtalljicdfwafcrto.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "chjswljpjxjcsbiresnb.supabase.co",
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

export default nextConfig;
