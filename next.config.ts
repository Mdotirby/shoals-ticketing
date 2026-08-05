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
  //
  // @sparticuz/chromium's actual Chromium binary (bin/chromium.br, ~65MB)
  // is read via a dynamically-constructed fs path inside the package, not
  // a static require()/import -- Vercel's automatic file tracer can't see
  // that reference at all, so serverExternalPackages alone (which only
  // stops *bundling*, i.e. inlining JS) isn't sufficient; the binary
  // still silently gets left out of the deployed function's filesystem
  // unless explicitly force-included here. Confirmed by the runtime error
  // this fixes: "input directory .../@sparticuz/chromium/bin does not exist".
  outputFileTracingIncludes: {
    "/api/settlements/[id]/export-pdf": [
      "./lib/pdf-templates/settlement-report/**",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
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
