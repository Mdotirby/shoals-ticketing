import type { NextConfig } from "next";

const MERGED_ROUTES: [string, string][] = [
  ["/admin/events", "/admin/calendar?tab=list"],
  ["/admin/guest-lists", "/admin/live?tab=guests"],
  ["/admin/broadcasts", "/admin/marketing?tab=broadcasts"],
  ["/admin/auctions", "/admin/marketing?tab=auctions"],
  ["/admin/market-radar", "/admin/marketing?tab=radar"],
  ["/admin/sponsors", "/admin/marketing?tab=sponsors"],
  ["/admin/settings/branding", "/admin/settings?tab=branding"],
  ["/admin/faqs", "/admin/settings?tab=pages"],
  ["/admin/sops", "/admin/settings?tab=procedures"],
  ["/admin/onboarding", "/admin/users?tab=onboarding"],
  ["/admin/venues", "/admin/users?tab=tenants"],
  // Identity, capability and door are one subject. Access control was its own
  // route and /portal was still on the old structure; both are tabs of the
  // identity hub now.
  ["/admin/settings/permissions", "/admin/users?tab=access"],
  ["/portal", "/admin/users?tab=portals"],
];

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
    // export-xlsx reads template.xlsx + manifest.json from disk at runtime,
    // same reason as export-pdf above.
    "/api/settlements/[id]/export-xlsx": ["./lib/xlsx-templates/artist-settlement/**"],
    "/api/settlements/[id]/export-venue-xlsx": ["./lib/xlsx-templates/venue-settlement/**"],
    "/api/offers/[id]/export-xlsx": ["./lib/xlsx-templates/offer/**"],
  },
  // Routes the admin rebuild merged into tabbed pages (design handoff
  // PHASE1B). The old URL goes to its tab so bookmarks, emailed links and
  // the detail pages' own "back" links keep working. Exact paths only —
  // detail routes under them (/admin/broadcasts/new, …) are untouched.
  async redirects() {
    return MERGED_ROUTES.map(([source, destination]) => ({ source, destination, permanent: false }));
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
