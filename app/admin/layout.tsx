"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";
import { useVenue } from "@/app/components/VenueContext";
import SafeImage from "@/app/components/SafeImage";
import ForcePasswordModal from "@/app/components/admin/ForcePasswordModal";
import {
  dashboardItem,
  sidebarGroups,
  partnerItem,
  TAB_KEY_MAP,
  type SidebarItem,
} from "@/lib/admin/nav";

/* Nav definition moved to lib/admin/nav.ts — it was duplicated in
   settings/permissions/page.tsx and the two had already drifted. See the
   comment there. */

/* The design system's sidebar groups are a label and a caret, nothing else
   (design/liquid-glass/admin-globals.css.snippet.css, .nav-section). The
   frosted SVG icons that used to sit left of each label were an addition
   this portal made on its own and are not in any mockup, so they are gone;
   SidebarGroup.icon stays in lib/admin/nav.ts, unused for now, rather than
   churning that file's shape. */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { venueSlug } = useVenue();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [venueSlugResolved, setVenueSlugResolved] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [userId, setUserId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [sidebarPerms, setSidebarPerms] = useState<Record<string, boolean> | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Shows"]));
  // Lazy initializer runs once on mount — cookie is always present (set by middleware, not httpOnly)
  const [isWest72Operator] = useState(() => getCookie("operatorSlug") === "west72");

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
            if (venue.slug) setVenueSlugResolved(venue.slug);
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
                      if (v.slug) setVenueSlugResolved(v.slug);
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

  // Auto-expand the group containing the current page. Must run
  // unconditionally, before the /admin/login early return below — this
  // component stays mounted across a client-side navigation from
  // /admin/login into the dashboard (same layout boundary, router.push not
  // a full reload), and a hook called only on one side of that branch
  // throws "Rendered more hooks than during the previous render" the moment
  // that navigation happens — which is exactly what a blank screen right
  // after logging in looks like.
  useEffect(() => {
    for (const g of sidebarGroups) {
      if (g.items.some((i) => pathname === i.href || (i.href !== "/admin" && pathname.startsWith(i.href)))) {
        setExpandedGroups((prev) => new Set(prev).add(g.groupLabel));
        break;
      }
    }
  }, [pathname]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Artists get a hardcoded sidebar
  const ARTIST_ALLOWED_LABELS = ["Dashboard", "Ticket Sales", "Guest Lists"];

  const isItemVisible = (item: SidebarItem): boolean => {
    if (userRole === "artist") return ARTIST_ALLOWED_LABELS.includes(item.label);
    const tabKey = TAB_KEY_MAP[item.label];
    if (sidebarPerms && tabKey && tabKey in sidebarPerms) return sidebarPerms[tabKey];
    if (userRole && !item.roles.includes(userRole)) return false;
    return true;
  };

  // Filter groups to only show groups with visible items
  const visibleGroups = sidebarGroups
    .map((g) => ({ ...g, items: g.items.filter(isItemVisible) }))
    .filter((g) => g.items.length > 0);

  // Flatten for mobile dropdown — Dashboard first, then groups, then partner
  const visibleItems: SidebarItem[] = [];
  if (isItemVisible(dashboardItem)) visibleItems.push(dashboardItem);
  visibleItems.push(...visibleGroups.flatMap((g) => g.items));
  if (userRole === "partner" && isItemVisible(partnerItem)) {
    visibleItems.push(partnerItem);
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const operatorIconFallback = isWest72Operator
    ? "/West72_Logos/W72_tech_icon_white.png"
    : "/VenueCore_Logos/VenueCore_Icon_Color.png";
  const operatorWordmarkFallback = isWest72Operator
    ? "/West72_Logos/W72_tech_wordmark_white.png"
    : "/VenueCore_Logos/VenueCore_Icon_Color.png";

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

        <div className="admin-mobile-dropdown-wrapper">
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
            <span className={`admin-mobile-dropdown-arrow ${sidebarOpen ? "open" : ""}`}>▾</span>
          </button>
          <nav className={`admin-mobile-dropdown-menu ${sidebarOpen ? "dropdown-open" : ""}`}>
            {visibleItems.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`admin-mobile-dropdown-link ${pathname === item.href ? "active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="admin-sidebar-divider admin-sidebar-divider--tight" />
            <button
              className="admin-mobile-dropdown-link"
              onClick={async () => {
                setSidebarOpen(false);
                const supabase = getSupabaseBrowser();
                await supabase.auth.signOut();
                document.cookie = "venue-id=; path=/; max-age=0";
                document.cookie = "admin-role=; path=/; max-age=0";
                document.cookie = "admin-name=; path=/; max-age=0";
                document.cookie = "venue-name=; path=/; max-age=0";
                window.location.href = "/";
              }}
              style={{ textAlign: "left", color: "var(--vc-danger)" }}
            >
              Sign Out
            </button>
          </nav>
        </div>
      </div>

      {sidebarOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Desktop sidebar — hidden on mobile */}
      <aside className={`admin-sidebar`}>
        <div className="admin-sidebar-header">
          {userRole === "artist" && avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt={adminName || "Artist"}
              style={{
                width: 80, height: 80, borderRadius: "50%", objectFit: "cover",
                border: "3px solid rgba(255,255,255,0.3)",
              }}
            />
          ) : (
            <SafeImage
              src={(() => { const logoSlug = venueSlugResolved || (venueSlug !== "default" ? venueSlug : ""); return logoSlug ? `/logos/${logoSlug}/logo.png` : operatorWordmarkFallback; })()}
              fallback={operatorWordmarkFallback}
              alt={venueName || "VenueCore"}
              className="admin-sidebar-logo"
              style={isWest72Operator && !venueSlugResolved && venueSlug === "default"
                ? { width: 160, height: 40, objectFit: "contain" }
                : { width: 80, height: 80, objectFit: "contain" }}
            />
          )}
          {adminName && (
            <p className="admin-sidebar-welcome">
              Welcome, <strong>{adminName}</strong>
            </p>
          )}
          {venueName && <p className="admin-sidebar-venue">{venueName}</p>}
          {userRole === "artist" && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              Artist Portal
            </p>
          )}
        </div>

        <nav className="admin-sidebar-nav">
          {/* Dashboard — standalone above all groups */}
          {isItemVisible(dashboardItem) && (
            <Link
              href={dashboardItem.href}
              className={`admin-sidebar-link admin-sidebar-link--dashboard ${pathname === dashboardItem.href ? "active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
              Dashboard
            </Link>
          )}
          {visibleGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.groupLabel);
            const hasActivePage = group.items.some((i) => pathname === i.href || (i.href !== "/admin" && pathname.startsWith(i.href)));
            return (
              <div key={group.groupLabel} className="admin-sidebar-group">
                <button
                  onClick={() => toggleGroup(group.groupLabel)}
                  className={`admin-sidebar-group-btn${isExpanded ? " is-expanded" : ""}${hasActivePage ? " has-active" : ""}`}
                  aria-expanded={isExpanded}
                >
                  <span className="admin-sidebar-group-label">{group.groupLabel}</span>
                  <span className="admin-sidebar-group-caret" aria-hidden="true">▾</span>
                </button>
                {isExpanded && (
                  <div className="admin-sidebar-group-items">
                    {group.items.map((item) => (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={`admin-sidebar-link admin-sidebar-link--sub ${pathname === item.href ? "active" : ""}`}
                        onClick={() => setSidebarOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {userRole === "partner" && isItemVisible(partnerItem) && (
            <Link
              href={partnerItem.href}
              className={`admin-sidebar-link ${pathname === partnerItem.href ? "active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              {partnerItem.label}
            </Link>
          )}
        </nav>

        {/* Sign Out — pinned to bottom */}
        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-divider" />
          <button
            onClick={async () => {
              const supabase = getSupabaseBrowser();
              await supabase.auth.signOut();
              // Clear all admin cookies
              document.cookie = "venue-id=; path=/; max-age=0";
              document.cookie = "admin-role=; path=/; max-age=0";
              document.cookie = "admin-name=; path=/; max-age=0";
              document.cookie = "venue-name=; path=/; max-age=0";
              window.location.href = "/";
            }}
            className="admin-signout-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="admin-content">{children}</main>
    </div>
  );
}
