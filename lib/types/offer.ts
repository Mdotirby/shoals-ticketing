export type ArtistOffer = {
  id: string;
  artist_name: string;
  venue?: string;
  event_date?: string;
  guarantee?: number;
  deal_type?: "VS" | "FLAT" | "PLUS" | "BONUS";
  backend_percentage?: string; // e.g. "80%"
  merch_soft?: string; // e.g. "85/15"
  merch_hard?: string; // e.g. "80/20"
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  terms?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};
