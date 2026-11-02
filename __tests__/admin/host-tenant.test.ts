import { staffMayUseHost, staffHomeUrl, type StaffVenue } from "@/lib/auth/hostTenant";
import { WEST72_HOST_VENUE_ID } from "@/lib/west72-featured";

const rcht: StaffVenue = { id: "rcht-id", slug: "rcht", custom_domain: null };
// Production's row: mixed-case slug, plus a custom_domain.
const west72: StaffVenue = { id: WEST72_HOST_VENUE_ID, slug: "West72", custom_domain: "west72.venuecore.live" };

describe("staffMayUseHost", () => {
  it("keeps venue staff on their own subdomain", () => {
    expect(staffMayUseHost("rcht.venuecore.live", rcht)).toBe(true);
    expect(staffMayUseHost("RCHT.venuecore.live:443", rcht)).toBe(true);
    expect(staffMayUseHost("shoals.venuecore.live", rcht)).toBe(false);
  });

  it("treats west72ent.com as West 72's own site", () => {
    expect(staffMayUseHost("west72ent.com", west72)).toBe(true);
    expect(staffMayUseHost("www.west72ent.com", west72)).toBe(true);
    expect(staffMayUseHost("west72ent.com", rcht)).toBe(false);
    expect(staffMayUseHost("rcht.venuecore.live", west72)).toBe(false);
  });

  it("gives no venue the platform root", () => {
    expect(staffMayUseHost("venuecore.live", rcht)).toBe(false);
    expect(staffMayUseHost("venuecore.live", west72)).toBe(false);
  });

  it("does not let west72ent.com act as a subdomain parent", () => {
    expect(staffMayUseHost("rcht.west72ent.com", rcht)).toBe(false);
  });

  it("does not match lookalike hosts", () => {
    expect(staffMayUseHost("rcht.venuecore.live.evil.com", rcht)).toBe(false);
    expect(staffMayUseHost("evilrcht.venuecore.live", rcht)).toBe(false);
  });

  it("honors a venue's custom domain", () => {
    const custom: StaffVenue = { id: "x", slug: "x", custom_domain: "www.rocketcityhonkytonk.com" };
    expect(staffMayUseHost("rocketcityhonkytonk.com", custom)).toBe(true);
    expect(staffMayUseHost("www.rocketcityhonkytonk.com", custom)).toBe(true);
  });

  it("refuses staff with no venue, and requests with no host", () => {
    expect(staffMayUseHost("west72ent.com", null)).toBe(false);
    expect(staffMayUseHost("rcht.venuecore.live", null)).toBe(false);
    expect(staffMayUseHost("", rcht)).toBe(false);
    expect(staffMayUseHost(null, rcht)).toBe(false);
  });

  describe("dev hosts", () => {
    const original = process.env.VERCEL_ENV;
    afterEach(() => {
      process.env.VERCEL_ENV = original;
    });

    it("skips the check on localhost and previews", () => {
      process.env.VERCEL_ENV = "preview";
      expect(staffMayUseHost("localhost:3000", rcht)).toBe(true);
      expect(staffMayUseHost("shoals-abc123.vercel.app", rcht)).toBe(true);
    });

    it("does not treat the production vercel.app alias as a way around it", () => {
      process.env.VERCEL_ENV = "production";
      expect(staffMayUseHost("shoals-ticketing.vercel.app", rcht)).toBe(false);
    });
  });
});

describe("staffHomeUrl", () => {
  it("sends each venue's staff to their own site", () => {
    expect(staffHomeUrl(rcht)).toBe("https://rcht.venuecore.live");
    expect(staffHomeUrl(west72)).toBe("https://west72ent.com");
  });

  it("has nowhere to send staff without a venue", () => {
    expect(staffHomeUrl(null)).toBeNull();
    expect(staffHomeUrl({ id: "x", slug: null, custom_domain: null })).toBeNull();
  });
});
