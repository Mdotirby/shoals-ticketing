import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("events")
    .select("id,title,venue,date,price,image_url,venue_id,description,event_venue_id,event_type,booking_status,contact_name,contact_phone,contact_email,client_name,client_email,client_phone,client_billing_address,client_company,tax_exempt,start_time,end_time,facility_fee_enabled,is_free,on_sale_at")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  return NextResponse.json(data, { status: 200 });
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

  console.log(`PUT /api/events/${id} — updating fields:`, Object.keys(updates));
  if (updates.start_time !== undefined || updates.end_time !== undefined) {
    console.log(`  start_time: ${JSON.stringify(updates.start_time)}, end_time: ${JSON.stringify(updates.end_time)}`);
  }

  const { data, error } = await admin
    .from("events")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

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
