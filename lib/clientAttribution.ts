// Client-side attribution capture/read, shared by every checkout entry
// point. Mirrors the existing vc_tracking_ref pattern (persisted on the
// event/landing page, read back at checkout) so utm_source/medium/campaign
// survive navigation from an emailed link through to order creation —
// see standalone-emails/lib/urls.ts for where these values get attached
// to outbound links, and app/api/webhooks/resend/route.ts's
// attributeRevenue.ts consumer for how they're read back.
"use client";

const KEYS = {
  utmSource: "vc_utm_source",
  utmMedium: "vc_utm_medium",
  utmCampaign: "vc_utm_campaign",
} as const;

/** Call once per page load on any event/landing page — persists UTM params from the URL, if present. */
export function persistUtmParams(searchParams: { get(key: string): string | null }) {
  if (typeof window === "undefined") return;
  const source = searchParams.get("utm_source");
  const medium = searchParams.get("utm_medium");
  const campaign = searchParams.get("utm_campaign");
  if (source) sessionStorage.setItem(KEYS.utmSource, source);
  if (medium) sessionStorage.setItem(KEYS.utmMedium, medium);
  if (campaign) sessionStorage.setItem(KEYS.utmCampaign, campaign);
}

/** Call at checkout time to read back whatever was persisted earlier in the session. */
export function getStoredUtmParams(): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  if (typeof window === "undefined") return {};
  return {
    utm_source: sessionStorage.getItem(KEYS.utmSource) || undefined,
    utm_medium: sessionStorage.getItem(KEYS.utmMedium) || undefined,
    utm_campaign: sessionStorage.getItem(KEYS.utmCampaign) || undefined,
  };
}
