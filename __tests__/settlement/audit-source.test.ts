import path from "path";
import ExcelJS from "exceljs";
import { auditSourceLabel } from "@/lib/settlement/auditSource";
import type { SettlementPayoutLike } from "@/lib/settlement/payoutRecord";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { buildArtistSettlementData } from "@/lib/xlsx-templates/artist-settlement/adapter";
import { buildVenueSettlementData } from "@/lib/xlsx-templates/venue-settlement/adapter";
import type { Settlement, TicketAuditRow } from "@/lib/types/settlement";

const row = (r: Partial<TicketAuditRow>) =>
  ({ tier: "General Admission", capacity: 0, sold: 1, comps: 0, kills: 0, price: 15, ticketing_fee: 3, facility_fee: 3, gross: 15, orders: 1, source: "online", ...r }) as TicketAuditRow;

const SETTLEMENT = {
  artist_name: "Bottomland",
  event_date: "2026-10-30",
  tax_rate: 0.095,
  tax_method: "divisor",
  total_gross: 2791.24,
  ticketing_fees: 390,
  facility_fees: 390,
  cc_fees: 101.08,
  taxes: 174.49,
  net_receipts: 1836.75,
  merch_tax_method: "multiplier",
  ticket_audit: [
    row({ price: 14, promo_code: "PHIGAM", capacity: 720, gross_receipts: 20.91 }),
    row({ sold: 127, gross_receipts: 2768.19 }),
    row({ source: "cash", sold: 4, gross_receipts: 60 }),
    row({ source: "terminal", sold: 2, gross_receipts: 43.22 }),
  ],
} as unknown as Settlement;

async function sheetRows(type: "artist-settlement" | "venue-settlement", payouts: SettlementPayoutLike[] = []) {
  const data = type === "artist-settlement"
    ? buildArtistSettlementData(SETTLEMENT, [], null, payouts)
    : buildVenueSettlementData(SETTLEMENT, [], null, payouts);
  const buf = await renderXlsxTemplate(path.join(process.cwd(), "lib/xlsx-templates", type), data as unknown as Record<string, unknown>);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: Record<string, unknown>[] = [];
  wb.worksheets[0].eachRow((r) => {
    const cells: Record<string, unknown> = {};
    r.eachCell((c) => { cells[c.address.replace(/\d+/, "")] = c.value; });
    out.push(cells);
  });
  return out;
}

describe("auditSourceLabel", () => {
  it("names the four sources, and a promo code wins over where it sold", () => {
    expect(auditSourceLabel({ source: "cash" })).toBe("Door Cash");
    expect(auditSourceLabel({ source: "terminal" })).toBe("Door Terminal");
    expect(auditSourceLabel({ source: "online" })).toBe("Online");
    expect(auditSourceLabel({ source: "online", promo_code: "PHIGAM" })).toBe("Promo: PHIGAM");
  });
});

describe.each(["artist-settlement", "venue-settlement"] as const)("%s workbook", (type) => {
  it("puts Source right after the tier, and every figure under its own heading", async () => {
    const rows = await sheetRows(type);
    const head = rows.findIndex((r) => r.A === "TIER NAME");
    expect(rows[head]).toMatchObject({ B: "SOURCE", C: "CAPACITY", D: "SOLD", G: "PRICE", J: "TAX", K: "CC", L: "GROSS" });
    expect(rows.slice(head + 1, head + 5).map((r) => r.B)).toEqual(["Promo: PHIGAM", "Online", "Door Cash", "Door Terminal"]);
    expect(rows[head + 1]).toMatchObject({ C: 720, D: 1, G: 14 });
    const total = rows.find((r) => r.A === "TOTALS");
    expect(total).toMatchObject({ C: 720, D: 134 });
  });

  it("takes the card fee out once, in expenses, and the summary foots", async () => {
    const rows = await sheetRows(type);
    const start = rows.findIndex((r) => r.A === "FINANCIAL SUMMARY");
    const end = rows.findIndex((r) => r.A === "EXPENSES");
    const summary = rows.slice(start, end);
    expect(summary.some((r) => /^CC/i.test(String(r.A)))).toBe(false);
    const amount = (label: RegExp) => Number(summary.find((r) => label.test(String(r.A)))?.L);
    expect(amount(/^GBOR/)).toBeCloseTo(2892.32, 2);
    expect(amount(/^GBOR/) - amount(/^Service/) - amount(/^Facility/) - amount(/^Taxes/)).toBeCloseTo(amount(/^NBOR/), 2);
    expect(rows.find((r) => /^Card processing/.test(String(r.A)))?.L).toBe(101.08);
  });

  it("records payments right under Total Due to Artist", async () => {
    const after = (rows: Record<string, unknown>[], n: number) =>
      rows[rows.findIndex((r) => r.A === "Total Due to Artist") + n];
    const unpaid = await sheetRows(type);
    expect(after(unpaid, 1).A).toBe("Payment record: not paid yet");
    expect(after(unpaid, 1).L ?? null).toBeNull();

    const paid = await sheetRows(type, [
      { amount: 200, method: "Check", reference: "1042", paid_at: "2026-10-31" },
      { amount: 175, method: "Cash", paid_at: "2026-11-02" },
    ]);
    expect(after(paid, 1)).toMatchObject({ A: "Paid Oct 31, 2026 · Check #1042", L: 200 });
    expect(after(paid, 2)).toMatchObject({ A: "Paid Nov 2, 2026 · Cash", L: 175 });
  });

  it("says the ticket tax method the settlement actually used", async () => {
    const rows = await sheetRows(type);
    expect(rows.some((r) => r.A === "Taxes (Divisor)")).toBe(true);
    expect(rows.some((r) => String(r.A).startsWith("Taxes (") && /Multipl/.test(String(r.A)))).toBe(false);
  });
});
