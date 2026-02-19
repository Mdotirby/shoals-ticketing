"use client";

import Link from "next/link";
import { useVenue } from "@/app/components/VenueContext";
import SafeImage from "@/app/components/SafeImage";

export default function AdminSidebar() {
  const { venueSlug } = useVenue();

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-logo">
        <Link href="/admin">
          <SafeImage
            src={`/logos/${venueSlug}/logo`}
            fallback="/logos/default/logo"
            alt="Venue Logo"
            style={{ width: 120, height: "auto", objectFit: "contain" }}
          />
        </Link>
      </div>
    </aside>
  );
}
