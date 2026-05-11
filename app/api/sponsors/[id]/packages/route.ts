import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// GET: list packages for a sponsor
export async function GET(_req: Request, { params }: Params) {
  const { id: sponsorId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("sponsor_packages")
    .select("*")
    .eq("sponsor_id", sponsorId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST: create a package for a sponsor
export async function POST(req: Request, { params }: Params) {
  const { id: sponsorId } = await params;
  const admin = createAdminClient();
  const body = await req.json();

  const { data, error } = await admin
    .from("sponsor_packages")
    .insert({
      sponsor_id: sponsorId,
      venue_id: body.venue_id || null,
      name: body.name,
      description: body.description || null,
      deliverables: body.deliverables || [],
      price: body.price || 0,
      term: body.term || "Annual",
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      status: body.status || "active",
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
