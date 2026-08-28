import path from "path";
import { NextResponse } from "next/server";
import { sanitize } from "@/lib/pdf/pdf-header";
import { createAdminClient } from "@/lib/supabase-server";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { buildArtistSettlementData } from "@/lib/xlsx-templates/artist-settlement/adapter";
import type { Settlement } from "@/lib/types/settlement";
import type { ArtistOffer } from "@/lib/types/offer";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/artist-settlement");

type ExpenseInput = { name: string; category: string; actual_amount: number };

type ExportXlsxBody = {
  settlement: Settlement;
  expenses: ExpenseInput[];
};

// POST /api/settlements/:id/export-xlsx — renders the locked, artist-facing
// settlement workbook. Same source-of-truth rule as export-pdf: no new
// settlement math happens here or in the adapter, only field placement --
// see lib/xlsx-templates/artist-settlement/adapter.ts for exactly which
// already-computed Settlement fields land in which cell.
//
// Header/deal-terms context (venue address, agent, agency, lineup, deposit
// terms, etc.) is looked up live from the linked Offer via settlement.offer_id
// -- confirmed with Matt rather than snapshotting it onto Settlement. Comes
// back blank for settlements with no linked offer (external/manual entries).
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

    const data = buildArtistSettlementData(body.settlement, body.expenses ?? [], offer);
    const xlsxBuffer = await renderXlsxTemplate(TEMPLATE_DIR, data as unknown as Record<string, unknown>);

    const filename = `${sanitize(body.settlement.artist_name ?? "Artist")}-${sanitize(data.event_date_label)}-Artist_Settlement.xlsx`;

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[export-xlsx] render failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "XLSX render failed" },
      { status: 500 }
    );
  }
}
