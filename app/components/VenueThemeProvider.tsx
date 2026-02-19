"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useVenue } from "./VenueContext";

type VenueTheme = {
  name: string;
  slug: string;
  logo_url: string | null;
  hero_image_url: string | null;
  hero_image_2_url: string | null;
  isVenueSubdomain: boolean;
};

const defaultTheme: VenueTheme = {
  name: "",
  slug: "",
  logo_url: null,
  hero_image_url: null,
  hero_image_2_url: null,
  isVenueSubdomain: false,
};

const VenueContext = createContext<VenueTheme>(defaultTheme);

export function useVenueTheme() {
  return useContext(VenueContext);
}

export default function VenueThemeProvider({ children }: { children: React.ReactNode }) {
  const { venueSlug, isVenueSubdomain } = useVenue();
  const [theme, setTheme] = useState<VenueTheme>(defaultTheme);

  useEffect(() => {
    if (!isVenueSubdomain) return;

    fetch(`/api/venues?slug=${venueSlug}`)
      .then((r) => r.json())
      .then((venue) => {
        if (venue && !venue.error) {
          setTheme({
            name: venue.name || "",
            slug: venue.slug || "",
            logo_url: venue.logo_url || null,
            hero_image_url: venue.hero_image_url || null,
            hero_image_2_url: venue.hero_image_2_url || null,
            isVenueSubdomain: true,
          });
        }
      })
      .catch(() => {});
  }, [venueSlug, isVenueSubdomain]);

  return (
    <VenueContext.Provider value={theme}>
      {children}
    </VenueContext.Provider>
  );
}
