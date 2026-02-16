"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";
import { useVenueTheme } from "@/app/components/VenueThemeProvider";

type SidebarItem = {
  label: string;
  href: string;
  roles: string[];
  ownerLabel?: string; // different label for owner
};

const ALL_ROLES = ["owner", "venue_admin", "read_only", "box_office", "door_greeter"];

const sidebarItems: SidebarItem[] = [
  { label: "Dashboard", href: "/admin", roles: ALL_ROLES },
  { label: "Events", href: "/admin/events", roles: ["owner", "venue_admin"] },
  { label: "Booking", href: "/admin/offers", roles: ["owner", "venue_admin"] },
  { label: "Partners", href: "/admin/sponsors", roles: ["owner", "venue_admin"] },
  { label: "Reports", href: "/admin/reports", roles: ["owner", "venue_admin", "read_only", "box_office"] },
  { label: "Sales", href: "/admin/orders", roles: ["owner", "venue_admin", "box_office", "door_greeter"] },
  { label: "Scanner", href: "/admin/scan", roles: ["owner", "venue_admin", "box_office", "door_greeter"] },
  { label: "Manage My Venue", href: "/portal", roles: ["venue_admin"], ownerLabel: "Venue Management" },
  { label: "Venue Management", href: "/portal", roles: ["owner"] },
  { label: "Onboarding", href: "/admin/onboarding", roles: ["owner"] },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState<string | null>(null);
  const venueTheme = useVenueTheme();

  useEffect(() => {
    const role = getCookie("user-role") || "";
    setUserRole(role);

    const cookieName = getCookie("user-name");
    if (cookieName) {
      setAdminName(decodeURIComponent(cookieName));
    } else {
      async function loadUser() {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          // Parse first name from email (take part before @ and before any dots)
          const emailPrefix = data.user.email?.split("@")[0] || "Admin";
          const firstName = emailPrefix.split(".")[0];
          setAdminName(firstName.charAt(0).toUpperCase() + firstName.slice(1));
        }
      }
      loadUser();
    }

    const venueId = getCookie("venue-id");
    if (venueId) {
      fetch("/api/venues")
        .then((r) => r.json())
        .then((venues: Array<{ id: string; name: string; logo_url?: string }>) => {
          if (Array.isArray(venues)) {
            const v = venues.find((x) => x.id === venueId);
            if (v) {
              setVenueName(v.name);
              if (v.logo_url) setSidebarLogoUrl(v.logo_url);
            }
          }
        })
        .catch(() => {});
    } else if (role === "owner") {
      setVenueName("All Venues");
    }
  }, []);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const visibleItems = sidebarItems.filter(
    (item) => !userRole || item.roles.includes(userRole)
  );

  return (
    <div className="admin-shell">
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
        <div
          className="admin-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
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
          {venueName && (
            <p className="admin-sidebar-venue">{venueName}</p>
          )}
        </div>

        <nav className="admin-sidebar-nav">
          {visibleItems.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={`admin-sidebar-link ${
                pathname === item.href ? "active" : ""
              }`}
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
