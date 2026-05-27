import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── GET — return full presale config (admin use) ─────────────────────────────
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("event_presales")
      .select("type, enabled, code, starts_at, ends_at, capacity")
      .eq("event_id", id);

    if (error) {
      return NextResponse.json({ artist: null, venue: null }, { status: 200 });
    }

    const artist = data?.find((r) => r.type === "artist") ?? null;
    const venue = data?.find((r) => r.type === "venue") ?? null;

    return NextResponse.json({ artist, venue }, { status: 200 });
  } catch {
    return NextResponse.json({ artist: null, venue: null }, { status: 200 });
  }
}

// ── PUT — upsert both presale rows ───────────────────────────────────────────
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  let body: {
    artist?: { enabled: boolean; code: string; starts_at: string; ends_at: string; capacity: string };
    venue?: { enabled: boolean; code: string; starts_at: string; ends_at: string; capacity: string };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows = [];

  for (const type of ["artist", "venue"] as const) {
    const cfg = body[type];
    if (!cfg) continue;

    // Validate code length
    if (cfg.code && cfg.code.length > 15) {
      return NextResponse.json(
        { error: `${type} presale code must be 15 characters or fewer` },
        { status: 400 }
      );
    }

    rows.push({
      event_id: id,
      type,
      enabled: cfg.enabled ?? false,
      code: cfg.code ? cfg.code.toUpperCase().trim() : null,
      starts_at: cfg.starts_at || null,
      ends_at: cfg.ends_at || null,
      capacity: cfg.capacity ? parseInt(cfg.capacity, 10) || null : null,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { error } = await admin
    .from("event_presales")
    .upsert(rows, { onConflict: "event_id,type" });

  if (error) {
    console.error("presale PUT error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
