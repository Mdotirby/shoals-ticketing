/**
 * Admin navigation — the single definition.
 *
 * Shape follows handoff/ADMIN-NAV-SPEC.md (design project, handoff/screens/
 * sidebar.dc.html): three levels.
 *
 *   GROUP   collapsible, never a destination — it only opens and closes
 *     page  a destination; this is what a click navigates to
 *       tab revealed inline, only under the ACTIVE page
 *
 * Grouping is by workflow moment, not object type: "Day of show" holds three
 * different objects because they are the same twenty minutes of someone's
 * evening.
 *
 * TWO KINDS OF TAB
 * The design merges several production routes into single tabbed pages
 * (Marketing, Venue settings, Users & tenants, Tonight, Calendar & shows).
 * Those merges haven't been built yet, so until they are, a page's tabs are
 * its ROUTE TABS — the separate routes the merge will absorb, each keeping
 * its own tab_key and roles. When a merge lands, its route tabs become PARAM
 * TABS (`?tab=<key>` on one route) and nothing else here changes.
 *
 * Param tabs mirror a tab bar already rendered in the page body. The sidebar
 * never owns that state — it links to `?tab=` and reads it back.
 *
 * PERMISSIONS ARE UNCHANGED
 * Every link carries the tab_key and roles it had before the regroup, so
 * sidebar_permissions rows resolve exactly as they did and
 * DEFAULT_TAB_ROLES is identical. __tests__/admin/nav.test.ts holds this
 * against a snapshot of the old nav. A link with no tabKey is gated on roles
 * alone, which is also how it worked before (Events, FAQ Content, Venues).
 *
 * ROLE STRINGS ARE LEFT AS THEY ARE. These arrays still name legacy values
 * (full_admin, door_greeter) even though plans/role-taxonomy-migration.sql has
 * rewritten the database, because normalizeRole() resolves both and rewriting
 * them here is a separate change with its own blast radius.
 */

/**
 * A navigable route with its own permission. After a merge, the href is the
 * merged page plus its tab — `/admin/marketing?tab=broadcasts` — and the
 * link keeps the tab_key and roles the old route had.
 */
export type NavLink = {
  label: string;
  href: string;
  /** sidebar_permissions.tab_key. Omitted = gated on roles alone. */
  tabKey?: string;
  roles: string[];
};

export type NavParamTab = { label: string; key: string };

export type NavPage = {
  id: string;
  label: string;
  /** The page's own route. Omit when the page is made of route tabs. */
  link?: NavLink;
  /** Separate routes shown as this page's tabs until the design's merge lands. */
  routeTabs?: NavLink[];
  /** In-page tabs, linked as `?tab=<key>`. */
  paramTabs?: NavParamTab[];
  /** Param tabs only show on paths matching this (e.g. the builder, not the list). */
  paramTabsOn?: RegExp;
  /** Paths that make this page active beyond its links' own prefixes. */
  match?: RegExp;
  /**
   * Needs an id out of the URL (an event's workspace, its edit form). Listed
   * only while the user is somewhere that id can be read from; returns the
   * href for it, or null to hide the page.
   */
  contextualHref?: (pathname: string) => string | null;
};

export type NavGroup = {
  id: string;
  label: string;
  /** Glyph from the mockup; also what the collapsed rail shows. */
  icon: string;
  pages: NavPage[];
};

/** The event an /admin/events/<id>/… path is about, if any. */
function eventIdIn(pathname: string): string | null {
  const m = /^\/admin\/events\/([^/]+)/.exec(pathname);
  return m && m[1] !== "new" ? m[1] : null;
}

const R = {
  all: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist","partner"],
  events: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist"],
  exec: ["owner","venue_admin","full_admin"],
  mgmt: ["owner","venue_admin"],
  owner: ["owner"],
};

