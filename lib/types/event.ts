export type Event = {
  id: string;
  title: string;
  venue: string;
  date: string;
  end_time?: string;
  price: number;
  description?: string;
  image_url?: string;
  image_crop_data?: ImageCropData;
  status: "draft" | "published";
  venue_id?: string;
  event_type?: "hard_ticket" | "ticketed" | "non_ticketed" | "private";
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
