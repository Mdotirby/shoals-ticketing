"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const sidebarItems = [
  { label: "Dashboard", href: "/admin", icon: "📊" },
  { label: "Create Event", href: "/admin/events/new", icon: "🎵" },
  { label: "Create Offer", href: "/admin/offers/new", icon: "📝" },
  { label: "Events", href: "/admin/events", icon: "🎪" },
  { label: "Sales", href: "/admin/orders", icon: "💰" },
  { label: "Scanner", href: "/admin/scan", icon: "📱" },
  { label: "Settings", href: "/admin/settings", icon: "⚙️" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Don't show sidebar on login page
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <Image
            src="/beige-brown-logo.png"
            alt="West 72"
            width={100}
            height={100}
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
