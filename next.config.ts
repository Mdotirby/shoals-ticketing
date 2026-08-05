import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  // Puppeteer's export-pdf route reads the settlement-report template's
  // HTML/fonts/images from disk at runtime -- without this, Vercel's file
  // tracing won't know to bundle non-code assets into the function.
  outputFileTracingIncludes: {
    "/api/settlements/[id]/export-pdf": ["./lib/pdf-templates/settlement-report/**"],
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
