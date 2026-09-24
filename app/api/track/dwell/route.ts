import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * POST /api/track/dwell   { ref, ms }
 *
 * How long someone actually stayed on the page a tracked link sent them to.
 *
 * Views and clicks were already recorded; nothing measured attention. A link
 * can send a thousand people who leave in two seconds and it looks identical
 * to one that sends a hundred who read the whole page — until the conversion
 * numbers come in weeks later and still do not say why.
 *
 * Written as its own `dwell` event rather than on the `view` row, because the
 * view is recorded on arrival and the duration is only known on departure.
 * Updating the earlier row would mean finding it again from a beacon that
 * cannot wait for a response; a separate row costs nothing and keeps the view
 * count honest.
 *
 * PUBLIC BY DESIGN — a visitor is not signed in. It is write-only, records no
 * identity, and accepts nothing that can be read back.
 *
 * Called with navigator.sendBeacon on pagehide, so it must be cheap and must
 * never matter if it is lost.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ref = typeof body?.ref === "string" ? body.ref.trim() : "";
    const ms = Number(body?.ms);

    if (!ref) return NextResponse.json({ tracked: false });

    // A tab left open overnight is not attention. Anything beyond 30 minutes
    // is treated as abandoned and dropped rather than dragging the average up.
    if (!Number.isFinite(ms) || ms < 1000 || ms > 30 * 60 * 1000) {
      return NextResponse.json({ tracked: false });
    }

    const admin = createAdminClient();
    const { data: link } = await admin
      .from("trackable_links")
      .select("id")
      .eq("slug", ref)
      .eq("is_active", true)
      .maybeSingle();

    if (!link) return NextResponse.json({ tracked: false });

    const { error } = await admin.from("trackable_link_events").insert({
      link_id: link.id,
      event_type: "dwell",
      metadata: { ms: Math.round(ms) },
    });

    // Do NOT answer {tracked:true} on a failed insert. The first version did,
    // and a CHECK constraint that rejects 'dwell' looked exactly like success
    // — the endpoint said yes and the table stayed empty.
    if (error) {
      console.error(
        `dwell not recorded for "${ref}": ${error.message}. ` +
          `If this mentions a check constraint, run plans/trackable-link-dwell-migration.sql`,
      );
      return NextResponse.json({ tracked: false });
    }

    return NextResponse.json({ tracked: true });
  } catch {
    // Tracking must never surface an error to a buyer.
    return NextResponse.json({ tracked: false });
  }
}
