/**
 * Event CLASS — does this show sell through our ticketing?
 *
 * co_promote and rental_box_office were removed here (ADMIN_MERGE_PLAN.md
 * § 9.1): they were never classes, they are deal structures on a show that
 * sells here normally. They live on EventDealType now.
 *
 * external_promotion is the one genuinely new class — a show we promote in
 * another city on someone else's ticketing. No inventory, no scan, no
 * storefront, no Stripe; real marketing spend and a settlement keyed in from
 * their report.
 */
export type EventType =
  | "hard_ticket"
  | "ticketed"
  | "non_ticketed"
  | "private"
  | "external_promotion";

/**
 * Whose money is the show — orthogonal to EventType.
 *
 * NOT the same thing as the DealType in lib/types/offer.ts, which is
 * 'VS' | 'FLAT' | 'PLUS' | 'BONUS' and describes how the ARTIST is paid. Two
 * different axes that both ended up called deal_type; named apart here so a
 * file importing both can tell them apart.
 */
export type EventDealType =
  | "own_risk"
  | "co_promote"
  | "rental_box_office"
  | "guarantee";

export type Event = {
  id: string;
  title: string;
  subtitle?: string;
  venue: string;
  date: string;
  end_time?: string;
  price: number;
  description?: string;
  image_url?: string;
  image_crop_data?: ImageCropData;
  status: "draft" | "published";
  venue_id?: string;
  event_venue_id?: string;
  /**
   * Six values, not four. co_promote and rental_box_office were missing from
   * this union even though app/admin/events/new writes both (explicit branches
   * at lines 405 and 408) — see lib/eventClass.ts. Kept in sync with
   * EVENT_TYPES there.
   *
   * Unrelated to the `event_type` on analytics rows ("view" / "click" /
   * "conversion"), which is a different column on different tables —
   * trackable_link_events and landing-page views. Same name, different domain.
   */
  event_type?: EventType;
  /** Defaults to own_risk. See EventDealType — not offer.ts's DealType. */
  deal_type?: EventDealType;
  /** external_promotion only — the rest of the show lives on someone else's platform. */
  external_city?: string | null;
  external_marketing_spend?: number | null;
  external_settlement_amount?: number | null;
  booking_status?: "confirmed" | "hold" | "cancelled";
  hold_level?: "H1" | "H2" | "H3";
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  capacity?: number;
  notes?: string;
  calendar_color?: string;
  /** SEO-friendly slug for the landing page at /e/[slug] */
  landing_page_slug?: string;
};

export type ImageCropData = {
  x: number;
  y: number;
  width: number;
  height: number;
};
