"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { useVenueTheme } from "@/app/components/VenueThemeProvider";
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
  { label: "Partners",         href: "/admin/sponsors",    roles: ["owner","venue_admin"] },
  { label: "Reports",          href: "/admin/reports",     roles: ["owner","venue_admin","full_admin","read_only","box_office","artist"] },
  { label: "Sales",            href: "/admin/orders",      roles: ["owner","venue_admin","full_admin","box_office","door_greeter"] },
  { label: "Scanner",          href: "/admin/scan",        roles: ["owner","venue_admin","full_admin","box_office","door_greeter"] },
  { label: "Guest List",       href: "/admin/guest-list",  roles: ["artist"] },
  { label: "Guest Lists",      href: "/admin/guest-lists", roles: ["owner","venue_admin","full_admin"] },
  { label: "Venue Management", href: "/portal",            roles: ["owner","venue_admin"] },
  { label: "Onboarding",       href: "/admin/onboarding",  roles: ["owner"] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const venueTheme = useVenueTheme();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    async function loadUser() {
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;

      const uid = authData.user.id;
      setUserId(uid);

      // Fetch admin_users record for role + must_change_password
      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("role, venue_id, first_name, last_name, must_change_password")
        .eq("id", uid)
        .single();

      if (adminRecord) {
        setUserRole(adminRecord.role || "");
        setMustChangePassword(adminRecord.must_change_password === true);

        const name = adminRecord.first_name
          ? adminRecord.first_name
          : (authData.user.email?.split("@")[0].split(".")[0] ?? "Admin");
        setAdminName(name.charAt(0).toUpperCase() + name.slice(1));

        // Load venue name + logo
        if (adminRecord.venue_id) {
          const { data: venue } = await supabase
            .from("venues")
            .select("name, logo_url")
            .eq("id", adminRecord.venue_id)
            .single();
          if (venue) {
            setVenueName(venue.name || "");
            if (venue.logo_url) setSidebarLogoUrl(venue.logo_url);
          }
        } else if (adminRecord.role === "owner") {
          setVenueName("All Venues");
        }
      }
    }

    loadUser();
  }, []);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const visibleItems = sidebarItems.filter(
    (item) => !userRole || item.roles.includes(userRole)
  );

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
        <Image
          src="/beige-brown-logo.png"
          alt="VenueCore"
          width={48}
          height={48}
          unoptimized
          className="admin-mobile-logo"
        />
      </div>

      {sidebarOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`admin-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="admin-sidebar-header">
          {(sidebarLogoUrl || venueTheme.logo_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sidebarLogoUrl || venueTheme.logo_url || "/beige-brown-logo.png"}
              alt={venueName || "Venue"}
              className="admin-sidebar-logo"
              style={{ width: 80, height: 80, objectFit: "contain" }}
            />
          ) : (
            <Image
              src="/beige-brown-logo.png"
              alt="VenueCore"
              width={100}
              height={100}
              unoptimized
              className="admin-sidebar-logo"
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
