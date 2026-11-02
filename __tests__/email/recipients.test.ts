import { agentRecipients, resolveRecipients } from "@/lib/email/recipients";
import { settlementEmailHtml, settlementSubject, settlementsAddress } from "@/lib/settlement/agentEmail";
import { agentEmailHtml } from "@/lib/offers/agentEmail";
import { OPERATORS } from "@/lib/operators";
import type { ArtistSettlementData } from "@/lib/xlsx-templates/artist-settlement/adapter";
import type { ArtistOffer } from "@/lib/types/offer";

describe("resolveRecipients", () => {
  const base = { to: "agent@agency.com", cc: ["tm@agency.com"], subject: "Offer: X" };

  it("sends a test to the sender only, whatever the form says", () => {
    expect(resolveRecipients({ ...base, test: true }, "me@west72ent.com")).toEqual({
      ok: true, test: true, to: "me@west72ent.com", cc: [], subject: "[TEST] Offer: X",
    });
  });

  it("refuses a test when the sender has no email", () => {
    expect(resolveRecipients({ ...base, test: true }, null).ok).toBe(false);
  });

  it("sends a real one to the agent, with the CCs and the sender's copy", () => {
    expect(resolveRecipients(base, "me@west72ent.com")).toEqual({
      ok: true, test: false, to: "agent@agency.com", cc: ["tm@agency.com", "me@west72ent.com"], subject: "Offer: X",
    });
  });

  it("doesn't copy the sender twice", () => {
    const r = resolveRecipients({ ...base, cc: ["ME@west72ent.com"] }, "me@west72ent.com");
    expect(r).toMatchObject({ cc: ["ME@west72ent.com"] });
  });

  it("refuses a bad agent address, a bad CC and an empty subject", () => {
    expect(resolveRecipients({ ...base, to: "nope" }, null).ok).toBe(false);
    expect(resolveRecipients({ ...base, cc: ["nope"] }, null).ok).toBe(false);
    expect(resolveRecipients({ ...base, subject: " " }, null).ok).toBe(false);
  });
});

describe("agentRecipients", () => {
  it("addresses the assistant and copies the agent", () => {
    expect(agentRecipients("agent@a.com", " asst@a.com ")).toEqual({ to: "asst@a.com", cc: "agent@a.com" });
  });

  it("addresses the agent when there's no assistant", () => {
    expect(agentRecipients("agent@a.com", "")).toEqual({ to: "agent@a.com", cc: "" });
  });

  it("doesn't copy the same person twice", () => {
    expect(agentRecipients("a@a.com", "A@a.com")).toEqual({ to: "A@a.com", cc: "" });
  });
});

describe("settlement email", () => {
  const data = {
    artist_name: "Bottomland", venue_name: "Singin' River", venue_address: "526 E College St",
    event_date_label: "Sat, Oct 3, 2026", ticket_totals_sold: 412, artist_guarantee: 2500, backend_overage: 300,
    deposits_paid: 1000, cash_advance: 0, merch_venue_take_deduction: 150, seller_fee: 0, balance_due: 1650,
    gbor: 99999, nbor: 88888,
  } as unknown as ArtistSettlementData;
  const html = settlementEmailHtml({
    data, sender: OPERATORS.west72, subject: "S", message: "Hi <there>", attachmentName: "a&b.xlsx",
  });

  it("shows the artist's figures and escapes what it's given", () => {
    expect(html).toContain("$1,650");
    expect(html).toContain("-$1,000");
    expect(html).toContain("Hi &lt;there&gt;");
    expect(html).toContain("a&amp;b.xlsx");
    expect(html).not.toContain("Cash advance");
  });

  it("leaves out what isn't in the summary", () => {
    expect(html).not.toContain("99,999");
    expect(html).not.toContain("88,888");
  });

  it("sends from settlements@ on the operator's domain", () => {
    expect(settlementsAddress(OPERATORS.west72)).toBe(`settlements@${OPERATORS.west72.domain}`);
    expect(settlementSubject({ artistName: "A", venueName: "V", dateLabel: "D" })).toBe("Settlement: A — V — D");
  });
});

it("still breaks ticket tiers onto their own lines in the offer email", () => {
  const html = agentEmailHtml({
    offer: {
      artist_name: "A",
      ticket_scaling: [{ name: "GA", net_price: 20 }, { name: "VIP <1>", net_price: 50 }],
    } as unknown as ArtistOffer,
    sender: OPERATORS.west72, message: "", artistAtSellout: 0, attachmentName: "a.xlsx",
  });
  expect(html).toMatch(/GA \$20[^<]*<br\/>VIP &lt;1&gt; \$50/);
});
