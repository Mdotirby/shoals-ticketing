"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";

export default function VenueThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeCSS, setThemeCSS] = useState("");

  useEffect(() => {
    const venueSlug = getCookie("venue-slug");
    if (!venueSlug) return;

    // Fetch venue colors by slug
    fetch(`/api/venues?slug=${venueSlug}`)
      .then((r) => r.json())
      .then((venue) => {
        if (venue && !venue.error) {
          const pc = venue.primary_color || "#d0c290";
          const sc = venue.secondary_color || "#0b0d1d";
          const ac = venue.accent_color || "#202045";
          setThemeCSS(`
            :root {
              --venue-primary: ${pc};
              --venue-secondary: ${sc};
              --venue-accent: ${ac};
            }
          `);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      {themeCSS && <style dangerouslySetInnerHTML={{ __html: themeCSS }} />}
      {children}
    </>
  );
}
