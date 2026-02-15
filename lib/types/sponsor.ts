export type SponsorTier = "title" | "presenting" | "supporting";

export type Sponsor = {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  tier: SponsorTier;
  event_id: string | null;
  created_at: string;
};
