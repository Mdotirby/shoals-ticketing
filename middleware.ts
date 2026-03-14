import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { OPERATOR_DOMAIN_MAP } from "@/lib/operators";

/**
 * Extract both operatorSlug and venueSlug from the incoming hostname.
 *
 * Examples:
 *   venuecore.live           → { operatorSlug: "venuecore", venueSlug: null }
 *   west72ent.com            → { operatorSlug: "west72",    venueSlug: null }
 *   shoals.venuecore.live    → { operatorSlug: "venuecore", venueSlug: "shoals" }
 *   shoals.west72ent.com     → { operatorSlug: "west72",    venueSlug: "shoals" }
 *   localhost / vercel.app   → { operatorSlug: "venuecore", venueSlug: null }
 */
function extractSlugs(host: string): { operatorSlug: string; venueSlug: string | null } {
  const hostname = host.split(":")[0];

  // Walk each known operator root domain
  for (const [rootDomain, operatorSlug] of Object.entries(OPERATOR_DOMAIN_MAP)) {
    if (hostname === rootDomain || hostname === `www.${rootDomain}`) {
      return { operatorSlug, venueSlug: null };
    }
    if (hostname.endsWith(`.${rootDomain}`)) {
      const sub = hostname.replace(`.${rootDomain}`, "");
      if (sub && sub !== "www") {
        return { operatorSlug, venueSlug: sub };
      }
    }
  }

  // localhost / vercel preview — default to venuecore operator, no venue subdomain
  return { operatorSlug: "venuecore", venueSlug: null };
}

// Keep the old helper around so any existing code that imports it still compiles
function extractVenueSlug(host: string): string | null {
  return extractSlugs(host).venueSlug;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";
  const { operatorSlug, venueSlug } = extractSlugs(host);

  // Skip middleware for static files and API routes
  const isApiRoute = pathname.startsWith("/api/");
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Create response with venue slug cookie
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // ── Always refresh the Supabase session (keeps user logged in) ──
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // This call refreshes the session cookie on every page load
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Set venueSlug cookie — subdomain or "default"
  response.cookies.set("venueSlug", venueSlug || "default", {
    path: "/",
    sameSite: "lax",
  });

  // Set operatorSlug cookie — which brand/operator owns this domain
  response.cookies.set("operatorSlug", operatorSlug, {
    path: "/",
    sameSite: "lax",
  });

  // ── Auth check only for protected routes ──
  const isLoginPage = pathname === "/login" || pathname === "/admin/login";
  const isProtectedRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/portal") || pathname.startsWith("/agent");

  if (isProtectedRoute && !isLoginPage && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|.*\\..*).*)"],
};
