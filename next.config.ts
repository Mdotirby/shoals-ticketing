import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  // puppeteer-core/@sparticuz/chromium-min (and the dev-only `puppeteer`
  // full package render.ts imports locally) must NOT be bundled by Next's
  // build -- they're native/binary-adjacent packages. @sparticuz/chromium-min
  // ships no Chromium binary itself (it downloads one from a URL at
  // runtime -- see CHROMIUM_PACK_URL in render.ts -- specifically to avoid
  // the file-tracing problems the full @sparticuz/chromium package hit
  // here: its ~65MB local binary is read via a dynamically-built fs path,
  // which Vercel's tracer can't see and silently drops from the deployed
  // function no matter how the package itself is externalized/bundled).
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min", "puppeteer"],
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
