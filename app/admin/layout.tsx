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

const sidebarItems: SidebarItem[] = [
  { label: "Dashboard",        href: "/admin",             roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist"] },
  { label: "Events",           href: "/admin/events",      roles: ["owner","venue_admin","full_admin"] },
  { label: "Booking",          href: "/admin/offers",      roles: ["owner","venue_admin"] },
  { label: "Settlements",      href: "/admin/settlements", roles: ["owner","venue_admin"] },
  { label: "Contracts",        href: "/admin/contracts",   roles: ["owner","venue_admin"] },
  { label: "Partners",         href: "/admin/sponsors",    roles: ["owner","venue_admin"] },
  { label: "Reports",          href: "/admin/reports",     roles: ["owner","venue_admin","full_admin","read_only","box_office","artist"] },
  { label: "Sales",            href: "/admin/orders",      roles: ["owner","venue_admin","full_admin","box_office","door_greeter"] },
  { label: "Scanner",          href: "/admin/scan",        roles: ["owner","venue_admin","full_admin","box_office","door_greeter"] },
  { label: "Guest Lists",      href: "/admin/guest-lists", roles: ["owner","venue_admin","full_admin","artist"] },
  { label: "Venue Management", href: "/portal",            roles: ["owner","venue_admin"] },
  { label: "Onboarding",       href: "/admin/onboarding",  roles: ["owner"] },
  { label: "Permissions",      href: "/admin/settings/permissions", roles: ["owner"] },
];

// Map sidebar labels to tab_key used in sidebar_permissions table
const TAB_KEY_MAP: Record<string, string> = {
  "Dashboard": "dashboard",
  "Events": "events",
  "Booking": "booking",
  "Settlements": "settlements",
  "Contracts": "contracts",
  "Partners": "partners",
  "Reports": "reports",
  "Sales": "sales",
  "Scanner": "scanner",
  "Guest Lists": "guest_lists",
  "Venue Management": "venue_management",
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
    const venueId = getCookie("venue-id");
    if (!venueId || !userRole) return;

    const supabase = getSupabaseBrowser();
    supabase
      .from("sidebar_permissions")
      .select("tab_key, visible")
      .eq("venue_id", venueId)
      .eq("role", userRole)
      .then(({ data }: { data: { tab_key: string; visible: boolean }[] | null }) => {
        if (data && data.length > 0) {
          const map: Record<string, boolean> = {};
          for (const row of data) {
            map[row.tab_key] = row.visible;
          }
          setSidebarPerms(map);
        }
      });
  }, [userRole]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const visibleItems = sidebarItems.filter((item) => {
    // First: hardcoded role check
    if (userRole && !item.roles.includes(userRole)) return false;
    // Second: if sidebar_permissions were loaded, check them
    if (sidebarPerms) {
      const tabKey = TAB_KEY_MAP[item.label];
      if (tabKey && tabKey in sidebarPerms) {
        return sidebarPerms[tabKey];
      }
    }
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

      {/* Mobile topbar */}
      <div className="admin-mobile-topbar">
        <button
          className="admin-mobile-toggle"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label="Toggle sidebar"
        >
          <span className={`admin-toggle-bar ${sidebarOpen ? "open" : ""}`} />
          <span className={`admin-toggle-bar ${sidebarOpen ? "open" : ""}`} />
          <span className={`admin-toggle-bar ${sidebarOpen ? "open" : ""}`} />
        </button>
        <SafeImage
          src={(() => { const logoSlug = venueSlugResolved || (venueSlug !== "default" ? venueSlug : ""); return logoSlug ? `/logos/${logoSlug}/logo.png` : "/logos/default/logo.png"; })()}
          fallback="/logos/default/logo.png"
          alt="VenueCore"
          style={{ width: 48, height: 48, objectFit: "contain" }}
        />
      </div>

      {sidebarOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`admin-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
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
            <Link
              key={item.href + item.label}
              href={item.href}
              className={`admin-sidebar-link ${pathname === item.href ? "active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="admin-content">{children}</main>
    </div>
  );
}
