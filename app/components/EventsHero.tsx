"use client";

import { useVenue } from "@/app/components/VenueContext";
import SafeImage from "@/app/components/SafeImage";

export default function EventsHero() {
  const { venueSlug } = useVenue();

  return (
    <div className="events-hero-shell" style={{ position: "relative", overflow: "hidden" }}>
      {/* Hero background image with per-venue override */}
      <SafeImage
        src={`/hero-images/${venueSlug}/hero`}
        fallback="/hero-images/default/hero"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      <div className="events-hero-container" style={{ position: "relative", zIndex: 1 }}>
        <div className="events-section-header">
          <div className="events-eyebrow">
            <span className="events-eyebrow-glow" />
            <span className="events-eyebrow-accent-left" />
            <span className="events-eyebrow-text">UPCOMING SHOWS</span>
            <span className="events-eyebrow-accent-right" />
          </div>

          <h1 className="events-heading">WHAT&apos;S COMING ..?</h1>
        </div>
      </div>
    </div>
  );
}
