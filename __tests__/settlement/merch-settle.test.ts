import path from "path";
import ExcelJS from "exceljs";
import { isMerchPaidSeparately, merchOwedToVenue, merchSettleLabel } from "@/lib/settlement/merchSettle";
import { buildArtistSettlementData } from "@/lib/xlsx-templates/artist-settlement/adapter";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import type { Settlement } from "@/lib/types/settlement";

/**
 * Merch the artist owes the venue either comes out of the guarantee (the
 * default) or is paid to the promoter separately in cash or by check. The
 * venue earns its cut either way; only the balance due changes.
 */

const base = {
  id: "s1", deal_type: "FLAT", guarantee: 2000, artist_total: 2000,
  deposit_paid: 0, cash_advance: 0, ticket_audit: [],
  merch_venue_share: 270, merch_seller_fee: 50, merch_seller_fee_payer: "artist",
  merch_total_tax: 0, merch_tax_payer: "artist",
} as unknown as Settlement;

describe("merch settle method", () => {
  it("owes the venue its cut plus an artist-paid seller fee", () => {
    expect(merchOwedToVenue(base)).toBe(320);
    expect(merchOwedToVenue({ ...base, merch_tax_payer: "venue", merch_total_tax: 30 })).toBe(350);
  });

  it("only cash and check are separate", () => {
    expect(isMerchPaidSeparately("guarantee")).toBe(false);
    expect(isMerchPaidSeparately(undefined)).toBe(false);
    expect(isMerchPaidSeparately("cash")).toBe(true);
    expect(isMerchPaidSeparately("check")).toBe(true);
  });

  it("labels the check number", () => {
    expect(merchSettleLabel("check", "#1042")).toBe("Paid separately by check #1042");
    expect(merchSettleLabel("check", "")).toBe("Paid separately by check");
    expect(merchSettleLabel("cash")).toBe("Paid separately in cash");
    expect(merchSettleLabel("guarantee", "1042")).toBe("");
  });

  it("the artist sheet deducts merch from the guarantee by default", () => {
    const d = buildArtistSettlementData({ ...base, balance_due: 1680 }, [], null);
    expect(d.merch_venue_take_deduction).toBe(270);
    expect(d.seller_fee).toBe(50);
    expect(d.merch_deduction_label).toBe("% Merch to Venue");
  });

  it("the artist sheet deducts nothing when merch is paid by check", async () => {
    const s = { ...base, balance_due: 2000, merch_settle_method: "check", merch_settle_reference: "1042" } as Settlement;
    const d = buildArtistSettlementData(s, [], null);
    expect(d.merch_venue_take_deduction).toBe(0);
    expect(d.seller_fee).toBe(0);
    expect(d.merch_deduction_label).toBe("% Merch to Venue (paid separately by check #1042)");

    const buf = await renderXlsxTemplate(
      path.join(process.cwd(), "lib/xlsx-templates/artist-settlement"),
      d as unknown as Record<string, unknown>
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    // The expense rows resize, so find the row by its label, not its address.
    const rowOf = (label: string) => {
      let at = 0;
      ws.eachRow((r, n) => { if (!at && String(r.getCell(1).value ?? "").startsWith(label)) at = n; });
      return at;
    };
    const merchRow = rowOf("% Merch to Venue");
    expect(ws.getCell(`A${merchRow}`).value).toBe("% Merch to Venue (paid separately by check #1042)");
    expect(ws.getCell(`L${merchRow}`).value).toBe(0);
    expect(ws.getCell(`L${rowOf("Total Due to Artist")}`).value).toBe(2000);
  });
});
