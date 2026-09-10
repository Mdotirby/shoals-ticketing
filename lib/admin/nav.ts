/**
 * Admin navigation — the single definition.
 *
 * This lived in two places that had already drifted apart. app/admin/layout.tsx
 * held sidebarGroups; app/admin/settings/permissions/page.tsx held a DEFAULTS
 * map whose own comment admitted it "mirrors sidebarItems in admin/layout.tsx".
 * It did not:
 *
 *   layout.tsx  Events → owner, venue_admin, full_admin, read_only, box_office,
 *                        door_greeter, artist   (7)
 *   DEFAULTS    events → owner, venue_admin, full_admin                   (3)
 *
 * and DEFAULTS covered 12 tab keys against roughly two dozen nav entries, so
 * the permissions screen was showing defaults that did not match what the
 * sidebar actually did. ADMIN_MERGE_PLAN.md § 3 calls for one of the two to
 * become the source. This is it; the permissions screen now derives from here.
 *
 * ROLE STRINGS ARE LEFT AS THEY ARE. These arrays still name legacy values
 * (full_admin, door_greeter) even though plans/role-taxonomy-migration.sql has
 * rewritten the database, because normalizeRole() resolves both and rewriting
 * them here is a separate change with its own blast radius — every one of these
 * arrays feeds a visibility check. Migrating them belongs with the capability
 * derivation in § 3.2, not with a chrome commit.
 */

export type SidebarItem = {
  label: string;
  href: string;
  roles: string[];
};

export type SidebarGroup = {
  groupLabel: string;
  icon: string;
  items: SidebarItem[];
  roles: string[];
};

/** Dashboard sits above every group, on its own. */
export const dashboardItem: SidebarItem = {
  label: "Dashboard",
  href: "/admin",
  roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist","partner"],
};

