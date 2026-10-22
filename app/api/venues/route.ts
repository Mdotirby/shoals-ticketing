import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireStaff, requireCapability } from "@/lib/auth/can";

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

/**
 * POST /api/venues — create a venue (owner only)
 *
 * The comment here has said "owner/super_admin only" since it was written
 * and the code checked nothing at all. middleware.ts skips everything under
 * /api/, and this uses the service-role client that bypasses RLS, so anyone
 * who could reach the server could create a tenant — a venue is a tenant,
 * with its own slug, subdomain and storefront. venue_lifecycle is owner-only
 * (lib/auth/capabilities.ts), which is what the comment always claimed.
 */
export async function POST(request: Request) {
  const guard = await requireCapability("venue_lifecycle", { write: true });
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!name || !slug) {
    return NextResponse.json({ error: "A host needs a name and a slug." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("venues")
    .insert({
      name,
      // Lower-cased on the way in. One row on file is "West72", which works
      // as a subdomain by luck rather than by design.
      slug,
      logo_url: body.logo_url || null,
      // This was being dropped. The Tenants panel has always sent the
      // own/client choice and the insert ignored it, so every host created
      // there landed on the column default whatever was picked.
      account_type: body.account_type === "own" ? "own" : "client",
    })
    .select()
    .single();

  if (error) {
    // The slug is the subdomain and is UNIQUE. Say which field, rather than
    // handing back a constraint name.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `The slug "${slug}" is already taken by another host.` },
        { status: 409 },
      );
    }
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
