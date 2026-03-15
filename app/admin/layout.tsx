"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";
import { useVenue } from "@/app/components/VenueContext";
import SafeImage from "@/app/components/SafeImage";
import ForcePasswordModal from "@/app/components/admin/ForcePasswordModal";

type SidebarItem = {
  label: string;
  href: string;
  roles: string[];
  divider?: boolean; // show a thin line before this item
};

const sidebarItems: SidebarItem[] = [
  // ── Core ──
  { label: "Dashboard",        href: "/admin",                     roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist","partner"] },
  { label: "Calendar",         href: "/admin/calendar",            roles: ["owner","venue_admin","full_admin"] },
  { label: "Events",           href: "/admin/events",              roles: ["owner","venue_admin","full_admin"] },

  // ── Business ──
  { label: "Booking",          href: "/admin/offers",              roles: ["owner","venue_admin"], divider: true },
  { label: "Settlements",      href: "/admin/settlements",         roles: ["owner","venue_admin"] },
  { label: "Contracts",        href: "/admin/contracts",           roles: ["owner","venue_admin"] },

  // ── Revenue ──
  { label: "Sales",            href: "/admin/orders",              roles: ["owner","venue_admin","full_admin","box_office","door_greeter","artist"], divider: true },
  { label: "Reports",          href: "/admin/reports",             roles: ["owner","venue_admin","full_admin","read_only","box_office"] },

  // ── Day of Show ──
  { label: "Scanner",          href: "/admin/scan",                roles: ["owner","venue_admin","full_admin","box_office","door_greeter"], divider: true },
  { label: "Guest Lists",      href: "/admin/guest-lists",         roles: ["owner","venue_admin","full_admin","artist"] },
  { label: "Live Pulse",       href: "/admin/live",                roles: ["owner","venue_admin","full_admin"] },

  // ── Growth ──
  { label: "Marketing",        href: "/admin/marketing",           roles: ["owner","venue_admin","full_admin"], divider: true },
  { label: "Market Radar",     href: "/admin/market-radar",        roles: ["owner","venue_admin"] },
  { label: "Auctions",         href: "/admin/auctions",            roles: ["owner","venue_admin","full_admin"] },
  { label: "Partners",         href: "/admin/sponsors",            roles: ["owner","venue_admin"] },
  { label: "Agents",           href: "/admin/agents",              roles: ["owner","venue_admin"] },

  // ── Operations ──
  { label: "SOPs",             href: "/admin/sops",                roles: ["owner","venue_admin"], divider: true },

  // ── Settings ──
  { label: "Site Branding",    href: "/admin/settings/branding",   roles: ["owner","venue_admin"], divider: true },
  { label: "Venue Management", href: "/portal",                    roles: ["owner","venue_admin"] },
  { label: "Permissions",      href: "/admin/settings/permissions", roles: ["owner"] },
  { label: "Onboarding",       href: "/admin/onboarding",          roles: ["owner"] },

  // ── Partner Only ──
  { label: "Partner Dashboard", href: "/admin/partner-dashboard",  roles: ["partner"] },
];

// Map sidebar labels to tab_key used in sidebar_permissions table
const TAB_KEY_MAP: Record<string, string> = {
  "Dashboard": "dashboard",
  "Calendar": "calendar",
  "Events": "events",
  "Booking": "booking",
  "Settlements": "settlements",
  "Contracts": "contracts",
  "Partners": "partners",
  "Auctions": "auctions",
  "Reports": "reports",
  "Sales": "sales",
  "Live Pulse": "live_pulse",
  "Scanner": "scanner",
  "Guest Lists": "guest_lists",
  "Marketing": "marketing",
  "Agents": "agents",
  "Partner Dashboard": "partner_dashboard",
  "SOPs": "sops",
  "Venue Management": "venue_management",
  "Site Branding": "site_branding",
  "Onboarding": "onboarding",
  "Permissions": "permissions",
};

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
            .select("name, slug")
            .eq("id", adminRecord.venue_id)
            .single();
          if (venue) {
            setVenueName(venue.name || "");
            if (venue.slug) setVenueSlugResolved(venue.slug);
            // Persist venue name in cookie for instant sidebar display
            document.cookie = `venue-name=${encodeURIComponent(venue.name || "")}; path=/; samesite=lax`;
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

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Artists get a hardcoded sidebar — Dashboard, Sales, Guest Lists only
  const ARTIST_ALLOWED_LABELS = ["Dashboard", "Sales", "Guest Lists"];

  const visibleItems = sidebarItems.filter((item) => {
    // Hardcode artist sidebar — ignore sidebar_permissions entirely
    if (userRole === "artist") {
      return ARTIST_ALLOWED_LABELS.includes(item.label);
    }

    const tabKey = TAB_KEY_MAP[item.label];
    // When sidebar_permissions are loaded, they are the sole authority
    if (sidebarPerms && tabKey && tabKey in sidebarPerms) {
      return sidebarPerms[tabKey];
    }
    // Fallback: hardcoded role check (used when no permissions data exists)
    if (userRole && !item.roles.includes(userRole)) return false;
    return true;
  });

  return (
    <div className="admin-shell">
      {/* Force password change modal — blocks all interaction */}
      {mustChangePassword && userId && (
        <ForcePasswordModal
          userId={userId}
          onComplete={() => setMustChangePassword(false)}
        />
      )}

      {/* Mobile topbar — avatar dropdown */}
      <div className="admin-mobile-topbar">
        <SafeImage
          src={(() => { const logoSlug = venueSlugResolved || (venueSlug !== "default" ? venueSlug : ""); return logoSlug ? `/logos/${logoSlug}/logo.png` : "/logos/default/logo.png"; })()}
          fallback="/logos/default/logo.png"
          alt="VenueCore"
          style={{ width: 36, height: 36, objectFit: "contain" }}
        />
        <div className="admin-mobile-dropdown-wrapper">
          <button
            className="admin-mobile-avatar-btn"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle navigation"
          >
            {avatarUrl ? (
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
            <div style={{ height: 1, background: "var(--vc-border-subtle)", margin: "6px 0" }} />
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
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--vc-danger)" }}
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
                border: "3px solid rgba(208,194,144,0.3)",
              }}
            />
          ) : (
            <SafeImage
              src={(() => { const logoSlug = venueSlugResolved || (venueSlug !== "default" ? venueSlug : ""); return logoSlug ? `/logos/${logoSlug}/logo.png` : "/logos/default/logo.png"; })()}
              fallback="/logos/default/logo.png"
              alt={venueName || "VenueCore"}
              className="admin-sidebar-logo"
              style={{ width: 80, height: 80, objectFit: "contain" }}
            />
          )}
          {adminName && (
            <p className="admin-sidebar-welcome">
              Welcome, <strong>{adminName}</strong>
            </p>
          )}
          {venueName && <p className="admin-sidebar-venue">{venueName}</p>}
          {userRole === "artist" && (
            <p style={{ fontSize: 11, color: "rgba(208,194,144,0.5)", marginTop: 2 }}>
              Artist Portal
            </p>
          )}
        </div>

        <nav className="admin-sidebar-nav">
          {visibleItems.map((item) => (
            <div key={item.href + item.label}>
              {item.divider && (
                <div style={{ height: 1, background: "var(--vc-border-subtle)", margin: "8px 0" }} />
              )}
              <Link
                href={item.href}
                className={`admin-sidebar-link ${pathname === item.href ? "active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>

        {/* Sign Out — pinned to bottom */}
        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <div style={{ height: 1, background: "var(--vc-border-subtle)", marginBottom: 12 }} />
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
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: "var(--vc-radius-sm)",
              background: "transparent",
              border: "none",
              color: "var(--vc-text-muted)",
              fontFamily: "var(--font-urbanist), sans-serif",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 180ms ease, color 180ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)";
              e.currentTarget.style.color = "#f87171";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--vc-text-muted)";
            }}
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
