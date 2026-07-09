// Standing rule for every standalone-emails template: link to the main
// event page (/events/[id]), never the landing page (/e/[slug]) — even
// when a landing_page_slug exists. Applies to every trigger (announcement,
// on-sale, sponsor highlight, know-before-you-go, etc.) — use this helper
// rather than constructing event URLs inline in a new mapper.
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://west72ent.com";

// utm_campaign is the per-send attribution key (see attributeRevenue.ts) —
// pass `broadcast:<email_sends.id>` for broadcast sends. Omit entirely for
// test sends, which aren't logged/attributed.
//
// presaleCode deep-links a presale code into the event page's "Have a
// presale code?" unlock flow (see app/events/[id]/EventDetailClient.tsx) so
// there's nothing to copy/retype — same pattern as the onboarding email's
// login deep link.
export function buildEventUrl(
  eventId: string,
  utm?: { source: string; campaign: string },
  presaleCode?: string,
): string {
  const url = new URL(`${SITE_ORIGIN}/events/${eventId}`);
  if (utm) {
    url.searchParams.set("utm_source", utm.source);
    url.searchParams.set("utm_medium", "email");
    url.searchParams.set("utm_campaign", utm.campaign);
  }
  if (presaleCode) {
    url.searchParams.set("presale", presaleCode);
  }
  return url.toString();
}
