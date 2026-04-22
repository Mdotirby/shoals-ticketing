import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { updateCampaign } from "@/modules/email-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: campaign }, { data: msg }, { data: metrics }] = await Promise.all([
    admin.from("ee_campaigns")
      .select("*, ee_segments(name, last_count), events(title, date)")
      .eq("id", id).single(),
    admin.from("ee_campaign_messages").select("*").eq("campaign_id", id).maybeSingle(),
    admin.from("ee_campaign_metrics").select("*").eq("campaign_id", id).maybeSingle(),
  ]);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ campaign, message: msg, metrics });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await updateCampaign(createAdminClient(), id, body);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("ee_campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
