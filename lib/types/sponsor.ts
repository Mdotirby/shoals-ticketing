export type SponsorTier = "title" | "presenting" | "supporting";

export type Sponsor = {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  tier: SponsorTier;
  event_id: string | null;
  bio: string | null;
  display_on_homepage: boolean;
  is_active: boolean;
  contact_name: string | null;
  contact_email: string | null;
  created_at: string;
};

export type SponsorPackage = {
  id: string;
  sponsor_id: string;
  venue_id: string | null;
  name: string;
  description: string | null;
  deliverables: string[];
  price: number;
  term: "Annual" | "Per Event" | "One-Time" | "Monthly" | "Custom";
  start_date: string | null;
  end_date: string | null;
  status: "active" | "pending" | "expired" | "cancelled";
  notes: string | null;
  created_at: string;
};
