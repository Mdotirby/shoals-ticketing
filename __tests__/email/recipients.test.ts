import { agentRecipients, resolveRecipients } from "@/lib/email/recipients";
import { settlementEmailHtml, settlementSubject, settlementsAddress } from "@/lib/settlement/agentEmail";
import { agentEmailHtml } from "@/lib/offers/agentEmail";
import { defaultRecipients, mergeOfferContacts, type ShowContact } from "@/lib/contacts/showContacts";
import { daysOut, salesSubject, salesUpdateEmailHtml } from "@/lib/events/salesUpdateEmail";
import { OPERATORS } from "@/lib/operators";
import type { ArtistSettlementData } from "@/lib/xlsx-templates/artist-settlement/adapter";
import type { ArtistOffer } from "@/lib/types/offer";

const OP = OPERATORS.venuecore;

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
    data, sender: OPERATORS.west72, subject: "S", message: "Hi <there>",
  });

  it("shows the artist's figures and escapes what it's given", () => {
    expect(html).toContain("$1,650");
    expect(html).toContain("-$1,000");
    expect(html).toContain("Hi &lt;there&gt;");
    expect(html).not.toContain("Cash advance");
  });

  it("doesn't draw a fake attachment, since the real one is on the email", () => {
    expect(html).not.toContain("XLSX");
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
    sender: OPERATORS.west72, message: "", artistAtSellout: 0,
  });
  expect(html).toMatch(/GA \$20[^<]*<br\/>VIP &lt;1&gt; \$50/);
});

describe("show contacts", () => {
  const tm: ShowContact = { id: "1", name: "Tess", role: "tour_manager", email: "tm@a.com", phone: null, source: "contact" };
  const offer = { agent_name: "Ann", agent_email: "agent@a.com", agent_assistant_email: "asst@a.com" };

  it("lists the offer's agent and assistant with the show's own contacts", () => {
    expect(mergeOfferContacts([tm], offer).map((c) => [c.email, c.source])).toEqual([
      ["asst@a.com", "offer"], ["agent@a.com", "offer"], ["tm@a.com", "contact"],
    ]);
  });

  it("lets a contact added by hand stand in for the same address on the offer", () => {
    const own: ShowContact = { ...tm, role: "agent", email: "AGENT@a.com" };
    expect(mergeOfferContacts([own], offer).filter((c) => c.role === "agent")).toEqual([own]);
  });

  it("defaults to the assistant, with the agent copied and nobody else", () => {
    expect(defaultRecipients(mergeOfferContacts([tm], offer))).toEqual({ to: "asst@a.com", cc: ["agent@a.com"] });
  });

  it("defaults to the agent when there's no assistant", () => {
    expect(defaultRecipients(mergeOfferContacts([tm], { agent_email: "agent@a.com" }))).toEqual({ to: "agent@a.com", cc: [] });
  });

  it("uses an assistant added by hand when the offer has none", () => {
    const own: ShowContact = { ...tm, role: "assistant", email: "own@a.com" };
    expect(defaultRecipients(mergeOfferContacts([own], { agent_email: "agent@a.com" }))).toEqual({ to: "own@a.com", cc: ["agent@a.com"] });
  });
});

describe("sales update email", () => {
  const figures = { title: "Cole <Phillips>", venue: "Singin' River", date: "2026-11-06T19:30:00+00:00", sold: 412, capacity: 720, gbor: 9876.5 };
  const now = new Date("2026-11-02T18:00:00Z");
  const html = salesUpdateEmailHtml({ figures, sender: OP, subject: "S", message: "Hi", now });

  it("leads with tickets sold and GBOR, and escapes the title", () => {
    expect(html).toContain("Tickets sold");
    expect(html).toContain(">412<");
    expect(html).toContain("GBOR");
    expect(html).toContain("$9,876.50");
    expect(html).toContain("Cole &lt;Phillips&gt;");
    expect(html).toContain("412 of 720 (57%)");
  });

  it("counts days out, and drops them after the show", () => {
    expect(daysOut(figures.date, now)).toBe(4);
    expect(daysOut(figures.date, new Date("2026-11-08T18:00:00Z"))).toBeNull();
  });

  it("puts the count in the subject", () => {
    expect(salesSubject(figures)).toContain("412 sold");
  });
});

it("puts the glass image behind the top panel, over a solid fallback", () => {
  const html = salesUpdateEmailHtml({
    figures: { title: "A", venue: "V", date: "2026-11-06", sold: 1, capacity: 0, gbor: 0 },
    sender: OP, subject: "S", message: "",
  });
  expect(html).toContain(`url('https://${OP.domain}/email/glass-panel.jpg')`);
  expect(html).toContain('bgcolor="#15161b" background=');
});
