"use client";

import { createContext, useContext } from "react";

type VenueContextValue = {
  venueSlug: string; // "default" on root domain, otherwise the subdomain slug
  isVenueSubdomain: boolean;
};

const VenueContext = createContext<VenueContextValue>({
  venueSlug: "default",
  isVenueSubdomain: false,
});

export function useVenue() {
  return useContext(VenueContext);
}

export function VenueProvider({
  venueSlug,
  children,
}: {
  venueSlug: string;
  children: React.ReactNode;
}) {
  return (
    <VenueContext.Provider
      value={{ venueSlug, isVenueSubdomain: venueSlug !== "default" }}
    >
      {children}
    </VenueContext.Provider>
  );
}
