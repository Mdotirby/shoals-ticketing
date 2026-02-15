"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";

const sidebarItems = [
  { label: "Dashboard", href: "/admin" },
  { label: "Events", href: "/admin/events" },
  { label: "Booking", href: "/admin/offers" },
  { label: "Partners", href: "/admin/sponsors" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Sales", href: "/admin/orders" },
  { label: "Scanner", href: "/admin/scan" },
  { label: "Management", href: "/portal" },
  { label: "Settings", href: "/admin/settings" },
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

  useEffect(() => {
    // Fetch admin user name
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        // Use display name from metadata, or first part of email
        const name =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Admin";
        setAdminName(name);
      }
    });

    // Fetch venue name
    const venueId = getCookie("venue-id");
    if (venueId) {
      fetch("/api/venues")
        .then((r) => r.json())
        .then((venues) => {
          if (Array.isArray(venues)) {
            const v = venues.find((x: { id: string }) => x.id === venueId);
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
          alt="West 72"
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
            alt="West 72"
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
          {sidebarItems.map((item) => (
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