export const sidebarGroups: SidebarGroup[] = [
  {
    groupLabel: "Shows",
    icon: "shows",
    roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist"],
    items: [
      { label: "Events",        href: "/admin/events",       roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist"] },
      { label: "Calendar",      href: "/admin/calendar",     roles: ["owner","venue_admin","full_admin"] },
      { label: "Seating",       href: "/admin/seating",      roles: ["owner","venue_admin"] },
    ],
  },
  {
    groupLabel: "Finance",
    icon: "business",
    roles: ["owner","venue_admin","full_admin","read_only","box_office","door_greeter","artist"],
    items: [
      { label: "Ticket Sales",  href: "/admin/orders",       roles: ["owner","venue_admin","full_admin","box_office","door_greeter","artist"] },
      { label: "Offers",        href: "/admin/offers",       roles: ["owner","venue_admin"] },
      { label: "Settlements",   href: "/admin/settlements",  roles: ["owner","venue_admin"] },
      { label: "Contracts",     href: "/admin/contracts",    roles: ["owner","venue_admin"] },
      { label: "Reports",       href: "/admin/reports",      roles: ["owner","venue_admin","full_admin","read_only","box_office"] },
    ],
  },
  {
    groupLabel: "Day of Show",
    icon: "dayofshow",
    roles: ["owner","venue_admin","full_admin","box_office","door_greeter","artist"],
    items: [
      { label: "Scanner",       href: "/admin/scan",         roles: ["owner","venue_admin","full_admin","box_office","door_greeter"] },
      { label: "Guest Lists",   href: "/admin/guest-lists",  roles: ["owner","venue_admin","full_admin","artist"] },
      { label: "Live Pulse",    href: "/admin/live",         roles: ["owner","venue_admin","full_admin"] },
    ],
  },
  {
    groupLabel: "Marketing",
    icon: "growth",
    roles: ["owner","venue_admin","full_admin"],
    items: [
      { label: "Campaigns",     href: "/admin/marketing",    roles: ["owner","venue_admin","full_admin"] },
      { label: "Broadcasts",    href: "/admin/broadcasts",   roles: ["owner","super_admin","venue_admin","full_admin"] },
      { label: "Market Radar",  href: "/admin/market-radar", roles: ["owner","venue_admin"] },
      { label: "Auctions",      href: "/admin/auctions",     roles: ["owner","venue_admin","full_admin"] },
      { label: "Sponsors",      href: "/admin/sponsors",     roles: ["owner","venue_admin"] },
    ],
  },
  {
    groupLabel: "Contacts",
    icon: "contacts",
    roles: ["owner","venue_admin"],
    items: [
      { label: "Agents",        href: "/admin/agents",       roles: ["owner","venue_admin"] },
    ],
  },
  {
    groupLabel: "Settings",
    icon: "settings",
    roles: ["owner","venue_admin"],
    items: [
      { label: "Branding",      href: "/admin/settings/branding",    roles: ["owner","venue_admin"] },
      { label: "FAQ Content",   href: "/admin/faqs",                 roles: ["owner","venue_admin"] },
      { label: "Venue Portal",  href: "/portal",                     roles: ["owner","venue_admin"] },
      { label: "Procedures",    href: "/admin/sops",                 roles: ["owner","venue_admin"] },
      { label: "Team",          href: "/admin/users",                roles: ["owner","venue_admin"] },
      { label: "Venues",        href: "/admin/venues",               roles: ["owner"] },
      { label: "Permissions",   href: "/admin/settings/permissions", roles: ["owner"] },
      { label: "Onboarding",    href: "/admin/onboarding",           roles: ["owner"] },
    ],
  },
];

/** Partner-only standalone item. */
export const partnerItem: SidebarItem = {
  label: "Partner Dashboard",
  href: "/admin/partner-dashboard",
  roles: ["partner"],
};

/**
 * Display label → tab_key in sidebar_permissions.
 *
 * The mockup's own component notes call this out as a pattern worth keeping:
 * labels changed (Events became Shows, Sales became Ticket Sales, Email became
 * Broadcasts) while tab_key stayed put, so renaming a tab never orphans a
 * permission row. A NEW SCREEN NEEDS A ROW HERE or it silently fails the
 * visibility check.
 */
export const TAB_KEY_MAP: Record<string, string> = {
  "Dashboard": "dashboard",
  "Calendar": "calendar",
  "Shows": "events",           // was "Events"
  "Seating": "seating",
  "Ticket Sales": "sales",     // was "Sales"
  "Offers": "booking",         // was "Booking"
  "Settlements": "settlements",
  "Contracts": "contracts",
  "Reports": "reports",
  "Scanner": "scanner",
  "Guest Lists": "guest_lists",
  "Live Pulse": "live_pulse",
  "Campaigns": "marketing",    // was "Marketing"
  "Broadcasts": "email_engine", // was "Email" — same permission slot, new dashboard
  "Market Radar": "market_radar",
  "Auctions": "auctions",
  "Sponsors": "partners",      // was "Partners"
  "Agents": "agents",
  "Branding": "site_branding", // was "Site Branding"
  "Venue Portal": "venue_management", // was "Venue Management"
  "Procedures": "sops",        // was "SOPs"
  "Team": "users",             // /admin/users — the mockup's Users screen
  "Permissions": "permissions",
  "Onboarding": "onboarding",
  "Partner Dashboard": "partner_dashboard",
};

/** Every nav item, flattened. */
export const allNavItems: SidebarItem[] = [
  dashboardItem,
  ...sidebarGroups.flatMap((g) => g.items),
  partnerItem,
];

/**
 * tab_key → roles, DERIVED from the nav above rather than hand-maintained.
 * This is what the permissions screen seeds from, so the two can no longer
 * disagree the way they had.
 *
 * The "Events" label maps to tab_key "events" via TAB_KEY_MAP, which is why
 * the derived map is keyed off the label rather than the href.
 */
export const DEFAULT_TAB_ROLES: Record<string, string[]> = allNavItems.reduce(
  (acc, item) => {
    const key = TAB_KEY_MAP[item.label];
    if (key) acc[key] = item.roles;
    return acc;
  },
  {} as Record<string, string[]>
);
