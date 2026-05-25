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
};

type SidebarGroup = {
  groupLabel: string;
  icon: string;
  items: SidebarItem[];
  roles: string[];
};

// Dashboard shown standalone above all groups
const dashboardItem: SidebarItem = {
  label: "Dashboard",
  href: "/admin",
  roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist","partner"],
};

const sidebarGroups: SidebarGroup[] = [
  {
    groupLabel: "Shows",
    icon: "shows",
    roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist"],
    items: [
      { label: "Calendar",      href: "/admin/calendar",     roles: ["owner","venue_admin","full_admin"] },
      { label: "Seating",       href: "/admin/seating",      roles: ["owner","venue_admin"] },
    ],
  },
  {
    groupLabel: "Finance",
    icon: "business",
    roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist"],
    items: [
      { label: "Ticket Sales",  href: "/admin/orders",       roles: ["owner","venue_admin","full_admin","box_office","door_greeter","artist"] },
      { label: "Offers",        href: "/admin/offers",       roles: ["owner","venue_admin"] },
      { label: "Settlements",   href: "/admin/settlements",  roles: ["owner","venue_admin"] },
      { label: "Contracts",     href: "/admin/contracts",    roles: ["owner","venue_admin"] },
      { label: "Reports",       href: "/admin/reports",      roles: ["owner","venue_admin","full_admin","read_only","box_office"] },
    ],
  },
  {
    groupLabel: "Day of Show",
    icon: "dayofshow",
    roles: ["owner","venue_admin","full_admin","box_office","door_greeter","artist"],
    items: [
      { label: "Scanner",       href: "/admin/scan",         roles: ["owner","venue_admin","full_admin","box_office","door_greeter"] },
      { label: "Guest Lists",   href: "/admin/guest-lists",  roles: ["owner","venue_admin","full_admin","artist"] },
      { label: "Live Pulse",    href: "/admin/live",         roles: ["owner","venue_admin","full_admin"] },
    ],
  },
  {
    groupLabel: "Marketing",
    icon: "growth",
    roles: ["owner","venue_admin","full_admin"],
    items: [
      { label: "Campaigns",     href: "/admin/marketing",    roles: ["owner","venue_admin","full_admin"] },
      { label: "Email",         href: "/admin/email",        roles: ["owner","super_admin","venue_admin","full_admin"] },
      { label: "Market Radar",  href: "/admin/market-radar", roles: ["owner","venue_admin"] },
      { label: "Auctions",      href: "/admin/auctions",     roles: ["owner","venue_admin","full_admin"] },
      { label: "Sponsors",      href: "/admin/sponsors",     roles: ["owner","venue_admin"] },
    ],
  },
  {
    groupLabel: "Contacts",
    icon: "contacts",
    roles: ["owner","venue_admin"],
    items: [
      { label: "Agents",        href: "/admin/agents",       roles: ["owner","venue_admin"] },
    ],
  },
  {
    groupLabel: "Settings",
    icon: "settings",
    roles: ["owner","venue_admin"],
    items: [
      { label: "Branding",      href: "/admin/settings/branding",    roles: ["owner","venue_admin"] },
      { label: "Venue Portal",  href: "/portal",                     roles: ["owner","venue_admin"] },
      { label: "Procedures",    href: "/admin/sops",                 roles: ["owner","venue_admin"] },
      { label: "Permissions",   href: "/admin/settings/permissions", roles: ["owner"] },
      { label: "Onboarding",    href: "/admin/onboarding",           roles: ["owner"] },
    ],
  },
];

// Partner-only standalone item
const partnerItem: SidebarItem = { label: "Partner Dashboard", href: "/admin/partner-dashboard", roles: ["partner"] };

// Flatten for permission lookups
const allSidebarItems = sidebarGroups.flatMap((g) => g.items).concat([partnerItem, dashboardItem]);
void allSidebarItems; // used by isItemVisible via closure

