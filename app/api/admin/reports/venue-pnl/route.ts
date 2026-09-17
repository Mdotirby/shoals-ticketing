import path from "path";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { buildVenuePnl } from "@/lib/reports/venue-pnl";
import { buildVenuePnlData } from "@/lib/xlsx-templates/venue-pnl/adapter";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { sanitize } from "@/lib/pdf/pdf-header";

export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/venue-pnl");

/**
 * Venue P&L Report API
 *
 * Every show at an event venue over a date range: revenue from the
 * settlement ledger, expenses from each show's settlement, netted per show
 * and rolled into a P&L summary.
 *
 * Query params:
 *   ?event_venue_id=UUID   — one room (required for xlsx)
 *   ?venue_id=UUID         — limit to one operator account
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   ?format=xlsx           — the branded workbook; JSON otherwise
 *
 * Without event_venue_id the JSON response carries every venue in range,
 * each with its own shows and totals, so the page can render them grouped.
 */
export async function GET(request: Request) {
  const guard = await requireCapability("export_ledger");
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventVenueId = searchParams.get("event_venue_id");
  const venueId = searchParams.get("venue_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const format = searchParams.get("format");

  try {
    const venues = await buildVenuePnl(admin, { eventVenueId, venueId, from, to });

    if (format !== "xlsx") {
      return NextResponse.json({
        // Echoed so the page's per-venue Export button asks for the same
        // window the preview was built from.
        from,
        to,
        venues,
        // Handy for a header line without the caller re-summing everything.
        grand_total: venues.reduce(
          (acc, v) => ({
            shows: acc.shows + v.shows.length,
            revenue: Math.round((acc.revenue + v.totals.revenue_total) * 100) / 100,
            expenses: Math.round((acc.expenses + v.totals.expenses_total) * 100) / 100,
            net: Math.round((acc.net + v.totals.net) * 100) / 100,
          }),
          { shows: 0, revenue: 0, expenses: 0, net: 0 }
        ),
      });
    }

    // One workbook is one venue — the template's header block names a single
    // room, and a P&L that silently concatenated venues would total rooms
    // that have nothing to do with each other.
    if (venues.length === 0) {
      return NextResponse.json({ error: "No shows found for those filters" }, { status: 404 });
    }
    if (venues.length > 1) {
      return NextResponse.json(
        {
          error:
            "More than one venue matched. Pass event_venue_id to export a single venue's P&L.",
          venues: venues.map((v) => ({ id: v.event_venue_id, name: v.event_venue_name, shows: v.shows.length })),
        },
        { status: 400 }
      );
    }

    const venue = venues[0];
    const data = buildVenuePnlData(venue, { from, to });
    const buffer = await renderXlsxTemplate(TEMPLATE_DIR, data as unknown as Record<string, unknown>);

    const filename = `${sanitize(venue.event_venue_name)}-P-and-L-${(from ?? "start").slice(0, 10)}-to-${(
      to ?? "today"
    ).slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[venue-pnl] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Venue P&L failed" },
      { status: 500 }
    );
  }
}
