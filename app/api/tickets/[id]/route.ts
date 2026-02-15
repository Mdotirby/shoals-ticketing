import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: fetch ticket by QR code (the [id] param IS the qr_code)
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

  return NextResponse.json(data);
}
