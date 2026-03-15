import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/resolve-domain?domain=www.venueexample.com
 *
 * Resolves a custom domain to a venue slug.
 * Used by middleware to detect custom-domain venues.
 * Returns { slug: "venue-slug" } or { slug: null }.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.toLowerCase().trim();

  if (!domain) {
    return NextResponse.json({ slug: null });
  }

  // Strip www. prefix for matching
  const bare = domain.startsWith("www.") ? domain.slice(4) : domain;

  const { data } = await admin
    .from("venues")
    .select("slug")
    .or(`custom_domain.eq.${bare},custom_domain.eq.www.${bare},custom_domain.eq.${domain}`)
    .limit(1)
    .single();

  return NextResponse.json(
    { slug: data?.slug || null },
    {
      headers: {
        // Cache for 5 minutes — domain mappings rarely change
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    }
  );
}
