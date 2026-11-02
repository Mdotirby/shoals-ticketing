import { canSetRole, normalizeRole, PLATFORM_OWNER_ID } from "@/lib/auth/roles";
import { venueInTenant } from "@/lib/auth/tenant";
import type { AdminActor } from "@/lib/auth/can";

jest.mock("@/lib/auth/can", () => ({
  can: (a: AdminActor | null, cap: string) =>
    a?.resolved.level === "owner" && cap === "cross_tenant_reporting" ? "full" : "none",
}));

const matt = { id: PLATFORM_OWNER_ID, role: "owner" };
const rob = { id: "rob", role: "owner" };
const venueAdmin = { id: "va", role: "venue_admin" };
const finance = { id: "fin", role: "finance" };
const boxOffice = { id: "bo", role: "box_office" };

describe("canSetRole", () => {
  it("lets Matt set anything", () => {
    for (const r of ["owner", "venue_admin", "finance", "box_office", "artist"]) {
      expect(canSetRole(matt, r)).toBe(true);
    }
  });

  it("keeps owner and venue admin from every other owner", () => {
    expect(canSetRole(rob, "owner")).toBe(false);
    expect(canSetRole(rob, "venue_admin")).toBe(false);
    expect(canSetRole(rob, "box_office")).toBe(true);
  });

  it("lets a venue admin set anything below them, never a peer or above", () => {
    expect(canSetRole(venueAdmin, "owner")).toBe(false);
    expect(canSetRole(venueAdmin, "venue_admin")).toBe(false);
    for (const r of ["talent_buyer", "finance", "events_manager", "box_office"]) {
      expect(canSetRole(venueAdmin, r)).toBe(true);
    }
  });

  it("sees through legacy spellings of the protected levels", () => {
    expect(canSetRole(venueAdmin, "super_admin")).toBe(false);
    expect(canSetRole(venueAdmin, "full_admin")).toBe(false);
    expect(canSetRole(rob, "full_admin")).toBe(false);
  });

  it("does not trust the id without the owner role", () => {
    expect(canSetRole({ id: PLATFORM_OWNER_ID, role: "venue_admin" }, "owner")).toBe(false);
  });

  it("blocks peers below venue admin too", () => {
    expect(canSetRole(finance, "talent_buyer")).toBe(false);
    expect(canSetRole(finance, "box_office")).toBe(true);
    expect(canSetRole(boxOffice, "box_office")).toBe(false);
  });

  it("refuses actors with no staff level", () => {
    expect(canSetRole({ id: "a", role: "artist" }, "box_office")).toBe(false);
    expect(canSetRole({ id: "r", role: "read_only" }, "box_office")).toBe(false);
  });
});

describe("venueInTenant", () => {
  const actor = (role: string, venueId: string | null) =>
    ({ id: "x", email: null, role, resolved: normalizeRole(role), venueId, capabilityOverrides: {} }) as AdminActor;

  it("pins staff to their own venue", () => {
    expect(venueInTenant(actor("venue_admin", "rcht"), "rcht")).toBe(true);
    expect(venueInTenant(actor("venue_admin", "rcht"), "west72")).toBe(false);
    expect(venueInTenant(actor("venue_admin", "rcht"), null)).toBe(false);
  });

  it("gives staff with no venue nothing", () => {
    expect(venueInTenant(actor("venue_admin", null), null)).toBe(false);
  });

  it("lets owners reach any venue", () => {
    expect(venueInTenant(actor("owner", null), "rcht")).toBe(true);
    expect(venueInTenant(actor("owner", "west72"), null)).toBe(true);
  });
});
