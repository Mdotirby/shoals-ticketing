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
  /** Path to the logo image in /public */
  logo: string;
  logoAlt: string;
  /** Path to favicon PNG in /public — used in <head> */
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
};

export const OPERATORS: Record<string, OperatorConfig> = {
  venuecore: {
    slug: "venuecore",
    name: "VenueCore",
    shortName: "VenueCore",
    domain: "venuecore.live",
    logo: "/VenueCore_VenueCore-FullLogo.png",
    logoAlt: "VenueCore Logo",
    favicon: "/favicons/venuecore.ico",
    supportEmail: "support@venuecore.live",
    contactEmail: "contact@venuecore.live",
    privacyEmail: "privacy@venuecore.com",
    tagline: "One Platform. Every Ticket.",
    footerDescription:
      "The all-in-one ticketing and venue management platform built for the people who make live music happen. Venues, promoters, agents, artists — everybody wins.",
    instagramUrl: "https://instagram.com",
    facebookUrl: "https://facebook.com",
    copyright: "VenueCore",
  },
  west72: {
    slug: "west72",
    name: "West72 Entertainment",
    shortName: "West 72",
    domain: "west72ent.com",
    logo: "/logos/West72/logo.png",
    logoAlt: "West 72 Entertainment Logo",
    favicon: "/logos/West72/logo.png",
    supportEmail: "support@west72ent.com",
    contactEmail: "contact@west72ent.com",
    privacyEmail: "privacy@west72ent.com",
    tagline: "Creating Memories, One Night at a Time.",
    footerDescription:
      "Discover. Grab. Experience. Live. West 72 makes it easy to find upcoming shows, buy tickets in seconds, and enjoy seamless entry at the door — plus VIP packages and live auctions for the ultimate experience.",
    instagramUrl: "https://instagram.com",
    facebookUrl: "https://facebook.com",
    copyright: "West 72 Entertainment",
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
