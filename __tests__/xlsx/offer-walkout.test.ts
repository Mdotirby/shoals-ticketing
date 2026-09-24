import path from "path";
import ExcelJS from "exceljs";
import { buildOfferData } from "@/lib/xlsx-templates/offer/adapter";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import type { ArtistOffer } from "@/lib/types/offer";

/**
 * The Artist Potential at Sellout block on the offer XLSX export.
 *
 * Rule (Matt, confirmed against lib/settlement/model.ts artistPayout):
 *   backend = pool × backend%            (pool = net potential − expenses)
 *   overage = backend − guarantee, and nothing if that is not positive
 *   artist  = guarantee + overage        (= the greater of the two)
 *
 * The export got this wrong three ways at once: K65 kept the template's
 * literal 80%, L65 printed the stored artist_backend (already the overage)
 * as if it were the percentage share, and the VS total took the max of the
 * guarantee and that overage — understating the artist by the guarantee.
 *
 * These render the real template and read the cells back, so a wrong
 * manifest mapping fails here as surely as wrong arithmetic.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/offer");

/** A VS offer shaped exactly as the offer builder saves it: artist_backend
 *  is the overage, pot_walkout is the venue's share. Figures are Adam Hood's
 *  offer from production — $1,500 vs 65%.
 *
 *  The pool is $6,131.66, not the $6,930.86 this offer was written with: the
 *  card surcharge is now a show expense (lib/offers/cardExpense.ts) and costs
 *  720 × $1.11 = $799.20 at sellout. It is derived rather than read off the
 *  record, so it applies to this fixture's empty variable_expenses too —
 *  which is the point, since 21 of the 40 offers on file have no card line
 *  saved at all. */
function vsOffer(overrides: Partial<ArtistOffer> = {}): ArtistOffer {
  return {
    artist_name: "Adam Hood",
    deal_type: "VS",
    guarantee: 1500,
    backend_percentage: "65",
    net_potential: 10800,
    total_expenses: 3869.14,
    total_fixed: 3600,
    total_variable: 269.14,
    splitpoint: 6930.86,
    artist_backend: 3005.06,
    pot_walkout: 2425.8,
    tax_rate: 0.095,
    ticket_scaling: [
      { name: "GA", seats: 720, comps: 0, kills: 0, sellable_cap: 720, price: 26, net_price: 20, facility_fee: 3, ticketing_fee: 3 },
    ],
    fixed_expenses: [],
    variable_expenses: [],
    ...overrides,
  } as unknown as ArtistOffer;
}

async function walkoutCells(offer: ArtistOffer) {
  const buf = await renderXlsxTemplate(TEMPLATE_DIR, buildOfferData(offer) as unknown as Record<string, unknown>);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("OFFER")!;

  // Find rows by their column-A label, not by fixed address: the ticket
  // scaling and expense sections grow and shrink with the offer, so this
  // block does not sit at the template's row 63 in a rendered file.
  const rowOf = (label: string) => {
    let found = 0;
    ws.eachRow((row, r) => {
      if (!found && String(row.getCell(1).value ?? "").trim() === label) found = r;
    });
    if (!found) throw new Error(`label not found: ${label}`);
    return found;
  };
  const num = (row: number, col: number) => Number(ws.getRow(row).getCell(col).value ?? NaN);
  const K = 11, L = 12, B = 2;

  return {
    dealPct: num(rowOf("Backend %:"), B),
    guarantee: num(rowOf("ARTIST GUARANTEE"), L),
    splitpoint: num(rowOf("Splitpoint"), L),
    backendPct: num(rowOf("Backend"), K),
    backend: num(rowOf("Backend"), L),
    overage: num(rowOf("Overage"), L),
    artistTotal: num(rowOf("ARTIST TOTAL POTENTIAL"), L),
    revenueToVenue: num(rowOf("REVENUE TO VENUE"), L),
    venueTotal: num(rowOf("VENUE TOTAL"), L),
  };
}

describe("offer XLSX — artist potential at sellout", () => {
  it("prints the deal's own backend percentage, not the template's 80%", async () => {
    const c = await walkoutCells(vsOffer());
    expect(c.dealPct).toBeCloseTo(0.65, 6);
    expect(c.backendPct).toBeCloseTo(0.65, 6);
  });

  it("VS above the guarantee: guarantee + overage, which is the percentage share", async () => {
    const c = await walkoutCells(vsOffer());
    expect(c.guarantee).toBe(1500);
    expect(c.splitpoint).toBeCloseTo(6131.66, 2); // 6,930.86 − 799.20 card
    expect(c.backend).toBeCloseTo(3985.58, 2); // 6,131.66 × 65%
    expect(c.overage).toBeCloseTo(2485.58, 2); // 3,985.58 − 1,500
    expect(c.artistTotal).toBeCloseTo(3985.58, 2); // 1,500 + 2,485.58
    expect(c.revenueToVenue).toBeCloseTo(2146.08, 2); // 6,131.66 − 3,985.58
    expect(c.venueTotal).toBeCloseTo(2146.08, 2);
  });

  it("VS below the guarantee: no backend, artist gets the guarantee", async () => {
    // Pool $1,800 − $799.20 card = $1,000.80; × 65% = $650.52, well under
    // the $1,500 guarantee, so the guarantee still carries.
    const c = await walkoutCells(
      vsOffer({ net_potential: 5669.14, artist_backend: 0, pot_walkout: 300 } as Partial<ArtistOffer>)
    );
    expect(c.backend).toBeCloseTo(650.52, 2);
    expect(c.overage).toBe(0);
    expect(c.artistTotal).toBe(1500);
    expect(c.revenueToVenue).toBeCloseTo(-499.2, 2); // 1,000.80 − 1,500
  });

  it("ignores a stale stored artist_backend from an older offer", async () => {
    // Legacy rows were saved under an earlier model — derive, don't trust.
    const c = await walkoutCells(vsOffer({ artist_backend: 12605.04, splitpoint: 1500, pot_walkout: 99 } as Partial<ArtistOffer>));
    expect(c.splitpoint).toBeCloseTo(6131.66, 2);
    expect(c.artistTotal).toBeCloseTo(3985.58, 2);
    expect(c.revenueToVenue).toBeCloseTo(2146.08, 2);
  });

  it("FLAT: guarantee only, no backend or overage", async () => {
    const c = await walkoutCells(vsOffer({ deal_type: "FLAT", backend_percentage: "0", artist_backend: 0 } as Partial<ArtistOffer>));
    expect(c.backend).toBe(0);
    expect(c.overage).toBe(0);
    expect(c.artistTotal).toBe(1500);
    expect(c.revenueToVenue).toBeCloseTo(4631.66, 2); // 6,131.66 − 1,500
  });
});
