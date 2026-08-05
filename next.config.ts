import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  // puppeteer-core/@sparticuz/chromium (and the dev-only `puppeteer` full
  // package render.ts imports locally) must NOT be bundled by Next's
  // build -- they're native/binary packages, and puppeteer alone bundles
  // a ~300MB Chromium. Left un-excluded, Next's static analysis of the
  // dynamic import() in render.ts can still trace and pull the whole
  // thing into the production function regardless of the runtime
  // (`process.env.VERCEL`) guard around it, blowing well past Vercel's
  // function size limit and failing the build silently (Vercel just
  // keeps serving the last successful deploy instead of erroring loudly).
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "puppeteer"],
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
