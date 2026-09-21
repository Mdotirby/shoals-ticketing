"use client";

import { Suspense, useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";
import { getOperator } from "@/lib/operators";
import ForcePasswordModal from "@/app/components/admin/ForcePasswordModal";
import AdminSidebar from "@/app/components/admin/AdminSidebar";
import { visibleNav, isLinkVisible, partnerLink } from "@/lib/admin/nav";

/* Nav definition lives in lib/admin/nav.ts; the sidebar itself in
   app/components/admin/AdminSidebar.tsx. */

type SidebarProps = Omit<React.ComponentProps<typeof AdminSidebar>, "tabParam">;

/* The sidebar reads `?tab=` to light the in-page tab that's showing.
   useSearchParams has to sit under a Suspense boundary or statically
   rendered admin pages fail the build, so this wrapper is what goes inside
   one; the fallback is the same sidebar with no tab lit. */
function SidebarWithTab(props: SidebarProps) {
  const tab = useSearchParams().get("tab");
  return <AdminSidebar {...props} tabParam={tab} />;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [userId, setUserId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [sidebarPerms, setSidebarPerms] = useState<Record<string, boolean> | null>(null);
  // Lazy initializer runs once on mount — cookie is always present (set by middleware, not httpOnly)
  const [operatorSlug] = useState(() => getCookie("operatorSlug") || "venuecore");

  useEffect(() => {
    // Immediately read cookies for instant display (no flash of empty sidebar)
    const cookieName = getCookie("user-name");
    const cookieRole = getCookie("user-role");
    const cookieVenueName = getCookie("venue-name");
    if (cookieName) setAdminName(cookieName.charAt(0).toUpperCase() + cookieName.slice(1));
    if (cookieRole) setUserRole(cookieRole);
    if (cookieVenueName) setVenueName(decodeURIComponent(cookieVenueName));

    async function loadUser() {
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;

      const uid = authData.user.id;
      setUserId(uid);

      // Fetch admin_users record for role + must_change_password
      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("role, venue_id, first_name, last_name, must_change_password, avatar_url")
        .eq("id", uid)
        .single();

      if (adminRecord) {
        setUserRole(adminRecord.role || cookieRole || "");
        setMustChangePassword(adminRecord.must_change_password === true);
        if (adminRecord.avatar_url) setAvatarUrl(adminRecord.avatar_url);

        const name = adminRecord.first_name
          ? adminRecord.first_name
          : (cookieName || (authData.user.email?.split("@")[0].split(".")[0] ?? "Admin"));
        setAdminName(name.charAt(0).toUpperCase() + name.slice(1));

        // Load venue name + slug for logo
        if (adminRecord.venue_id) {
          // venue_id resolved from admin record
          const { data: venue } = await supabase
            .from("venues")
            .select("name, slug, logo_url")
            .eq("id", adminRecord.venue_id)
            .single();
          if (venue) {
            setVenueName(venue.name || "");
            // Persist venue info in cookies for PDF exports and sidebar
            document.cookie = `venue-name=${encodeURIComponent(venue.name || "")}; path=/; samesite=lax`;
            document.cookie = `venue-slug=${encodeURIComponent(venue.slug || "")}; path=/; samesite=lax`;
            if (venue.logo_url) document.cookie = `venue-logo=${encodeURIComponent(venue.logo_url)}; path=/; samesite=lax`;
          }
        } else if (adminRecord.role === "owner") {
          setVenueName(cookieVenueName ? decodeURIComponent(cookieVenueName) : "All Venues");
        }
      } else {
        // Supabase RLS may block direct admin_users read — fall back to cookies
        if (cookieName && !adminName) {
          setAdminName(cookieName.charAt(0).toUpperCase() + cookieName.slice(1));
        }
        // Try the server-side auth API as last resort
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          if (token) {
            const res = await fetch("/api/admin/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ access_token: token }),
            });
            if (res.ok) {
              const authBody = await res.json();
              if (authBody.role) setUserRole(authBody.role);
              if (authBody.must_change_password) setMustChangePassword(true);
              if (authBody.avatar_url) setAvatarUrl(authBody.avatar_url);
              setUserId(uid);
              const fname = authBody.first_name || cookieName || (authData.user.email?.split("@")[0].split(".")[0]) || "Admin";
              setAdminName(fname.charAt(0).toUpperCase() + fname.slice(1));
              // Fetch venue info if we have venue_id
              if (authBody.venue_id) {
                // venue_id from auth response
                try {
                  const venuesRes = await fetch("/api/venues");
                  if (venuesRes.ok) {
                    const venues = await venuesRes.json();
                    const v = Array.isArray(venues) ? venues.find((x: Record<string, string>) => x.id === authBody.venue_id) : null;
                    if (v) {
                      setVenueName(v.name || "");
                      document.cookie = `venue-name=${encodeURIComponent(v.name || "")}; path=/; samesite=lax`;
                      document.cookie = `venue-slug=${encodeURIComponent(v.slug || "")}; path=/; samesite=lax`;
                      if (v.logo_url) document.cookie = `venue-logo=${encodeURIComponent(v.logo_url)}; path=/; samesite=lax`;
                    }
                  }
                } catch {}
              } else if (authBody.role === "owner") {
                setVenueName("All Venues");
              }
            }
          }
        } catch {}
      }
    }

    loadUser();
  }, []);

  // Fetch sidebar_permissions for the venue once we know the role
  useEffect(() => {
    if (!userRole) return;

    const venueId = getCookie("venue-id") || "";

    // Build URL — venue_id is optional for artists
    const params = new URLSearchParams({ role: userRole });
    if (venueId) params.set("venue_id", venueId);

    // Use server-side API route to bypass RLS restrictions
    fetch(`/api/admin/sidebar-permissions?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          console.warn("[AdminLayout] sidebar_permissions API error:", r.status);
          return;
        }
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          const map: Record<string, boolean> = {};
          for (const row of data) {
            if (row.tab_key) map[row.tab_key] = row.visible;
          }
          setSidebarPerms(map);
        }
      })
      .catch((err) => {
        console.warn("[AdminLayout] sidebar_permissions fetch error:", err);
      });
  }, [userRole]);

  // The drawer closes whenever the route changes (Back included — links
  // close it themselves on click). Adjusted during render rather than in an
  // effect. Sits before the /admin/login early return below: this component
  // stays mounted across the client-side navigation from /admin/login into
  // the dashboard, and a hook called on only one side of that branch throws
  // "Rendered more hooks than during the previous render" — a blank screen
  // right after logging in.
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setSidebarOpen(false);
  }

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const navForUser = visibleNav(userRole, sidebarPerms);
  const partner =
    userRole === "partner" && isLinkVisible(partnerLink, userRole, sidebarPerms) ? partnerLink : null;

  const operator = getOperator(operatorSlug);
  const isWest72Operator = operator.slug === "west72";

  const signOut = async () => {
    setSidebarOpen(false);
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    // Clear all admin cookies
    document.cookie = "venue-id=; path=/; max-age=0";
    document.cookie = "admin-role=; path=/; max-age=0";
    document.cookie = "admin-name=; path=/; max-age=0";
    document.cookie = "venue-name=; path=/; max-age=0";
    window.location.href = "/";
  };

  const sidebarProps: SidebarProps = {
    groups: navForUser,
    partner,
    pathname,
    wordmarkSrc: operator.logoWhite,
    iconSrc: operator.logoIconWhite,
    brandName: operator.name,
    avatarSrc: userRole === "artist" && avatarUrl ? avatarUrl : undefined,
    adminName,
    venueName,
    subtitle: userRole === "artist" ? "Artist Portal" : undefined,
    drawerOpen: sidebarOpen,
    onNavigate: () => setSidebarOpen(false),
    onSignOut: signOut,
  };

  return (
    <div className="admin-shell">
      {/* Force password change modal — blocks all interaction */}
      {mustChangePassword && userId && (
        <ForcePasswordModal
          userId={userId}
          onComplete={() => setMustChangePassword(false)}
        />
      )}

      {/* Mobile topbar — hamburger left + page title center + nav right */}
      <div className="admin-mobile-topbar">
        {/* Hamburger menu button — left side */}
        <button
          className="admin-mobile-hamburger"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label="Toggle navigation"
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>

        {/* Centered wordmark — links to homepage */}
        <Link href="/" style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={isWest72Operator ? "/West72_Logos/W72_tech_wordmark_white.png" : "/VenueCore_Logos/VenueCore_Wordmark_White.png"}
            alt={isWest72Operator ? "West72" : "VenueCore"}
            style={{ height: 22, objectFit: "contain" }}
          />
        </Link>

        <button
          className="admin-mobile-avatar-btn"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label="Open navigation menu"
          style={isWest72Operator ? { borderRadius: 12 } : undefined}
        >
          {isWest72Operator ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/West72_Logos/W72_tech_icon_white.png" alt="W72" className="admin-mobile-avatar-img" style={{ borderRadius: 8, objectFit: "contain" }} />
          ) : avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={avatarUrl} alt="" className="admin-mobile-avatar-img" />
          ) : (
            <span className="admin-mobile-avatar-placeholder">
              {adminName ? adminName.charAt(0).toUpperCase() : "☰"}
            </span>
          )}
        </button>
      </div>

      {sidebarOpen && (
        <div className="anav-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <Suspense fallback={<AdminSidebar {...sidebarProps} tabParam={null} />}>
        <SidebarWithTab {...sidebarProps} />
      </Suspense>

      <main className="admin-content">{children}</main>
    </div>
  );
}
