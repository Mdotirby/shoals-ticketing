"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useVenue } from "./VenueContext";

/**
 * VenueTheme — the full branding payload for a venue subdomain.
 * Used by any component that needs to render venue-specific content.
 */
export type VenueTheme = {
  /* Identity */
  name: string;
  slug: string;
  isVenueSubdomain: boolean;

  /* Visual branding */
  logo_url: string | null;
  favicon_url: string | null;
  hero_image_url: string | null;
  hero_image_2_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;

  /* Contact & social */
  tagline: string | null;
  footer_description: string | null;
  support_email: string | null;
  contact_email: string | null;
  instagram_url: string | null;
  facebook_url: string | null;

  /* Homepage content */
  homepage_headline: string | null;
  homepage_subheadline: string | null;
  homepage_cta_text: string;
  homepage_cta_url: string;

  /* About page content */
  about_headline: string | null;
  about_description: string | null;
  about_image_url: string | null;
  about_features: Array<{ title: string; description: string; icon: string }>;
};

const defaultTheme: VenueTheme = {
  name: "",
  slug: "",
  isVenueSubdomain: false,
  logo_url: null,
  favicon_url: null,
  hero_image_url: null,
  hero_image_2_url: null,
  primary_color: "#d0c290",
  secondary_color: "#111827",
  accent_color: "#202045",
  tagline: null,
  footer_description: null,
  support_email: null,
  contact_email: null,
  instagram_url: null,
  facebook_url: null,
  homepage_headline: null,
  homepage_subheadline: null,
  homepage_cta_text: "See What's Coming",
  homepage_cta_url: "/events",
  about_headline: null,
  about_description: null,
  about_image_url: null,
  about_features: [],
};

const ThemeContext = createContext<VenueTheme>(defaultTheme);

export function useVenueTheme() {
  return useContext(ThemeContext);
}

/**
 * Simple hex color validator — prevents CSS injection
 */
function isValidHex(color: string | null | undefined): boolean {
  if (!color) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);
}

export default function VenueThemeProvider({ children }: { children: React.ReactNode }) {
  const { venueSlug, isVenueSubdomain } = useVenue();
  const [theme, setTheme] = useState<VenueTheme>(defaultTheme);

  useEffect(() => {
    if (!isVenueSubdomain) return;

    // Check sessionStorage cache first
    const cacheKey = `vc-theme-${venueSlug}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setTheme(parsed);
        injectCSSVariables(parsed);
        return;
      } catch { /* fall through to fetch */ }
    }

    fetch(`/api/venues?slug=${venueSlug}`)
      .then((r) => r.json())
      .then((venue) => {
        if (venue && !venue.error) {
          const t: VenueTheme = {
            name: venue.name || "",
            slug: venue.slug || "",
            isVenueSubdomain: true,
            logo_url: venue.logo_url || null,
            favicon_url: venue.favicon_url || null,
            hero_image_url: venue.hero_image_url || null,
            hero_image_2_url: venue.hero_image_2_url || null,
            primary_color: venue.primary_color || defaultTheme.primary_color,
            secondary_color: venue.secondary_color || defaultTheme.secondary_color,
            accent_color: venue.accent_color || defaultTheme.accent_color,
            tagline: venue.tagline || null,
            footer_description: venue.footer_description || null,
            support_email: venue.support_email || null,
            contact_email: venue.contact_email || venue.buyer_email || null,
            instagram_url: venue.instagram_url || null,
            facebook_url: venue.facebook_url || null,
            homepage_headline: venue.homepage_headline || null,
            homepage_subheadline: venue.homepage_subheadline || null,
            homepage_cta_text: venue.homepage_cta_text || defaultTheme.homepage_cta_text,
            homepage_cta_url: venue.homepage_cta_url || defaultTheme.homepage_cta_url,
            about_headline: venue.about_headline || null,
            about_description: venue.about_description || null,
            about_image_url: venue.about_image_url || null,
            about_features: Array.isArray(venue.about_features) ? venue.about_features : [],
          };

          setTheme(t);
          injectCSSVariables(t);

          // Cache in sessionStorage
          try { sessionStorage.setItem(cacheKey, JSON.stringify(t)); } catch {}
        }
      })
      .catch(() => {});
  }, [venueSlug, isVenueSubdomain]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Inject venue branding as CSS custom properties + update the browser favicon.
 * Activates all var(--venue-primary/secondary/accent) overrides in globals.css.
 */
function injectCSSVariables(theme: VenueTheme) {
  const root = document.documentElement;

  if (isValidHex(theme.primary_color)) {
    root.style.setProperty("--venue-primary", theme.primary_color);
    root.style.setProperty("--vc-gold", theme.primary_color);
  }
  if (isValidHex(theme.secondary_color)) {
    root.style.setProperty("--venue-secondary", theme.secondary_color);
    root.style.setProperty("--vc-bg", theme.secondary_color);
  }
  if (isValidHex(theme.accent_color)) {
    root.style.setProperty("--venue-accent", theme.accent_color);
  }

  // Swap favicon dynamically so the browser tab reflects the venue brand
  if (theme.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = theme.favicon_url;
  }
}
