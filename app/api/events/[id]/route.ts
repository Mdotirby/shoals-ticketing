import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Try with closed_out_at (closeout migration); fall back without it.
  let { data, error } = await admin
    .from("events")
    .select("id,title,venue,date,price,image_url,venue_id,description,event_venue_id,event_type,booking_status,contact_name,contact_phone,contact_email,client_name,client_email,client_phone,client_billing_address,client_company,tax_exempt,start_time,end_time,facility_fee_enabled,is_free,on_sale_at,landing_page_slug,closed_out_at,closed_out_note,external_ticket_url,external_ticket_label,meta_pixel_id,tax_method,spotify_url,spotify_monthly_listeners,spotify_featured_track")
    .eq("id", id)
    .single();
  if (error && /closed_out_(at|note)|external_ticket|meta_pixel_id|tax_method|spotify_url|spotify_monthly_listeners|spotify_featured_track|column .* does not exist/i.test(error.message)) {
    const retry = await admin
      .from("events")
      .select("id,title,venue,date,price,image_url,venue_id,description,event_venue_id,event_type,booking_status,contact_name,contact_phone,contact_email,client_name,client_email,client_phone,client_billing_address,client_company,tax_exempt,start_time,end_time,facility_fee_enabled,is_free,on_sale_at,landing_page_slug")
      .eq("id", id)
      .single();
    data = retry.data ? { ...retry.data, closed_out_at: null, closed_out_note: null, external_ticket_url: null, external_ticket_label: null, meta_pixel_id: null, tax_method: null, spotify_url: null, spotify_monthly_listeners: null, spotify_featured_track: null } : null;
    error = retry.error;
  }

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  // Append presale availability flag (no codes exposed)
  let presaleAvailable = false;
  try {
    const now = new Date().toISOString();
    const { data: presaleRows } = await admin
      .from("event_presales")
      .select("enabled, starts_at, ends_at")
      .eq("event_id", id)
      .eq("enabled", true);

    if (presaleRows && presaleRows.length > 0) {
      presaleAvailable = presaleRows.some((row) => {
        if (row.starts_at && row.starts_at > now) return false;
        if (row.ends_at && row.ends_at < now) return false;
        return true;
      });
    }
  } catch {
    // Non-fatal — table may not exist yet before migration runs
  }

  return NextResponse.json({ ...data, presaleAvailable }, { status: 200 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  // Only include fields that were actually sent to avoid wiping unrelated columns
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.venue !== undefined) updates.venue = body.venue;
  if (body.date !== undefined) updates.date = body.date;
  if (body.price !== undefined) updates.price = body.price;
  if (body.ticketing_fee !== undefined) updates.ticketing_fee = body.ticketing_fee;
  if (body.venue_rebate !== undefined) updates.venue_rebate = body.venue_rebate;
  if (body.description !== undefined) updates.description = body.description;
  if (body.image_url !== undefined) updates.image_url = body.image_url;
  if (body.status !== undefined) updates.status = body.status;
  if (body.event_venue_id !== undefined) updates.event_venue_id = body.event_venue_id;
  if (body.event_type !== undefined) updates.event_type = body.event_type;
  if (body.booking_status !== undefined) updates.booking_status = body.booking_status;
  if (body.contact_name !== undefined) updates.contact_name = body.contact_name;
  if (body.contact_phone !== undefined) updates.contact_phone = body.contact_phone;
  if (body.contact_email !== undefined) updates.contact_email = body.contact_email;
  if (body.client_name !== undefined) updates.client_name = body.client_name;
  if (body.client_email !== undefined) updates.client_email = body.client_email;
  if (body.client_phone !== undefined) updates.client_phone = body.client_phone;
  if (body.client_billing_address !== undefined) updates.client_billing_address = body.client_billing_address;
  if (body.client_company !== undefined) updates.client_company = body.client_company;
  if (body.tax_exempt !== undefined) updates.tax_exempt = body.tax_exempt;
  if (body.start_time !== undefined) updates.start_time = body.start_time;
  if (body.end_time !== undefined) updates.end_time = body.end_time;
  if (body.facility_fee_enabled !== undefined) updates.facility_fee_enabled = body.facility_fee_enabled;
  if (body.venue_id !== undefined) updates.venue_id = body.venue_id;
  if (body.is_free !== undefined) updates.is_free = body.is_free;
  if (body.on_sale_at !== undefined) updates.on_sale_at = body.on_sale_at;
  if (body.landing_page_slug !== undefined) updates.landing_page_slug = body.landing_page_slug;
  if (body.external_ticket_url !== undefined) updates.external_ticket_url = body.external_ticket_url || null;
  if (body.external_ticket_label !== undefined) updates.external_ticket_label = body.external_ticket_label || null;
  if (body.meta_pixel_id !== undefined) updates.meta_pixel_id = body.meta_pixel_id || null;
  if (body.tax_method !== undefined) updates.tax_method = body.tax_method || null;
  if (body.spotify_url !== undefined) updates.spotify_url = body.spotify_url || null;
  if (body.spotify_monthly_listeners !== undefined) updates.spotify_monthly_listeners = body.spotify_monthly_listeners || null;
  if (body.spotify_featured_track !== undefined) updates.spotify_featured_track = body.spotify_featured_track || null;

  console.log(`PUT /api/events/${id} — updating fields:`, Object.keys(updates));
  if (updates.start_time !== undefined || updates.end_time !== undefined) {
    console.log(`  start_time: ${JSON.stringify(updates.start_time)}, end_time: ${JSON.stringify(updates.end_time)}`);
  }

  let { data, error } = await admin
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  // If the update itself failed due to unknown columns, retry without the new optional columns
  if (error && /spotify_url|spotify_monthly_listeners|spotify_featured_track|column .* does not exist/i.test(error.message)) {
    delete updates.spotify_url;
    delete updates.spotify_monthly_listeners;
    delete updates.spotify_featured_track;
    const retry = await admin.from("events").update(updates).eq("id", id).select().single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error(`PUT /api/events/${id} — error:`, error.message, error.code, error.details);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  console.log(`PUT /api/events/${id} — success, start_time=${data?.start_time}, end_time=${data?.end_time}`);
  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("events")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
