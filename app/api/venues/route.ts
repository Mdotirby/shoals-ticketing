import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";

/**
 * The fields a storefront legitimately needs: branding, copy, links. Anything
 * that describes the BUSINESS rather than the page stays server-side.
 *
 * This route returned `select("*")` to anyone. On a platform where venues run
 * on their own subdomains that meant publishing the tenant list along with
 * each one's commercial terms — ticketing_fee, venue_rebate, facility_fee,
 * tax_rate — and their buyer_name, buyer_phone, buyer_email,
 * contract_signatory, promoter_address, lessor_company and ad pixel ids.
 * A competitor could read the customer list and what each one is charged.
 */
const PUBLIC_VENUE_FIELDS = [
  "id", "name", "slug", "nickname", "logo_url", "favicon_url",
  "hero_image_url", "hero_image_2_url", "about_image_url",
  "primary_color", "secondary_color", "accent_color",
  "tagline", "footer_description", "homepage_headline", "homepage_subheadline",
  "homepage_cta_text", "homepage_cta_url", "about_headline", "about_description",
  "about_features", "instagram_url", "facebook_url", "contact_email",
  "support_email", "custom_domain", "auction_enabled", "capacity",
  "address_street", "address_city", "address_state", "address_zip",
].join(", ");

// GET /api/venues — list all venues, or resolve a slug
// ?slug=renshoals → returns single venue matching slug
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  // Staff get the whole row; everyone else gets the presentation fields.
  const isStaff = (await requireStaff()).ok;
  const columns = isStaff ? "*" : PUBLIC_VENUE_FIELDS;

  if (slug) {
    const { data, error } = await admin
      .from("venues")
      .select(columns)
      .eq("slug", slug)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  const { data, error } = await admin
    .from("venues")
    .select(columns)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/venues — create a venue (owner/super_admin only)
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("venues")
    .insert({
      name: body.name,
      slug: body.slug,
      logo_url: body.logo_url || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT /api/venues — update a venue's settings
export async function PUT(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("venues")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
