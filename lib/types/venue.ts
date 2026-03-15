export type Venue = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  nickname: string | null;
  capacity: number | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  buyer_name: string | null;
  contract_signatory: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  promoter_address: string | null;
  lessor_name?: string | null;
  lessor_company?: string | null;
  ticketing_fee: number | null;
  facility_fee: number | null;
  tax_rate: number | null;
  venue_rebate: number | null;

  /* ── Branding ── */
  primary_color: string;
  secondary_color: string;
  accent_color?: string;
  favicon_url?: string | null;
  hero_image_url?: string | null;
  hero_image_2_url?: string | null;

  /* ── Contact & Social ── */
  tagline?: string | null;
  footer_description?: string | null;
  support_email?: string | null;
  contact_email?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  website_url?: string | null;

  /* ── Custom Domain ── */
  custom_domain?: string | null;

  /* ── Homepage Content ── */
  homepage_headline?: string | null;
  homepage_subheadline?: string | null;
  homepage_cta_text?: string | null;
  homepage_cta_url?: string | null;

  /* ── About Page Content ── */
  about_headline?: string | null;
  about_description?: string | null;
  about_image_url?: string | null;
  about_features?: Array<{
    title: string;
    description: string;
    icon: string;
  }> | null;

  created_at: string;
};
