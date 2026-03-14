import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { OPERATOR_DOMAIN_MAP, getOperator } from "@/lib/operators";

/**
 * Dynamic favicon route
 * -------------------------
 * Browsers always request /favicon.ico directly. We rewrite that to this
 * API route in next.config.ts so we can serve operator-specific favicons.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];

  // Detect operator from host
  let operatorSlug = "venuecore";
  for (const [rootDomain, slug] of Object.entries(OPERATOR_DOMAIN_MAP)) {
    if (hostname === rootDomain || hostname === `www.${rootDomain}` || hostname.endsWith(`.${rootDomain}`)) {
      operatorSlug = slug;
      break;
    }
  }

  // Fallback to cookie
  if (operatorSlug === "venuecore") {
    const cookieSlug = request.cookies.get("operatorSlug")?.value;
    if (cookieSlug) operatorSlug = cookieSlug;
  }

  const operator = getOperator(operatorSlug);
  const faviconPath = operator.favicon;

  try {
    const fullPath = join(process.cwd(), "public", faviconPath);
    const buffer = await readFile(fullPath);

    const ext = faviconPath.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "ico" ? "image/x-icon" :
      ext === "svg" ? "image/svg+xml" :
      ext === "png" ? "image/png" :
      "image/x-icon";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // Fallback: serve the default VenueCore favicon
    try {
      const fallbackPath = join(process.cwd(), "public", "favicons", "venuecore.ico");
      const buffer = await readFile(fallbackPath);
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "image/x-icon",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }
}
