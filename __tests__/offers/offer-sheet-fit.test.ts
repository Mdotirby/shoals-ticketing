import path from "path";
import ExcelJS from "exceljs";
import { buildOfferData } from "@/lib/xlsx-templates/offer/adapter";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { agentEmailHtml, otherTerms, ticketLines } from "@/lib/offers/agentEmail";
import { tierAllInPrice } from "@/lib/offers/cardExpense";
import { OPERATORS } from "@/lib/operators";
import type { ArtistOffer } from "@/lib/types/offer";

/** Cigarettes @ Sunset with the long terms that were being cut off. */
const OFFER = {
  artist_name: "Cigarettes @ Sunset",
  venue: "Singin' River Brewing Co.",
  event_date: "2027-04-16",
  deal_type: "DOOR",
  guarantee: 0,
  backend_percentage: "75",
  tax_rate: 0.095,
  tax_method: "multiplier",
  num_shows: 1,
  show_time: "20:45",
  show_length: "90",
  show_lineup: [
    { time: "20:00", artist: "Local talent", set_length: "30" },
    { time: "20:45", artist: "Cigarettes @ Sunset", set_length: "90" },
  ],
  merch_split: "90/10 Soft, 100 Hard | Sells: Artist, venue provides a table and two chairs",
  notes: "Venue to cover 3 Hotel Rooms (Pending Availability), Catering and Hospitality",
  ticket_scaling: [
    { name: "General Admission", seats: 750, comps: 30, kills: 0, sellable_cap: 720, price: 33.5, net_price: 27.5, facility_fee: 3, ticketing_fee: 3, artist_fac: 1 },
  ],
  fixed_expenses: [{ name: "Support", amount: 1000, off_top: true }],
  total_fixed: 1000,
  variable_expenses: [],
} as unknown as ArtistOffer;

async function sheet() {
  const buf = await renderXlsxTemplate(path.join(process.cwd(), "lib/xlsx-templates/offer"), buildOfferData(OFFER) as unknown as Record<string, unknown>);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.getWorksheet("OFFER")!;
}

describe("the offer sheet fits its text", () => {
  it("gives the deal type and merch room to breathe", async () => {
    const ws = await sheet();
    const merges = ws.model.merges || [];
    expect(merges).toContain("B18:D18");
    expect(merges).toContain("F20:L20");
  });

  it("grows a row whose text needs more than one line", async () => {
    const ws = await sheet();
    // Other terms (78 characters) in B22:D22 is three lines, not the two the template allows.
    expect(ws.getCell("B22").value).toBe(OFFER.notes);
    expect(ws.getRow(22).height).toBeGreaterThan(29.65);
  });

  it("leaves a row alone when its text already fits", async () => {
    const ws = await sheet();
    expect(ws.getRow(8).height).toBeCloseTo(19.7, 1);
  });

  it("prints the show the way people read it", async () => {
    const ws = await sheet();
    expect(ws.getCell("I10").value).toBe("8:45 PM");
    expect(ws.getCell("I9").value).toBe("1 show × 90 min");
    expect(ws.getCell("B12").value).toBe("8:00 PM — Local talent (30 min)");
    expect(ws.getCell("B13").value).toBe("8:45 PM — Cigarettes @ Sunset (90 min)");
  });
});

describe("the all-in price", () => {
  it("is what the buyer pays: face, fees, tax and card", () => {
    // 27.50 + 6.00 + 2.61 tax = 36.11, + 1.39 card
    expect(tierAllInPrice(OFFER.ticket_scaling![0], { taxMethod: "multiplier", taxRate: 0.095 })).toBe(37.5);
  });

  it("matches the offer sheet's ALL-IN column", () => {
    const d = buildOfferData(OFFER);
    expect(d.ticket_scaling[0].allin_price).toBeCloseTo(37.5, 2);
  });

  it("is what the email quotes", () => {
    expect(ticketLines(OFFER)).toEqual(["General Admission $27.50 ($37.50 with fees)"]);
  });
});

describe("other terms", () => {
  it("falls back to the notes they were typed into", () => {
    expect(otherTerms(OFFER)).toBe(OFFER.notes);
    expect(otherTerms({ ...OFFER, other_terms: "3 hotel rooms" })).toBe("3 hotel rooms");
  });

  it("go in the email", () => {
    const html = agentEmailHtml({ offer: OFFER, sender: OPERATORS.west72, message: "", artistAtSellout: 0, attachmentName: "x" });
    expect(html).toContain("Other terms");
    expect(html).toContain("Venue to cover 3 Hotel Rooms");
  });
});
