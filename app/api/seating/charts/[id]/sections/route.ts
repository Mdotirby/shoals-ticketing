import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/** GET /api/seating/charts/[id]/sections — list sections for a chart */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("seating_sections")
    .select("*")
    .eq("chart_id", id)
    .order("section_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

/** POST /api/seating/charts/[id]/sections — add a section */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const { section_name, color, price_tier, row_count, seats_per_row } = body;

  if (!section_name) {
    return NextResponse.json({ error: "section_name is required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("seating_sections")
    .insert({
      chart_id: id,
      section_name,
      color: color || "#6366f1",
      price_tier: price_tier ?? 0,
      row_count: row_count ?? 0,
      seat_count: (row_count ?? 0) * (seats_per_row ?? 0),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update chart total_sections count
  const { data: sections } = await admin
    .from("seating_sections")
    .select("id")
    .eq("chart_id", id);

  await admin
    .from("seating_charts")
    .update({ total_sections: sections?.length ?? 0 })
    .eq("id", id);

  return NextResponse.json(data, { status: 201 });
}
