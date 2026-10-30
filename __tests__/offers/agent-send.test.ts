import path from "path";
import ExcelJS from "exceljs";
import { buildOfferData } from "@/lib/xlsx-templates/offer/adapter";
import { renderXlsxTemplate } from "@/lib/xlsx-templates/render";
import { AGENT_COPY_CUT, agentDealLine, agentEmailHtml, offerSubject, senderForDomain } from "@/lib/offers/agentEmail";
import { OPERATORS } from "@/lib/operators";
import type { ArtistOffer } from "@/lib/types/offer";

/** Cigarettes @ Sunset as it's going out: 75/25 after Support, $1 FAC. */
const OFFER = {
  id: "x",
  artist_name: "Cigarettes @ Sunset",
  venue: "Singin' River Brewing Co.",
  venue_address: "526 E College St, Florence, AL 35630",
  event_date: "2027-04-16",
  agent_name: "Carrie Creasey",
  deal_type: "DOOR",
  guarantee: 0,
  backend_percentage: "75",
  tax_rate: 0.095,
  tax_method: "multiplier",
  offer_valid_days: 14,
  ticket_scaling: [
    { name: "General Admission", seats: 750, comps: 30, kills: 0, sellable_cap: 720, price: 33.5, net_price: 27.5, facility_fee: 3, ticketing_fee: 3, artist_fac: 1 },
  ],
  fixed_expenses: [
    { name: "Rent", amount: 500 },
    { name: "Production", amount: 1000 },
    { name: "Marketing", amount: 1000 },
    { name: "Support", amount: 1000, off_top: true },
    { name: "insurance", amount: 300 },
    { name: "security", amount: 200 },
  ],
  total_fixed: 4000,
  variable_expenses: [{ name: "Card processing (2.9% + $0.30)", rate: 0, amount: 1000.8, locked: true }],
  total_variable: 1000.8,
} as unknown as ArtistOffer;

const TEMPLATE_DIR = path.join(process.cwd(), "lib/xlsx-templates/offer");

async function render(agent: boolean) {
  const buf = await renderXlsxTemplate(
    TEMPLATE_DIR,
    buildOfferData(OFFER) as unknown as Record<string, unknown>,
    agent ? { cutFromLabel: AGENT_COPY_CUT } : {},
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("OFFER")!;
  const text: string[] = [];
  ws.eachRow((row) => row.eachCell((c) => text.push(String(c.value ?? ""))));
  return { ws, all: text.join(" | ") };
}

describe("the agent's copy of the offer sheet", () => {
  it("stops before the venue's numbers", async () => {
    const { all } = await render(true);
    for (const internal of ["VENUE POTENTIAL", "INTERNAL USE ONLY", "REVENUE TO VENUE", "BREAKEVEN", "VENUE TOTAL", "BARE MINIMUM", "TO COVER BAND"]) {
      expect(all).not.toContain(internal);
    }
  });

  it("keeps the artist's side whole", async () => {
    const { all } = await render(true);
    expect(all).toContain("ARTIST TOTAL POTENTIAL");
    expect(all).toContain("14820");
    expect(all).toContain("Door after Support");
  });

  it("is still locked", async () => {
    const { ws } = await render(true);
    expect((ws as unknown as { sheetProtection?: { sheet?: boolean } }).sheetProtection?.sheet).toBe(true);
  });

  it("leaves the internal copy alone", async () => {
    const { all } = await render(false);
    expect(all).toContain("REVENUE TO VENUE");
  });
});

describe("the email", () => {
  it("says the deal the way the agent will read it", () => {
    expect(agentDealLine(OFFER)).toBe(
      "75% of the door after Support (face value, after tax and fees), plus $1 per ticket from the facility fee",
    );
  });

  it("subject names the artist, room and date", () => {
    expect(offerSubject(OFFER)).toBe("Offer: Cigarettes @ Sunset — Singin' River Brewing Co. — Fri, Apr 16, 2027");
  });

  it("sends only from a verified operator domain", () => {
    expect(senderForDomain("west72ent.com")?.slug).toBe("west72");
    expect(senderForDomain("venuecore.live")?.slug).toBe("venuecore");
    expect(senderForDomain("gmail.com")).toBeNull();
  });

  it("escapes what was typed and carries no venue numbers", () => {
    const html = agentEmailHtml({ offer: OFFER, sender: OPERATORS.west72, message: "Hi <Carrie>", artistAtSellout: 14820, attachmentName: "o.xlsx" });
    expect(html).toContain("Hi &lt;Carrie&gt;");
    expect(html).toContain("$14,820");
    expect(html).not.toMatch(/Rent|Production|Marketing|walkout|breakeven/i);
  });
});
