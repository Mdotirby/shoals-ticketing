export type ArtistOffer = {
  id: string;
  artist_name: string;
  venue?: string;
  event_date?: string;
  guarantee?: number;
  door_split?: string; // e.g. '80/20'
  merch_split?: string; // e.g. '85/15'
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  terms?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};
