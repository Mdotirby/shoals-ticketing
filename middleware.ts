import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Domains that are NOT venue subdomains
const ROOT_DOMAINS = ["venuecore.live", "localhost", "vercel.app"];

function extractVenueSlug(host: string): string | null {
  // Remove port for localhost
  const hostname = host.split(":")[0];

  // Check if it's a subdomain of a known root domain
  for (const root of ROOT_DOMAINS) {
    if (hostname === root || hostname === `www.${root}`) {
      return null; // main domain, no venue slug
    }
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.replace(`.${root}`, "");
      if (sub && sub !== "www") return sub;
    }
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // ── Subdomain detection ──
  const venueSlug = extractVenueSlug(host);

  // Public routes that don't need auth
  const isLoginPage = pathname === "/login" || pathname === "/admin/login";
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicRoute =
    !pathname.startsWith("/admin") && !pathname.startsWith("/portal");

  // Skip auth check for public routes, login pages, and API routes
  if (isPublicRoute || isLoginPage || isApiRoute) {
    const response = NextResponse.next();
    // Set venue slug cookie for public pages
    if (venueSlug) {
      response.cookies.set("venue-slug", venueSlug, { path: "/", sameSite: "lax" });
    } else {
      response.cookies.delete("venue-slug");
    }
    return response;
  }

  // ── Auth check for protected routes ──
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

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

  // Verify the user's session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If no authenticated user, redirect to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Set venue slug cookie for admin pages too
  if (venueSlug) {
    response.cookies.set("venue-slug", venueSlug, { path: "/", sameSite: "lax" });
  } else {
    response.cookies.delete("venue-slug");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|.*\\..*).*)"],
};
