"use client";

import { useVenue } from "@/app/components/VenueContext";
import SafeImage from "@/app/components/SafeImage";

export default function AdminSidebar() {
  const { venueSlug } = useVenue();

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-logo">
        <a href="https://venuecore.live">
          <SafeImage
            src={`/logos/${venueSlug}/logo.png`}
            fallback="/logos/default/logo.png"
            alt="Venue Logo"
            style={{ width: 120, height: "auto", objectFit: "contain" }}
          />
        </a>
      </div>
    </aside>
  );
}