/** Minimal frosted-glass SVG icons for sidebar groups */
function SidebarIcon({ name }: { name: string }) {
  const s = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style: { opacity: 0.7 } };
  switch (name) {
    case "shows":
      return <svg {...s}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>;
    case "business":
      return <svg {...s}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>;
    case "dayofshow":
      return <svg {...s}><path d="M15 5v2M9 5v2" /><rect x="3" y="4" width="18" height="6" rx="2" /><path d="M3 10v8a2 2 0 002 2h14a2 2 0 002-2v-8" /><path d="M9 14h6" /></svg>;
    case "growth":
      return <svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
    case "contacts":
      return <svg {...s}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>;
    case "settings":
      return <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>;
    default:
      return <svg {...s}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

// Map sidebar labels to tab_key used in sidebar_permissions table.
// New label names map to the same underlying tab_key so DB permissions are unchanged.
const TAB_KEY_MAP: Record<string, string> = {
  "Dashboard": "dashboard",
  "Calendar": "calendar",
  "Shows": "events",           // was "Events"
  "Seating": "seating",
  "Ticket Sales": "sales",     // was "Sales"
  "Offers": "booking",         // was "Booking"
  "Settlements": "settlements",
  "Contracts": "contracts",
  "Reports": "reports",
  "Scanner": "scanner",
  "Guest Lists": "guest_lists",
  "Live Pulse": "live_pulse",
  "Campaigns": "marketing",    // was "Marketing"
  "Email": "email_engine",     // was "Email Engine"
  "Market Radar": "market_radar",
  "Auctions": "auctions",
  "Sponsors": "partners",      // was "Partners"
  "Agents": "agents",
  "Branding": "site_branding", // was "Site Branding"
  "Venue Portal": "venue_management", // was "Venue Management"
  "Procedures": "sops",        // was "SOPs"
  "Permissions": "permissions",
  "Onboarding": "onboarding",
  "Partner Dashboard": "partner_dashboard",
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Shows"]));

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

  // Auto-expand the group containing the current page
  useEffect(() => {
    for (const g of sidebarGroups) {
      if (g.items.some((i) => pathname === i.href || (i.href !== "/admin" && pathname.startsWith(i.href)))) {
        setExpandedGroups((prev) => new Set(prev).add(g.groupLabel));
        break;
      }
    }
  }, [pathname]);

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
          src={(() => { const logoSlug = venueSlugResolved || (venueSlug !== "default" ? venueSlug : ""); return logoSlug ? `/logos/${logoSlug}/logo.png` : "/VenueCore_Logos/VenueCore_Icon_Color.png"; })()}
          fallback="/VenueCore_Logos/VenueCore_Icon_Color.png"
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
              src={(() => { const logoSlug = venueSlugResolved || (venueSlug !== "default" ? venueSlug : ""); return logoSlug ? `/logos/${logoSlug}/logo.png` : "/VenueCore_Logos/VenueCore_Icon_Color.png"; })()}
              fallback="/VenueCore_Logos/VenueCore_Icon_Color.png"
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
          {/* Dashboard — standalone above all groups */}
          {isItemVisible(dashboardItem) && (
            <Link
              href={dashboardItem.href}
              className={`admin-sidebar-link ${pathname === dashboardItem.href ? "active" : ""}`}
              onClick={() => setSidebarOpen(false)}
              style={{
                fontSize: 13,
                padding: "7px 14px",
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderRadius: "var(--vc-radius-sm)",
              }}
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
              <div key={group.groupLabel} style={{ marginBottom: 2 }}>
                <button
                  onClick={() => toggleGroup(group.groupLabel)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px", border: "none", borderRadius: "var(--vc-radius-sm)",
                    background: isExpanded ? "rgba(255,255,255,0.03)" : "transparent",
                    color: hasActivePage ? "var(--venue-primary, #d0c290)" : "var(--vc-text-muted)",
                    fontFamily: "var(--font-urbanist), sans-serif", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em",
                    transition: "background 150ms, color 150ms",
                  }}
                >
                  <SidebarIcon name={group.icon} />
                  <span style={{ flex: 1, textAlign: "left" }}>{group.groupLabel}</span>
                  <span style={{ fontSize: 10, opacity: 0.5, transition: "transform 150ms", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                </button>
                {isExpanded && (
                  <div style={{ paddingLeft: 12, marginTop: 2 }}>
                    {group.items.map((item) => (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={`admin-sidebar-link ${pathname === item.href ? "active" : ""}`}
                        onClick={() => setSidebarOpen(false)}
                        style={{ fontSize: 13, padding: "6px 14px" }}
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
