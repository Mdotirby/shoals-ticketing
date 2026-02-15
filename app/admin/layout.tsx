"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const sidebarItems = [
  { label: "Dashboard", href: "/admin", icon: "🏠" },
  { label: "Create Event", href: "/admin/events/new", icon: "🎵" },
  { label: "Create Offer", href: "/admin/offers/new", icon: "📝" },
  { label: "Events", href: "/admin/events", icon: "🎪" },
  { label: "Partners", href: "/admin/sponsors", icon: "🤝" },
  { label: "Reports", href: "/admin/reports", icon: "📊" },
  { label: "Sales", href: "/admin/orders", icon: "💰" },
  { label: "Scanner", href: "/admin/scan", icon: "📱" },
  { label: "Portal", href: "/portal", icon: "👤" },
  { label: "Settings", href: "/admin/settings", icon: "⚙️" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
              <span className="admin-sidebar-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="admin-content">{children}</main>
    </div>
  );
}
