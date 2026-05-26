/**
 * Operator Config
 * ---------------
 * Defines branding and contact info for each operator domain.
 * VenueCore is the platform; West72 is a licensee with its own domain.
 * Add new operators here as needed — one entry per root domain.
 */

export type OperatorConfig = {
  slug: string;
  name: string;
  shortName: string;
  domain: string;
  /** Horizontal color logo — used in header on light/transparent backgrounds */
  logo: string;
  /** Horizontal white logo — used in footer on dark backgrounds */
  logoWhite: string;
  /** Icon-only logo — used in admin sidebar and collapsed nav */
  logoIcon: string;
  /** Stacked logo — used on auth/login/splash screens */
  logoStacked: string;
  logoAlt: string;
  /** Path to favicon in /public/favicons */
  favicon: string;
  supportEmail: string;
  contactEmail: string;
  privacyEmail: string;
  tagline: string;
  footerDescription: string;
  instagramUrl: string;
  facebookUrl: string;
  /** Name used in copyright line */
  copyright: string;
  /** Meta (Facebook) Pixel ID — fires on every page for this operator */
  metaPixelId?: string;
  /** Hardcoded hero images for the operator root domain — never pulled from Supabase */
  heroImage: string;
  heroImage2: string;
  /** Whether this operator hosts venue subdomains (e.g. shoals.venuecore.live).
   *  west72ent.com is root-only — no subdomains exist or should be routed. */
  supportsSubdomains: boolean;
};

export const OPERATORS: Record<string, OperatorConfig> = {
  venuecore: {
    slug: "venuecore",
    name: "VenueCore",
    shortName: "VenueCore",
    domain: "venuecore.live",
    logo: "/VenueCore_Logos/VenueCore_Horizontal_Color.png",
    logoWhite: "/VenueCore_Logos/VenueCore_Horizontal_White.png",
    logoIcon: "/VenueCore_Logos/VenueCore_Icon_Color.png",
    logoStacked: "/VenueCore_Logos/VenueCore_Stacked_Color.png",
    logoAlt: "VenueCore",
    favicon: "/favicons/icon_32.ico",
    supportEmail: "support@venuecore.live",
    contactEmail: "contact@venuecore.live",
    privacyEmail: "privacy@venuecore.com",
    tagline: "One Platform. Every Ticket.",
    footerDescription:
      "The all-in-one ticketing and venue management platform built for the people who make live music happen. Venues, promoters, agents, artists — everybody wins.",
    instagramUrl: "https://instagram.com",
    facebookUrl: "https://facebook.com",
    copyright: "VenueCore",
    heroImage: "/hero-images/default/hero.jpg",
    heroImage2: "/hero-images/default/hero2.jpg",
    supportsSubdomains: true,
  },
  west72: {
    slug: "west72",
    name: "West72 Entertainment",
    shortName: "West 72",
    domain: "west72ent.com",
    logo: "/West72_Logos/W72_tech_wordmark_white.png",
    logoWhite: "/West72_Logos/W72_tech_wordmark_white.png",
    logoIcon: "/West72_Logos/W72_tech_icon_white.png",
    logoStacked: "/West72_Logos/W72_tech_wordmark_white.png",
    logoAlt: "West 72 Entertainment",
    favicon: "/favicons/West72/W72_tech_icon_solid_white.ico",
    supportEmail: "support@west72ent.com",
    contactEmail: "contact@west72ent.com",
    privacyEmail: "privacy@west72ent.com",
    tagline: "Creating Memories, One Night at a Time.",
    footerDescription:
      "Discover. Grab. Experience. Live. West 72 makes it easy to find upcoming shows, buy tickets in seconds, and enjoy seamless entry at the door — plus VIP packages and live auctions for the ultimate experience.",
    instagramUrl: "https://instagram.com",
    facebookUrl: "https://facebook.com",
    copyright: "West 72 Entertainment",
    metaPixelId: "708986435149013",
    heroImage: "/hero-images/default/hero.jpg",
    heroImage2: "/hero-images/default/hero2.jpg",
    supportsSubdomains: false,
  },
};

export const DEFAULT_OPERATOR = OPERATORS.venuecore;

export function getOperator(slug: string): OperatorConfig {
  return OPERATORS[slug] ?? DEFAULT_OPERATOR;
}

/**
 * Maps root hostnames to their operator slug.
 * Used by middleware to detect which operator is serving the request.
 */
export const OPERATOR_DOMAIN_MAP: Record<string, string> = {
  "venuecore.live": "venuecore",
  "west72ent.com": "west72",
};
