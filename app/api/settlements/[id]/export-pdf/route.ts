import path from "path";
import { NextResponse } from "next/server";
import { sanitize } from "@/lib/pdf/pdf-header";
import { renderTemplateToPdf } from "@/lib/pdf-templates/render";
import { buildSettlementReportData } from "@/lib/pdf-templates/settlement-report/adapter";
import type { Settlement } from "@/lib/types/settlement";

// Puppeteer needs a real Node process (not the edge runtime), and a cold
// Chromium launch + font load + render can run past the default timeout.
export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/pdf-templates/settlement-report");

type ExpenseInput = { name: string; category: string; actual_amount: number };
type DepositInput = { type: string; amount: number; date?: string; notes?: string };

type ExportPdfBody = {
  settlement: Settlement;
  expenses: ExpenseInput[];
  deposits: DepositInput[];
};

// POST /api/settlements/:id/export-pdf — renders the artist-facing
// settlement PDF from an already-computed Settlement (the same object the
// admin settlement page builds for on-screen display, via
// buildPdfSettlement() in app/admin/settlements/[id]/page.tsx) so the PDF
// always matches what's shown on screen. No new math happens here or in
// the adapter -- see lib/pdf-templates/settlement-report/adapter.ts for
// the field-by-field mapping back to lib/pdf/settlement-pdf.ts's formulas.
//
// Venue-facing export (Export Venue Settlement PDF) is NOT covered by this
// route -- it needs internal P&L fields (bar/concessions revenue,
// venue_net_profit, etc.) this template doesn't have a design for yet, and
// still uses the old client-side jsPDF path.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await params; // not currently needed (settlement arrives fully-built in the body), kept for route-shape consistency with sibling settlement routes

  let body: ExportPdfBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.settlement) {
    return NextResponse.json({ error: "Missing settlement in request body" }, { status: 400 });
  }

  try {
    const data = buildSettlementReportData(body.settlement, body.expenses ?? [], body.deposits ?? []);
    const pdfBuffer = await renderTemplateToPdf(TEMPLATE_DIR, data);

    const eventDateLabel = data.event_date_label;
    const filename = `${sanitize(body.settlement.artist_name ?? "Artist")}-${sanitize(eventDateLabel)}-Artist_Settlement.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[export-pdf] render failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF render failed" },
      { status: 500 }
    );
  }
}
