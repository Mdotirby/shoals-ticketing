import path from "path";
import ExcelJS from "exceljs";
import { buildOfferData } from "@/lib/xlsx-templates/offer/adapter";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import type { ArtistOffer } from "@/lib/types/offer";

/**
 * A door deal on the offer XLSX: Cigarettes @ Sunset at a $30 face, 80/20
 * after Support, plus $1 a ticket of the facility fee. Rent and Production
 * stay venue costs after the split.
 *
 *   door        720 × 30 = 21,600, less 1,000 Support = 20,600
 *   door share  80% = 16,480
 *   FAC         720 × $1 = 720
 *   artist      17,200
 *   venue       21,600 − 2,500 of expenses − 17,200 = 1,900
 */
const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/offer");

const DOOR = {
  artist_name: "Cigarettes @ Sunset",
  deal_type: "DOOR",
  guarantee: 0,
  backend_percentage: "80",
  tax_rate: 0.095,
  tax_method: "multiplier",
  ticket_scaling: [
    { name: "GA", seats: 750, comps: 30, kills: 0, sellable_cap: 720, price: 36, net_price: 30, facility_fee: 3, ticketing_fee: 3, artist_fac: 1 },
  ],
  fixed_expenses: [
    { name: "Rent", amount: 500 },
    { name: "Production", amount: 1000 },
    { name: "Support", amount: 1000, off_top: true },
  ],
  total_fixed: 2500,
  variable_expenses: [],
} as unknown as ArtistOffer;

async function sheet(offer: ArtistOffer) {
  const buf = await renderXlsxTemplate(TEMPLATE_DIR, buildOfferData(offer) as unknown as Record<string, unknown>);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("OFFER")!;
  const rowOf = (label: string) => {
    let found = 0;
    ws.eachRow((row, r) => {
      if (!found && String(row.getCell(1).value ?? "").trim() === label) found = r;
    });
    if (!found) throw new Error(`label not found: ${label}`);
    return found;
  };
  const cell = (label: string, col: number) => ws.getRow(rowOf(label)).getCell(col).value;
  return { rowOf, cell };
}

describe("door deal on the offer sheet", () => {
  it("spells the deal out in the terms", async () => {
    const { cell } = await sheet(DOOR);
    expect(cell("Deal Type:", 2)).toBe("DOOR 80/20 after Support + $1.00/tkt FAC to artist");
  });

  it("marks the line that comes off the top", async () => {
    const { rowOf } = await sheet(DOOR);
    expect(rowOf("Support (off the top)")).toBeGreaterThan(0);
  });

  it("prints the door, the share, the facility fee and the total", async () => {
    const { cell } = await sheet(DOOR);
    expect(Number(cell("Door after Support", 12))).toBeCloseTo(20600, 2);
    expect(Number(cell("Door share", 11))).toBeCloseTo(0.8, 6);
    expect(Number(cell("Door share", 12))).toBeCloseTo(16480, 2);
    expect(Number(cell("Facility fee to artist", 12))).toBeCloseTo(720, 2);
    expect(Number(cell("ARTIST TOTAL POTENTIAL", 12))).toBeCloseTo(17200, 2);
  });

  it("leaves the venue its share less rent and production", async () => {
    const { cell } = await sheet(DOOR);
    expect(Number(cell("REVENUE TO VENUE", 12))).toBeCloseTo(1900, 2);
  });

  it("keeps the template's own labels on other deals", async () => {
    const { rowOf } = await sheet({ ...DOOR, deal_type: "VS" } as ArtistOffer);
    expect(rowOf("Splitpoint")).toBeGreaterThan(0);
    expect(rowOf("Overage")).toBeGreaterThan(0);
  });
});
