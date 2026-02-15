"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";

type SidebarItem = {
  label: string;
  href: string;
  roles: string[]; // which roles can see this item
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
  { label: "Management", href: "/portal", roles: ["owner", "venue_admin"] },
  { label: "Settings", href: "/admin/settings", roles: ["owner", "venue_admin"] },
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

  useEffect(() => {
    // Get role and name from cookies
    const role = getCookie("user-role") || "";
    setUserRole(role);

    const cookieName = getCookie("user-name");
    if (cookieName) {
      setAdminName(decodeURIComponent(cookieName));
    } else {
      // Fallback: get from Supabase auth
      async function loadUser() {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          setAdminName(data.user.email?.split("@")[0] || "Admin");
        }
      }
      loadUser();
    }

    // Fetch venue name
    const venueId = getCookie("venue-id");
    if (venueId) {
      fetch("/api/venues")
        .then((r) => r.json())
        .then((venues: Array<{ id: string; name: string }>) => {
          if (Array.isArray(venues)) {
            const v = venues.find((x) => x.id === venueId);
            if (v) setVenueName(v.name);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Don't show sidebar on login page
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Filter sidebar items by role
  const visibleItems = sidebarItems.filter(
    (item) => !userRole || item.roles.includes(userRole)
  );

  return (
    <div className="admin-shell">
      {/* Mobile top bar */}
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

      {/* Overlay backdrop */}
      {sidebarOpen && (
        <div
          className="admin-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`admin-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="admin-sidebar-header">
          <Image
            src="/beige-brown-logo.png"
            alt="VenueCore"
            width={100}
            height={100}
            unoptimized
            className="admin-sidebar-logo"
          />
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
              key={item.href}
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
