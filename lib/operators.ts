/**
 * Operator Config
 * ---------------
 * Defines branding and contact info for each operator domain.
 * VenueCore is the platform; West72 is a licensee with its own domain.
 * Add new operators here as needed — one entry per root domain.
 *
 * ── Storefront mount change (2026-09-05) ────────────────────────────────
 * This file is ADDITIVE against main. Nothing was removed or repointed, so
 * every existing `operator.logo` / `operator.logoIcon` / `operator.logoStacked`
 * call site keeps the exact asset it resolves to today.
 *
 * What was added: `logoIconWhite` and `logoStackedWhite`, plus `logoFor()`.
 * The reason is a real bug on venuecore.live — the header renders the icon
 * mark on a dark translucent glass pill, but `logoIcon` for venuecore is
 * `VenueCore_Icon_Color.png`, the navy-on-transparent cut. It reads muddy
 * there, the same way the full-colour horizontal did before `logoWhite`
 * was introduced for it. West72 already only had white cuts wired up, so
 * `logoFor()` returns the same file it does now for that brand — the fix
 * lands on VenueCore and is a no-op for West 72.
 *
 * One non-branding fix: privacyEmail for venuecore was privacy@venuecore.com,
 * a domain this operator does not serve (see `domain` two fields up).
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
  /** Icon-only white cut — the mobile storefront header and any other dark
   *  translucent surface. Prefer resolving via logoFor(op, "icon", glass). */
  logoIconWhite: string;
  /** Stacked logo — used on auth/login/splash screens */
  logoStacked: string;
  /** Stacked white cut — login/splash under the liquid-glass theme. */
  logoStackedWhite: string;
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
    logoIconWhite: "/VenueCore_Logos/VenueCore_Icon_White.png",
    logoStacked: "/VenueCore_Logos/VenueCore_Stacked_Color.png",
    logoStackedWhite: "/VenueCore_Logos/VenueCore_Stacked_White.png",
    logoAlt: "VenueCore",
    favicon: "/favicons/icon_32.ico",
    supportEmail: "support@venuecore.live",
    contactEmail: "contact@venuecore.live",
    privacyEmail: "privacy@venuecore.live",
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
    logoIconWhite: "/West72_Logos/W72_tech_icon_white.png",
    // The stacked slot pointed at the wordmark. W72_tech_lockup_white.png is
    // the real stacked lockup and is already in /public/West72_Logos.
    logoStacked: "/West72_Logos/W72_tech_lockup_white.png",
    logoStackedWhite: "/West72_Logos/W72_tech_lockup_white.png",
    logoAlt: "West 72 Entertainment",
    favicon: "/favicons/West72/W72_tech_icon_solid_black.ico",
    supportEmail: "support@west72ent.com",
    contactEmail: "contact@west72ent.com",
    privacyEmail: "privacy@west72ent.com",
    tagline: "Creating Memories, One Night at a Time.",
    footerDescription:
      "Discover. Experience. Live. West 72 makes it easy to find upcoming shows, buy tickets in seconds, and enjoy seamless entry at the door — plus VIP packages and live auctions for the ultimate experience.",
    instagramUrl: "https://instagram.com",
    facebookUrl: "https://facebook.com",
    copyright: "West 72 Entertainment",
    metaPixelId: "708986435149013",
    heroImage: "/hero-images/west72/hero.jpg",
    heroImage2: "/hero-images/west72/hero2.jpg",
    supportsSubdomains: false,
  },
};

export const DEFAULT_OPERATOR = OPERATORS.venuecore;

export function getOperator(slug: string): OperatorConfig {
  return OPERATORS[slug] ?? DEFAULT_OPERATOR;
}

/**
 * Resolve the right cut of an operator's mark for the surface it sits on.
 *
 * `glass` means "this mark is going on a dark translucent panel" — which is
 * every storefront chrome surface under data-theme="liquid-glass". Header
 * already did this by hand for the horizontal wordmark
 * (`glass ? operator.logoWhite : operator.logo`); this is that same choice
 * for all three shapes, in one place, so the mobile icon and the login
 * splash stop being the exception.
 */
export type LogoShape = "horizontal" | "icon" | "stacked";

export function logoFor(
  operator: OperatorConfig,
  shape: LogoShape,
  glass: boolean
): string {
  switch (shape) {
    case "icon":
      return glass ? operator.logoIconWhite : operator.logoIcon;
    case "stacked":
      return glass ? operator.logoStackedWhite : operator.logoStacked;
    default:
      return glass ? operator.logoWhite : operator.logo;
  }
}

/**
 * Operators running the black-and-white "liquid glass" theme.
 *
 * The theme is a single opt-in attribute (`data-theme="liquid-glass"` on
 * <body>, set in app/layout.tsx) that every rule in the theme's stylesheet
 * hangs off. Listing operators here rather than hardcoding slugs in CSS
 * means opting one in or out is a one-line change, and an operator that
 * isn't ready keeps its own palette untouched.
 *
 * Both brands run it today. Unknown slugs (custom venue domains, which
 * resolve to the venuecore operator) inherit venuecore's answer.
 */
const LIQUID_GLASS_OPERATORS = new Set(["west72", "venuecore"]);

export function usesLiquidGlass(slug: string): boolean {
  // Resolve first so an unknown slug — a venue's custom domain, which
  // middleware maps to the default operator — gets the same answer as the
  // operator actually serving it, rather than silently falling through.
  return LIQUID_GLASS_OPERATORS.has(getOperator(slug).slug);
}

/**
 * Maps root hostnames to their operator slug.
 * Used by middleware to detect which operator is serving the request.
 */
export const OPERATOR_DOMAIN_MAP: Record<string, string> = {
  "venuecore.live": "venuecore",
  "west72ent.com": "west72",
};
