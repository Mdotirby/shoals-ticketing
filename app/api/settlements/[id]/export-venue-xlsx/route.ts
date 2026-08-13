import path from "path";
import { NextResponse } from "next/server";
import { sanitize } from "@/lib/pdf/pdf-header";
import { createAdminClient } from "@/lib/supabase-server";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { buildVenueSettlementData } from "@/lib/xlsx-templates/venue-settlement/adapter";
import type { Settlement } from "@/lib/types/settlement";
import type { ArtistOffer } from "@/lib/types/offer";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/venue-settlement");

type ExpenseInput = { name: string; category: string; actual_amount: number };

type ExportXlsxBody = {
  settlement: Settlement;
  expenses: ExpenseInput[];
};

// POST /api/settlements/:id/export-venue-xlsx — internal, venue-facing
// settlement workbook (adds the REVENUE/P&L section on top of everything
// export-xlsx renders). Same rules as that route: no new settlement math
// here, and header context comes from the linked Offer looked up live via
// offer_id -- see lib/xlsx-templates/venue-settlement/adapter.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;

  let body: ExportXlsxBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.settlement) {
    return NextResponse.json({ error: "Missing settlement in request body" }, { status: 400 });
  }

  try {
    let offer: ArtistOffer | null = null;
    if (body.settlement.offer_id) {
      const admin = createAdminClient();
      const { data: offerRow } = await admin
        .from("artist_offers")
        .select("*")
        .eq("id", body.settlement.offer_id)
        .single();
      offer = (offerRow as ArtistOffer) ?? null;
    }

    const data = buildVenueSettlementData(body.settlement, body.expenses ?? [], offer);
    const xlsxBuffer = await renderXlsxTemplate(TEMPLATE_DIR, data as unknown as Record<string, unknown>);

    const filename = `${sanitize(body.settlement.artist_name ?? "Artist")}-${sanitize(data.event_date_label)}-Venue_Settlement.xlsx`;

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[export-venue-xlsx] render failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "XLSX render failed" },
      { status: 500 }
    );
  }
}
