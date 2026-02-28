import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: fetch ticket by QR code (the [id] param IS the qr_code)
// Also returns sibling tickets from the same order for carousel view
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tickets")
    .select("*, events!inner(title, venue, date)")
    .eq("qr_code", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Ticket not found" },
      { status: 404 }
    );
  }

  // Fetch sibling tickets from the same order
  let siblings: typeof data[] = [];
  if (data.order_id) {
    const { data: allTickets } = await admin
      .from("tickets")
      .select("id, qr_code, qr_data_url, customer_name, customer_email, is_scanned")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: true });
    siblings = allTickets || [];
  }

  return NextResponse.json({ ...data, siblings });
}
