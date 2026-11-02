import { OPERATORS } from "@/lib/operators";
import { WEST72_HOST_VENUE_ID } from "@/lib/west72-featured";

/**
 * Which site may this staff member work on?
 *
 * Every venue is a separate operator with its own address, and staff belong to
 * exactly one. Owners are exempt and are never passed through this. Everyone
 * else works only on their venue's site:
 *
 *   rcht.venuecore.live → staff whose admin_users.venue_id is that venue
 *   west72ent.com       → West 72's staff (it behaves like a venue subdomain)
 *   venuecore.live      → nobody but owners; it is the platform, not a venue
 *
 * This answers "right site?", NOT "right data?" — lib/auth/tenant.ts still
 * decides which rows a request may see. A staff member with no venue has no
 * site at all and is refused everywhere; assign them one.
 */

export type StaffVenue = {
  id: string;
  slug: string | null;
  custom_domain: string | null;
};

/** The venue that a root operator domain belongs to, for operators run like a venue. */
const ROOT_DOMAIN_VENUE: Record<string, string> = {
  [OPERATORS.west72.domain]: WEST72_HOST_VENUE_ID,
};

function normalize(host: string | null | undefined): string {
  const bare = (host ?? "").trim().toLowerCase().split(":")[0];
  return bare.startsWith("www.") ? bare.slice(4) : bare;
}

/** Local dev and Vercel previews have no venue address to check against. */
function isDevHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")) return true;
  return hostname.endsWith(".vercel.app") && process.env.VERCEL_ENV !== "production";
}

export function staffMayUseHost(host: string | null | undefined, venue: StaffVenue | null): boolean {
  const hostname = normalize(host);
  if (isDevHost(hostname)) return true;
  if (!venue || !hostname) return false;

  if (hostname in ROOT_DOMAIN_VENUE) return ROOT_DOMAIN_VENUE[hostname] === venue.id;
  if (normalize(venue.custom_domain) === hostname) return true;

  const slug = venue.slug?.trim().toLowerCase();
  if (!slug) return false;
  return Object.values(OPERATORS).some(
    (op) => op.supportsSubdomains && hostname === `${slug}.${op.domain}`
  );
}

/** Where this venue's staff sign in. Null when the venue has no usable address. */
export function staffHomeUrl(venue: StaffVenue | null): string | null {
  if (!venue) return null;

  const rootDomain = Object.keys(ROOT_DOMAIN_VENUE).find((d) => ROOT_DOMAIN_VENUE[d] === venue.id);
  if (rootDomain) return `https://${rootDomain}`;

  const custom = normalize(venue.custom_domain);
  if (custom) return `https://${custom}`;

  const slug = venue.slug?.trim().toLowerCase();
  return slug ? `https://${slug}.${OPERATORS.venuecore.domain}` : null;
}
