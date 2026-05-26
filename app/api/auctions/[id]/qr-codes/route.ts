import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");
import jsPDF from "jspdf";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/auctions/[id]/qr-codes — generate printable PDF of all item QR codes
export async function GET(request: Request, context: RouteContext) {
  const host = request.headers.get("host") || "";
  const BASE_URL = host
    ? `https://${host}`
    : (process.env.NEXT_PUBLIC_BASE_URL || "https://venuecore.live");
  const { id: auctionId } = await context.params;
  const supabase = createAdminClient();

  // Fetch auction
  const { data: auction } = await supabase
    .from("auctions")
    .select("name")
    .eq("id", auctionId)
    .single();

  if (!auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  // Fetch all items
  const { data: items } = await supabase
    .from("auction_items")
    .select("id, name, starting_bid, qr_code")
    .eq("auction_id", auctionId)
    .order("sort_order", { ascending: true });

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "No items found" }, { status: 404 });
  }

  // Generate PDF — 2 cards per page (portrait, large QR codes for easy scanning)
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = 215.9; // letter width in mm
  const pageHeight = 279.4;
  const cardsPerPage = 2;
  const cardHeight = pageHeight / cardsPerPage;

  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % cardsPerPage === 0) {
      doc.addPage();
    }

    const item = items[i];
    const cardIndex = i % cardsPerPage;
    const yOffset = cardIndex * cardHeight;

    // Card border (dashed line between cards)
    if (cardIndex > 0) {
      doc.setDrawColor(180, 180, 180);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(10, yOffset, pageWidth - 10, yOffset);
      doc.setLineDashPattern([], 0);
    }

    const centerX = pageWidth / 2;

    // ── Top: Auction Name ──
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(auction.name, centerX, yOffset + 15, { align: "center" });

    // ── Item Name ──
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(item.name, centerX, yOffset + 25, { align: "center" });

    // ── Starting Bid ──
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Starting Bid: $${parseFloat(item.starting_bid).toFixed(2)}`,
      centerX,
      yOffset + 33,
      { align: "center" }
    );

    // ── QR Code ──
    const itemUrl = `${BASE_URL}/auction/${auctionId}/items/${item.id}`;
    const qrDataUrl = await QRCode.toDataURL(itemUrl, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const qrSize = 70; // mm
    doc.addImage(qrDataUrl, "PNG", centerX - qrSize / 2, yOffset + 38, qrSize, qrSize);

    // ── Scan message below QR ──
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Use your phone to scan the code and place your bid",
      centerX,
      yOffset + 38 + qrSize + 8,
      { align: "center" }
    );

    // ── Powered by VenueCore at bottom ──
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(140, 140, 140);
    doc.text("Powered by VenueCore", centerX, yOffset + cardHeight - 10, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="auction-qr-codes-${auctionId}.pdf"`,
    },
  });
}
