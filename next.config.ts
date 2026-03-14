import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  async rewrites() {
    return [
      {
        source: "/favicon.ico",
        destination: "/api/favicon",
      },
    ];
  },
};

export default nextConfig;
