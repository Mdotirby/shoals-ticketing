import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { OPERATOR_DOMAIN_MAP, getOperator } from "@/lib/operators";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Dynamic favicon route
 * -------------------------
 * Priority: venue favicon_url → operator favicon → VenueCore default
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];

  // Detect operator + venue from host
  let operatorSlug = "venuecore";
  let venueSlug: string | null = null;

  for (const [rootDomain, slug] of Object.entries(OPERATOR_DOMAIN_MAP)) {
    if (hostname === rootDomain || hostname === `www.${rootDomain}`) {
      operatorSlug = slug;
      break;
    }
    if (hostname.endsWith(`.${rootDomain}`)) {
      operatorSlug = slug;
      const sub = hostname.replace(`.${rootDomain}`, "");
      if (sub && sub !== "www") venueSlug = sub;
      break;
    }
  }

  // Fallback to cookies
  if (!venueSlug) {
    const cookieVenue = request.cookies.get("venueSlug")?.value;
    if (cookieVenue && cookieVenue !== "default") venueSlug = cookieVenue;
  }
  if (operatorSlug === "venuecore") {
    const cookieOp = request.cookies.get("operatorSlug")?.value;
    if (cookieOp) operatorSlug = cookieOp;
  }

  // 1. Try venue-specific favicon from database
  if (venueSlug) {
    try {
      const { data: venue } = await admin
        .from("venues")
        .select("favicon_url")
        .eq("slug", venueSlug)
        .single();

      if (venue?.favicon_url) {
        // If it's an external URL (Supabase storage), redirect to it
        if (venue.favicon_url.startsWith("http")) {
          return NextResponse.redirect(venue.favicon_url, {
            status: 302,
            headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
          });
        }
        // If it's a local path, serve the file
        const fullPath = join(process.cwd(), "public", venue.favicon_url);
        const buffer = await readFile(fullPath);
        const ext = venue.favicon_url.split(".").pop()?.toLowerCase();
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : "image/x-icon",
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      }
    } catch { /* fall through to operator favicon */ }
  }

  // 2. Operator favicon
  const operator = getOperator(operatorSlug);
  try {
    const fullPath = join(process.cwd(), "public", operator.favicon);
    const buffer = await readFile(fullPath);
    const ext = operator.favicon.split(".").pop()?.toLowerCase();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": ext === "png" ? "image/png" : ext === "ico" ? "image/x-icon" : "image/x-icon",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // 3. Final fallback
    try {
      const fallbackPath = join(process.cwd(), "public", "favicons", "venuecore.ico");
      const buffer = await readFile(fallbackPath);
      return new NextResponse(buffer, {
        status: 200,
        headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=3600" },
      });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }
}
