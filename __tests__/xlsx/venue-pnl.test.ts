import path from "path";
import ExcelJS from "exceljs";
import { buildVenuePnlData } from "@/lib/xlsx-templates/venue-pnl/adapter";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import type { PnlVenue, PnlShow } from "@/lib/reports/venue-pnl";

/**
 * The venue P&L workbook. Figures are Singin' River Brewing Co., Apr–Sep 2026,
 * as lib/reports/venue-pnl.ts produces them from production data.
 *
 * Cells are found by their column-A label rather than by address: both the
 * shows block and the expense-category block resize with the data, so the
 * summary does not sit at its template row in a rendered file.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/venue-pnl");

function show(over: Partial<PnlShow>): PnlShow {
  return {
    event_id: "e1", title: "Show", date: "2026-08-13", event_type: "hard_ticket",
    has_settlement: true, settlement_status: "finalized",
    tickets_sold: 0, comps: 0,
    face_value: 0, door_cash: 0, service_fees: 0, facility_fees: 0,
    card_fees_collected: 0, sales_tax_collected: 0, merch_venue_share: 0, revenue_total: 0,
    artist_payout: 0, sales_tax_remitted: 0, card_processing: 0,
    show_expenses: {}, expenses_unitemized: 0, expenses_total: 0, net: 0,
    ...over,
  };
}

const venue: PnlVenue = {
  event_venue_id: "v1",
  event_venue_name: "Singin' River Brewing Co.",
  shows: [
    show({ event_id: "kruse", title: "Kruse Brothers", date: "2026-04-24", tickets_sold: 76,
      face_value: 1332.77, service_fees: 228, card_fees_collected: 58.5, sales_tax_collected: 126.66,
      revenue_total: 1745.93, artist_payout: 750, sales_tax_remitted: 126.66, card_processing: 63.5,
      show_expenses: { Production: 300 }, expenses_total: 2059.29, net: -313.36 }),
    show({ event_id: "dnc", title: "Drivin' N Cryin'", date: "2026-08-13", tickets_sold: 310,
      face_value: 6370.09, door_cash: 450, service_fees: 930, facility_fees: 915,
      card_fees_collected: 286.89, sales_tax_collected: 605.23, revenue_total: 9557.21,
      artist_payout: 3279.74, sales_tax_remitted: 605.23, card_processing: 312.3,
      show_expenses: { Production: 300, Security: 200 }, expenses_total: 6299.02, net: 3258.19 }),
    show({ event_id: "tyler", title: "Tyler Halverson", date: "2026-09-10", has_settlement: false,
      tickets_sold: 50, face_value: 999.2, revenue_total: 1446.69, expenses_total: 0, net: 1446.69 }),
  ],
  expense_categories: ["Production", "Security"],
  totals: {
    tickets_sold: 436, comps: 0,
    face_value: 8702.06, door_cash: 450, service_fees: 1158, facility_fees: 915,
    card_fees_collected: 345.39, sales_tax_collected: 731.89, merch_venue_share: 199.77,
    revenue_total: 12749.83,
    artist_payout: 4029.74, sales_tax_remitted: 731.89, card_processing: 375.8,
    show_expenses: { Production: 600, Security: 200 }, expenses_unitemized: 26.02,
    expenses_total: 8358.31, net: 4391.52,
  },
};

async function cells() {
  const data = buildVenuePnlData(venue, { from: "2026-04-01", to: "2026-09-15" });
  const buf = await renderXlsxTemplate(TEMPLATE_DIR, data as unknown as Record<string, unknown>);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("VENUE_PNL")!;
  const rowOf = (label: string) => {
    let found = 0;
    ws.eachRow((row, r) => {
      if (!found && String(row.getCell(1).value ?? "").trim() === label) found = r;
    });
    if (!found) throw new Error(`label not found: ${label}`);
    return found;
  };
  return { ws, rowOf, amount: (label: string) => Number(ws.getRow(rowOf(label)).getCell(12).value) };
}

describe("venue P&L workbook", () => {
  it("names the venue and the period", async () => {
    const { ws } = await cells();
    expect(String(ws.getCell("B8").value)).toBe("Singin' River Brewing Co.");
    expect(String(ws.getCell("G8").value)).toContain("2026");
    expect(Number(ws.getCell("K8").value)).toBe(3);
  });

  it("writes one row per show and a totals row beneath them", async () => {
    const { ws, rowOf } = await cells();
    const first = 13;
    expect(String(ws.getRow(first).getCell(2).value)).toBe("Kruse Brothers");
    expect(String(ws.getRow(first + 1).getCell(2).value)).toBe("Drivin' N Cryin'");
    // A show with no settlement is marked, so a costless night reads as such.
    expect(String(ws.getRow(first + 2).getCell(2).value)).toBe("Tyler Halverson (no settlement)");

    const totals = rowOf("TOTALS");
    expect(totals).toBe(first + 3);
    expect(Number(ws.getRow(totals).getCell(3).value)).toBe(436);
    expect(Number(ws.getRow(totals).getCell(12).value)).toBeCloseTo(4391.52, 2);
  });

  it("carries door cash, which the ticket ledger cannot see", async () => {
    const { amount } = await cells();
    expect(amount("Door cash (manual settlement entry)")).toBeCloseTo(450, 2);
  });

  it("totals revenue and expenses, and nets them", async () => {
    const { amount } = await cells();
    expect(amount("Ticket face value")).toBeCloseTo(8702.06, 2);
    expect(amount("TOTAL REVENUE")).toBeCloseTo(12749.83, 2);
    expect(amount("Artist payouts")).toBeCloseTo(4029.74, 2);
    expect(amount("TOTAL EXPENSES")).toBeCloseTo(8358.31, 2);
    expect(amount("NET PROFIT / (LOSS)")).toBeCloseTo(4391.52, 2);
  });

  it("repeats a row per expense category actually used", async () => {
    const { amount } = await cells();
    expect(amount("Show expense — Production")).toBeCloseTo(600, 2);
    expect(amount("Show expense — Security")).toBeCloseTo(200, 2);
    expect(amount("Other settlement costs (not itemised)")).toBeCloseTo(26.02, 2);
  });

  it("shows sales tax on both sides so it nets to zero", async () => {
    const { amount } = await cells();
    expect(amount("Sales tax collected")).toBeCloseTo(731.89, 2);
    expect(amount("Sales tax remitted")).toBeCloseTo(731.89, 2);
  });
});
