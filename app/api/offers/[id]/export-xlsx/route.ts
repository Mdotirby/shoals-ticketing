import path from "path";
import { NextResponse } from "next/server";
import { sanitize } from "@/lib/pdf/pdf-header";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { buildOfferData } from "@/lib/xlsx-templates/offer/adapter";
import type { ArtistOffer } from "@/lib/types/offer";
import { requireStaff } from "@/lib/auth/can";
import { AGENT_COPY_CUT } from "@/lib/offers/agentEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/offer");

type ExportXlsxBody = { offer: ArtistOffer };

// POST /api/offers/:id/export-xlsx — renders the locked offer workbook
// straight from the ArtistOffer record (no external lookup needed, unlike
// the settlement exports -- an Offer export IS this record). See
// lib/xlsx-templates/offer/adapter.ts for exactly which already-computed
// fields land in which cell.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The workbook carries the venue's own numbers. It answered anyone.
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  await params;
  // ?copy=agent: the copy that goes to the agent -- cut before the venue's block.
  const agentCopy = new URL(request.url).searchParams.get("copy") === "agent";

  let body: ExportXlsxBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.offer) {
    return NextResponse.json({ error: "Missing offer in request body" }, { status: 400 });
  }

  try {
    const data = buildOfferData(body.offer);
    const xlsxBuffer = await renderXlsxTemplate(
      TEMPLATE_DIR,
      data as unknown as Record<string, unknown>,
      agentCopy ? { cutFromLabel: AGENT_COPY_CUT } : {},
    );

    const filename = `${sanitize(body.offer.artist_name ?? "Artist")}-${sanitize(data.event_date_label)}-Offer.xlsx`;

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