export const navGroups: NavGroup[] = [
  {
    id: "today",
    label: "Today",
    icon: "◉",
    pages: [
      { id: "dash", label: "Dashboard", link: { label: "Dashboard", href: "/admin", tabKey: "dashboard", roles: R.all } },
    ],
  },
  {
    id: "shows",
    label: "Shows",
    icon: "◈",
    pages: [
      {
        id: "calendar",
        label: "Calendar & shows",
        routeTabs: [
          { label: "Month", href: "/admin/calendar", tabKey: "calendar", roles: R.exec },
          { label: "Show list", href: "/admin/events", roles: R.events },
        ],
      },
      {
        id: "workspace",
        label: "Event workspace",
        // Inside an event, its workspace and edit form are both one click
        // away, whichever of the two you're on.
        contextualHref: (p) => (eventIdIn(p) ? `/admin/events/${eventIdIn(p)}` : null),
        match: /^\/admin\/events\/(?!new$)[^/]+$/,
        link: { label: "Event workspace", href: "/admin/events", roles: R.events },
        paramTabs: [
          { label: "Overview", key: "overview" },
          { label: "Inventory & Holds", key: "inventory" },
          { label: "Orders", key: "orders" },
          { label: "Settlement", key: "settlement" },
          { label: "Marketing", key: "marketing" },
          { label: "Guest List", key: "guestlist" },
          { label: "Access", key: "access" },
        ],
      },
      {
        id: "create",
        label: "Create a show",
        link: { label: "Create a show", href: "/admin/events/new", roles: R.exec },
        paramTabs: [
          { label: "Setup", key: "setup" },
          { label: "Tickets", key: "tickets" },
          { label: "On-sale & fees", key: "onsale" },
        ],
      },
      {
        id: "eventedit",
        label: "Edit event",
        contextualHref: (p) => (eventIdIn(p) ? `/admin/events/${eventIdIn(p)}/edit` : null),
        match: /^\/admin\/events\/[^/]+\/edit$/,
        link: { label: "Edit event", href: "/admin/events", roles: R.events },
      },
      { id: "seating", label: "Seating map", link: { label: "Seating", href: "/admin/seating", tabKey: "seating", roles: R.mgmt } },
    ],
  },
  {
    id: "deals",
    label: "Deals & bookings",
    icon: "◷",
    pages: [
      {
        id: "offer",
        label: "Offers",
        link: { label: "Offers", href: "/admin/offers", tabKey: "booking", roles: R.mgmt },
        // Production's own keys, verbatim (merge plan § 10.1).
        paramTabs: [
          { label: "Details", key: "details" },
          { label: "P&L", key: "pnl" },
          { label: "Deal lab", key: "deal_lab" },
        ],
        paramTabsOn: /^\/admin\/offers\/[^/]+$/,
      },
      { id: "contracts", label: "Contracts", link: { label: "Contracts", href: "/admin/contracts", tabKey: "contracts", roles: R.mgmt } },
      { id: "agents", label: "Agents", link: { label: "Agents", href: "/admin/agents", tabKey: "agents", roles: R.mgmt } },
      { id: "quote", label: "Rental quotes", link: { label: "Rental quotes", href: "/admin/private-events", roles: R.mgmt } },
    ],
  },
  {
    id: "door",
    label: "Day of show",
    icon: "◎",
    pages: [
      {
        id: "dayof",
        label: "Tonight",
        routeTabs: [
          { label: "Pulse", href: "/admin/live", tabKey: "live_pulse", roles: R.exec },
          { label: "Guest check-in", href: "/admin/guest-lists", tabKey: "guest_lists", roles: ["owner","venue_admin","full_admin","artist"] },
        ],
      },
      { id: "boxoffice", label: "Box office POS", link: { label: "Box office POS", href: "/boxoffice", roles: ["owner","venue_admin","full_admin","box_office"] } },
      // The design keeps scan as its own surface — the door scanner app — not
      // a tab of Tonight (PHASE1B § Merges).
      { id: "scan", label: "Scanner", link: { label: "Scanner", href: "/admin/scan", tabKey: "scanner", roles: ["owner","venue_admin","full_admin","box_office","door_greeter"] } },
    ],
  },
  {
    id: "money",
    label: "Money",
    icon: "▤",
    pages: [
      { id: "orders", label: "Orders & refunds", link: { label: "Orders & refunds", href: "/admin/orders", tabKey: "sales", roles: ["owner","venue_admin","full_admin","box_office","door_greeter","artist"] } },
      { id: "settle", label: "Settlements", link: { label: "Settlements", href: "/admin/settlements", tabKey: "settlements", roles: R.mgmt } },
      { id: "invoice", label: "Invoices", link: { label: "Invoices", href: "/admin/invoices", tabKey: "invoices_payments", roles: R.mgmt } },
      { id: "reporting", label: "Reporting", link: { label: "Reporting", href: "/admin/reports", tabKey: "reports", roles: ["owner","venue_admin","full_admin","read_only","box_office"] } },
    ],
  },
  {
    id: "audience",
    label: "Audience",
    icon: "◍",
    pages: [
      {
        id: "marketing",
        label: "Marketing",
        // Per-event ads fold into Campaigns (PHASE1B § Merges).
        match: /^\/admin\/events\/[^/]+\/ads$/,
        routeTabs: [
          { label: "Campaigns", href: "/admin/marketing?tab=campaigns", tabKey: "marketing", roles: R.exec },
          { label: "Broadcasts", href: "/admin/marketing?tab=broadcasts", tabKey: "email_engine", roles: ["owner","super_admin","venue_admin","full_admin"] },
          { label: "Auctions", href: "/admin/marketing?tab=auctions", tabKey: "auctions", roles: R.exec },
          { label: "Market radar", href: "/admin/marketing?tab=radar", tabKey: "market_radar", roles: R.mgmt },
          { label: "Sponsors", href: "/admin/marketing?tab=sponsors", tabKey: "partners", roles: R.mgmt },
        ],
      },
      {
        id: "loyalty",
        label: "Loyalty — FWB",
        match: /^\/admin\/marketing\/fwb/,
        link: { label: "Loyalty — FWB", href: "/admin/marketing/fwb", roles: R.exec },
      },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    icon: "⚙",
    pages: [
      {
        id: "settings",
        label: "Venue settings",
        routeTabs: [
          { label: "Profile & fees", href: "/admin/settings?tab=profile", roles: R.mgmt },
          { label: "Branding", href: "/admin/settings?tab=branding", tabKey: "site_branding", roles: R.mgmt },
          { label: "Pages", href: "/admin/settings?tab=pages", roles: R.mgmt },
          { label: "Portals", href: "/portal", tabKey: "venue_management", roles: R.mgmt },
          { label: "Procedures", href: "/admin/settings?tab=procedures", tabKey: "sops", roles: R.mgmt },
        ],
      },
      {
        id: "identity",
        label: "Users & tenants",
        routeTabs: [
          { label: "Onboarding", href: "/admin/onboarding", tabKey: "onboarding", roles: R.owner },
          { label: "People", href: "/admin/users", tabKey: "users", roles: R.mgmt },
          { label: "Tenants", href: "/admin/venues", roles: R.owner },
        ],
      },
      { id: "roles", label: "Access control", link: { label: "Access control", href: "/admin/settings/permissions", tabKey: "permissions", roles: R.owner } },
    ],
  },
];

/** Partner-only standalone item, outside the groups. */
export const partnerLink: NavLink = {
  label: "Partner Dashboard",
  href: "/admin/partner-dashboard",
  tabKey: "partner_dashboard",
  roles: ["partner"],
};

/** Every link a page or tab can navigate to (contextual pages excluded). */
export const allNavLinks: NavLink[] = [
  ...navGroups.flatMap((g) =>
    g.pages.flatMap((p) => (p.contextualHref ? [] : [...(p.link ? [p.link] : []), ...(p.routeTabs ?? [])]))
  ),
  partnerLink,
];

/**
 * tab_key → roles, DERIVED from the nav rather than hand-maintained. This is
 * what the permissions screen seeds from, so the two can't disagree.
 */
export const DEFAULT_TAB_ROLES: Record<string, string[]> = allNavLinks.reduce(
  (acc, link) => {
    if (link.tabKey) acc[link.tabKey] = link.roles;
    return acc;
  },
  {} as Record<string, string[]>
);

/** Artists see a fixed set, whatever sidebar_permissions says. */
const ARTIST_TAB_KEYS = new Set(["dashboard", "sales", "guest_lists"]);

export function isLinkVisible(
  link: NavLink,
  role: string,
  perms: Record<string, boolean> | null
): boolean {
  if (role === "artist") return !!link.tabKey && ARTIST_TAB_KEYS.has(link.tabKey);
  if (perms && link.tabKey && link.tabKey in perms) return perms[link.tabKey];
  if (role && !link.roles.includes(role)) return false;
  return true;
}

/** "/admin/marketing?tab=auctions" → { path: "/admin/marketing", tab: "auctions" }. */
export function splitHref(href: string): { path: string; tab: string | null } {
  const i = href.indexOf("?");
  if (i === -1) return { path: href, tab: null };
  return { path: href.slice(0, i), tab: new URLSearchParams(href.slice(i + 1)).get("tab") };
}

/**
 * The tabs a merged page shows, in order — its route tabs that live on the
 * page's own path. Pass the page from visibleNav() and these are exactly the
 * tabs this user may open, so the page and the sidebar agree on the default
 * (the first one) without talking to each other.
 */
export function mergedTabs(page: NavPage): { key: string; label: string; href: string }[] {
  const tabs = page.routeTabs ?? [];
  const host = tabs.map((t) => splitHref(t.href)).find((h) => h.tab)?.path;
  if (!host) return [];
  return tabs
    .map((t) => ({ ...splitHref(t.href), label: t.label, href: t.href }))
    .filter((t) => t.path === host && t.tab)
    .map((t) => ({ key: t.tab!, label: t.label, href: t.href }));
}

/** `/admin/offers` owns `/admin/offers/123`, but `/admin` owns only itself. */
function ownsPath(href: string, pathname: string): boolean {
  href = splitHref(href).path;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export type ActiveNav = { groupId: string; pageId: string; routeTabHref: string | null } | null;

/**
 * Which page the pathname belongs to. A page's own `match` wins first (so an
 * event's workspace isn't claimed by the Show list's `/admin/events` prefix),
 * then the longest link that owns the path (so `/admin/events/new` is Create a
 * show, and `/admin/settings/branding` is the Branding tab, not Profile).
 */
export function resolveActive(pathname: string, groups: NavGroup[] = navGroups): ActiveNav {
  for (const g of groups) {
    for (const p of g.pages) {
      if (p.match?.test(pathname)) return { groupId: g.id, pageId: p.id, routeTabHref: null };
    }
  }
  let best: { groupId: string; pageId: string; href: string; isTab: boolean; len: number } | null = null;
  for (const g of groups) {
    for (const p of g.pages) {
      if (p.contextualHref) continue;
      const links = [
        ...(p.link ? [{ l: p.link, isTab: false }] : []),
        ...(p.routeTabs ?? []).map((l) => ({ l, isTab: true })),
      ];
      for (const { l, isTab } of links) {
        // Compare paths, not hrefs: a merged page's tabs share one path and
        // differ only in ?tab=, and the first of them should win.
        const len = splitHref(l.href).path.length;
        if (ownsPath(l.href, pathname) && (!best || len > best.len)) {
          best = { groupId: g.id, pageId: p.id, href: l.href, isTab, len };
        }
      }
    }
  }
  return best ? { groupId: best.groupId, pageId: best.pageId, routeTabHref: best.isTab ? best.href : null } : null;
}

/**
 * The nav a given user sees: links they can't open are dropped, a page with
 * no openable link is dropped, a group with no pages is dropped. A route-tab
 * page navigates to its first tab the user can open.
 */
export function visibleNav(role: string, perms: Record<string, boolean> | null): NavGroup[] {
  return navGroups
    .map((g) => ({
      ...g,
      pages: g.pages
        .map((p) => ({
          ...p,
          link: p.link && isLinkVisible(p.link, role, perms) ? p.link : undefined,
          routeTabs: p.routeTabs?.filter((t) => isLinkVisible(t, role, perms)),
        }))
        .filter((p) => p.link || (p.routeTabs && p.routeTabs.length > 0)),
    }))
    .filter((g) => g.pages.length > 0);
}
