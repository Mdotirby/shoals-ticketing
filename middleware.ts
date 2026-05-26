import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { OPERATOR_DOMAIN_MAP, OPERATORS } from "@/lib/operators";

/**
 * Extract operatorSlug and venueSlug from the incoming hostname.
 *
 * Priority:
 *   1. Known operator root domains (venuecore.live, west72ent.com)
 *   2. Subdomains of known operators (shoals.venuecore.live)
 *   3. localhost / vercel.app (defaults)
 *   4. Unknown domain → returns { unknown: true } for custom domain lookup
 */
function extractSlugs(host: string): {
  operatorSlug: string;
  venueSlug: string | null;
  isCustomDomain: boolean;
  customHostname: string | null;
} {
  const hostname = host.split(":")[0];

  // Walk each known operator root domain
  for (const [rootDomain, operatorSlug] of Object.entries(OPERATOR_DOMAIN_MAP)) {
    if (hostname === rootDomain || hostname === `www.${rootDomain}`) {
      return { operatorSlug, venueSlug: null, isCustomDomain: false, customHostname: null };
    }
    if (hostname.endsWith(`.${rootDomain}`)) {
      const sub = hostname.replace(`.${rootDomain}`, "");
      if (sub && sub !== "www" && OPERATORS[operatorSlug]?.supportsSubdomains) {
        return { operatorSlug, venueSlug: sub, isCustomDomain: false, customHostname: null };
      }
    }
  }

  // localhost / vercel preview
  if (hostname === "localhost" || hostname.endsWith(".vercel.app")) {
    return { operatorSlug: "venuecore", venueSlug: null, isCustomDomain: false, customHostname: null };
  }

  // Unknown domain — could be a venue's custom domain
  return { operatorSlug: "venuecore", venueSlug: null, isCustomDomain: true, customHostname: hostname };
}

// Keep the old helper around so any existing code that imports it still compiles
function extractVenueSlug(host: string): string | null {
  return extractSlugs(host).venueSlug;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";
  let { operatorSlug, venueSlug, isCustomDomain, customHostname } = extractSlugs(host);

  // Skip middleware for static files, API routes, and trackable link redirects
  const isApiRoute = pathname.startsWith("/api/");
  const isTrackableLink = pathname.startsWith("/t/");
  if (isApiRoute || isTrackableLink) {
    return NextResponse.next();
  }

  // ── Custom domain resolution ──
  // If we hit an unrecognized domain, look it up in the venues table
  if (isCustomDomain && customHostname) {
    try {
      const resolveUrl = new URL("/api/resolve-domain", request.url);
      resolveUrl.searchParams.set("domain", customHostname);
      const res = await fetch(resolveUrl.toString());
      if (res.ok) {
        const data = await res.json();
        if (data.slug) {
          venueSlug = data.slug;
          // Custom domain venues act as their own "operator" for branding purposes
          isCustomDomain = false;
        }
      }
    } catch {
      // If resolution fails, continue with defaults
    }
  }

  // Inject operator/venue slugs into the forwarded request headers so that
  // server components (including generateMetadata) can read them on the very
  // first request — before the browser has stored the cookie from a prior visit.
  const forwardedHeaders = new Headers(request.headers);
  const existingCookies = request.headers.get("cookie") || "";
  const slugCookies = `operatorSlug=${operatorSlug}; venueSlug=${venueSlug || "default"}`;
  forwardedHeaders.set("cookie", existingCookies ? `${existingCookies}; ${slugCookies}` : slugCookies);

  // Create response with venue slug cookie
  let response = NextResponse.next({
    request: { headers: forwardedHeaders },
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
            request: { headers: forwardedHeaders },
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

  // Set venueSlug cookie — subdomain, custom domain slug, or "default"
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
