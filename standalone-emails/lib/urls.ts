// Standing rule for every standalone-emails template: link to the main
// event page (/events/[id]), never the landing page (/e/[slug]) — even
// when a landing_page_slug exists. Applies to every trigger (announcement,
// on-sale, sponsor highlight, know-before-you-go, etc.) — use this helper
// rather than constructing event URLs inline in a new mapper.
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://west72ent.com";

export function buildEventUrl(eventId: string): string {
  return `${SITE_ORIGIN}/events/${eventId}`;
}
