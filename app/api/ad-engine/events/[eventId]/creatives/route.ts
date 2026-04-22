import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { generateCreatives, listCreatives } from "@/modules/ad-engine";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const db = createAdminClient();
  const [creatives, assets, hooks, copy] = await Promise.all([
    listCreatives(eventId),
    db.from("ad_engine_assets").select("id,kind,url,thumbnail_url,tags,energy,context").eq("event_id", eventId),
    db
      .from("ad_engine_hooks")
      .select("id,text,style")
      .or(`event_id.eq.${eventId},event_id.is.null`),
    db
      .from("ad_engine_copy_variants")
      .select("id,body,cta,tone")
      .or(`event_id.eq.${eventId},event_id.is.null`),
  ]);
  return NextResponse.json({
    creatives,
    assets: assets.data ?? [],
    hooks: hooks.data ?? [],
    copy: copy.data ?? [],
  });
}
