import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Domains that are NOT venue subdomains
const ROOT_DOMAINS = ["venuecore.live", "localhost", "vercel.app"];

function extractVenueSlug(host: string): string | null {
  const hostname = host.split(":")[0];
  for (const root of ROOT_DOMAINS) {
    if (hostname === root || hostname === `www.${root}`) return null;
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
  const venueSlug = extractVenueSlug(host);

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

  // ── Auth check only for protected routes ──
  const isLoginPage = pathname === "/login" || pathname === "/admin/login";
  const isProtectedRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/portal");

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
