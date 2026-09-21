import baseline from "./nav-baseline.json";
import { allNavLinks, DEFAULT_TAB_ROLES, resolveActive, visibleNav } from "@/lib/admin/nav";

/**
 * Routes merged into tabbed pages: old href → where that permission now
 * lives. Must match the redirects in next.config.ts.
 */
const MOVED: Record<string, string> = {
  "/admin/calendar": "/admin/calendar?tab=month",
  "/admin/events": "/admin/calendar?tab=list",
  "/admin/marketing": "/admin/marketing?tab=campaigns",
  "/admin/broadcasts": "/admin/marketing?tab=broadcasts",
  "/admin/auctions": "/admin/marketing?tab=auctions",
  "/admin/market-radar": "/admin/marketing?tab=radar",
  "/admin/sponsors": "/admin/marketing?tab=sponsors",
  "/admin/settings/branding": "/admin/settings?tab=branding",
  "/admin/faqs": "/admin/settings?tab=pages",
  "/admin/sops": "/admin/settings?tab=procedures",
  "/admin/users": "/admin/users?tab=people",
  "/admin/onboarding": "/admin/users?tab=onboarding",
  "/admin/venues": "/admin/users?tab=tenants",
};

/**
 * nav-baseline.json is the flat sidebar as it was before the regroup into
 * the design's three-level nav: every href, the tab_key it checked in
 * sidebar_permissions, and its roles. The regroup moves links between groups
 * and turns some into tabs; it must not change who can open what.
 */
describe("admin nav regroup keeps permissions", () => {
  test("every old link survives — in place or merged — with the same tab_key and roles", () => {
    for (const old of baseline.leaves) {
      const href = MOVED[old.href] ?? old.href;
      const now = allNavLinks.find((l) => l.href === href);
      expect(now).toBeDefined();
      expect({ href: old.href, tabKey: now!.tabKey ?? null, roles: [...now!.roles].sort() })
        .toEqual({ href: old.href, tabKey: old.tabKey, roles: [...old.roles].sort() });
    }
  });

  test("DEFAULT_TAB_ROLES is unchanged, so the permissions screen seeds the same defaults", () => {
    expect(DEFAULT_TAB_ROLES).toEqual(baseline.defaults);
  });

  test("the only new links are the design's additions, none with a tab_key", () => {
    const oldHrefs = new Set(baseline.leaves.map((l) => MOVED[l.href] ?? l.href));
    const added = allNavLinks.filter((l) => !oldHrefs.has(l.href));
    expect(added.map((l) => l.href).sort()).toEqual(
      ["/admin/events/new", "/admin/marketing/fwb", "/admin/private-events", "/admin/settings?tab=profile", "/boxoffice"].sort()
    );
    for (const l of added) expect(l.tabKey).toBeUndefined();
  });
});

describe("resolveActive", () => {
  const at = (p: string) => {
    const a = resolveActive(p);
    return a && [a.groupId, a.pageId, a.routeTabHref];
  };

  test("dashboard owns only itself", () => {
    expect(at("/admin")).toEqual(["today", "dash", null]);
    expect(at("/admin/nope")).toBeNull();
  });
  test("an event's own pages beat the show list's prefix", () => {
    expect(at("/admin/calendar")).toEqual(["shows", "calendar", "/admin/calendar?tab=month"]);
    expect(at("/admin/events/new")).toEqual(["shows", "create", null]);
    expect(at("/admin/events/abc-123")).toEqual(["shows", "workspace", null]);
    expect(at("/admin/events/abc-123/edit")).toEqual(["shows", "eventedit", null]);
    expect(at("/admin/events/abc-123/ads")).toEqual(["audience", "marketing", null]);
  });
  test("longest route wins inside a merged page", () => {
    expect(at("/admin/settings")).toEqual(["admin", "settings", "/admin/settings?tab=profile"]);
    expect(at("/admin/settings/permissions")).toEqual(["admin", "roles", null]);
  });
  test("FWB is loyalty, the rest of /admin/marketing is campaigns", () => {
    expect(at("/admin/marketing/fwb-members")).toEqual(["audience", "loyalty", null]);
    expect(at("/admin/marketing/campaigns")).toEqual(["audience", "marketing", "/admin/marketing?tab=campaigns"]);
    expect(at("/admin/marketing")).toEqual(["audience", "marketing", "/admin/marketing?tab=campaigns"]);
  });
  test("offer builder routes belong to Offers", () => {
    expect(at("/admin/offers/xyz")).toEqual(["deals", "offer", null]);
  });
});

describe("visibleNav", () => {
  test("artists get Dashboard, Orders and Guest check-in only", () => {
    const pages = visibleNav("artist", null).flatMap((g) =>
      g.pages.map((p) => [p.id, p.link?.href ?? null, (p.routeTabs ?? []).map((t) => t.href)])
    );
    expect(pages).toEqual([
      ["dash", "/admin", []],
      ["dayof", null, ["/admin/guest-lists"]],
      ["orders", "/admin/orders", []],
    ]);
  });
  test("a sidebar_permissions row still hides a tab", () => {
    const pages = visibleNav("venue_admin", { auctions: false }).flatMap((g) => g.pages);
    const marketing = pages.find((p) => p.id === "marketing")!;
    expect(marketing.routeTabs!.map((t) => t.label)).not.toContain("Auctions");
  });
  test("box office staff don't see Administration", () => {
    expect(visibleNav("box_office", null).map((g) => g.id)).not.toContain("admin");
  });
});

describe("merged redirects", () => {
  test("next.config.ts redirects every merged route to where the nav says it lives", async () => {
    const config = (await import("../../next.config")).default;
    const redirects = await config.redirects!();
    for (const [from, to] of Object.entries(MOVED)) {
      if (from === splitPath(to)) continue; // the host page itself
      expect(redirects).toContainEqual({ source: from, destination: to, permanent: false });
    }
  });
});

function splitPath(href: string) {
  return href.split("?")[0];
}
