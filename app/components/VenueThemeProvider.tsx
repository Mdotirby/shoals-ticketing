"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";

type VenueTheme = {
  name: string;
  slug: string;
  logo_url: string | null;
  hero_image_url: string | null;
  hero_image_2_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  isVenueSubdomain: boolean;
};

const defaultTheme: VenueTheme = {
  name: "",
  slug: "",
  logo_url: null,
  hero_image_url: null,
  hero_image_2_url: null,
  primary_color: "#d0c290",
  secondary_color: "#0b0d1d",
  accent_color: "#202045",
  isVenueSubdomain: false,
};

const VenueContext = createContext<VenueTheme>(defaultTheme);

export function useVenueTheme() {
  return useContext(VenueContext);
}

export default function VenueThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<VenueTheme>(defaultTheme);
  const [themeCSS, setThemeCSS] = useState("");

  useEffect(() => {
    const venueSlug = getCookie("venue-slug");
    if (!venueSlug) return;

    fetch(`/api/venues?slug=${venueSlug}`)
      .then((r) => r.json())
      .then((venue) => {
        if (venue && !venue.error) {
          const pc = venue.primary_color || "#d0c290";
          const sc = venue.secondary_color || "#0b0d1d";
          const ac = venue.accent_color || "#202045";

          setTheme({
            name: venue.name || "",
            slug: venue.slug || "",
            logo_url: venue.logo_url || null,
            hero_image_url: venue.hero_image_url || null,
            hero_image_2_url: venue.hero_image_2_url || null,
            primary_color: pc,
            secondary_color: sc,
            accent_color: ac,
            isVenueSubdomain: true,
          });

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
    <VenueContext.Provider value={theme}>
      {themeCSS && <style dangerouslySetInnerHTML={{ __html: themeCSS }} />}
      {children}
    </VenueContext.Provider>
  );
}
