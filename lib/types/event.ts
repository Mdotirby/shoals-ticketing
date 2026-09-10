export type EventType =
  | "hard_ticket"
  | "ticketed"
  | "co_promote"
  | "rental_box_office"
  | "non_ticketed"
  | "private";

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
