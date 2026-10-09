/**
 * The event hub's sections, as eventhub.dc.html groups and words them.
 *
 * One page per show at /admin/events/[id]?tab=…; the section is the URL so a
 * pasted link and the sidebar open the same place. Summary is the default
 * and is left out of the URL.
 */

export const HUB_TABS = [
  "summary", "details", "tickets", "inventory", "promotions",
  "marketing", "orders", "guests",
  "dayof",
  "deal", "settlement",
  "activity", "access",
] as const;

export type HubTab = (typeof HUB_TABS)[number];

export const HUB_LABEL: Record<HubTab, string> = {
  summary: "Summary",
  details: "Details",
  tickets: "Tickets & pricing",
  inventory: "Inventory & seating",
  promotions: "Promotions",
  marketing: "Marketing",
  orders: "Orders",
  guests: "Guest list & comps",
  dayof: "Day of show",
  deal: "Deal",
  settlement: "Settlement",
  activity: "Activity",
  access: "Access",
};

export const HUB_GROUPS: Array<{ label: string; items: HubTab[] }> = [
  { label: "Build", items: ["summary", "details", "tickets", "inventory", "promotions"] },
  { label: "Sell", items: ["marketing", "orders", "guests"] },
  { label: "Show night", items: ["dayof"] },
  { label: "Money", items: ["deal", "settlement"] },
  { label: "Admin", items: ["activity", "access"] },
];

export const HUB_GROUP_OF = Object.fromEntries(
  HUB_GROUPS.flatMap((g) => g.items.map((t) => [t, g.label])),
) as Record<HubTab, string>;

export const HUB_SUB: Record<HubTab, string> = {
  summary: "Where this show stands: pace, what is left to set up, where sales come from and what needs attention.",
  details: "What buyers see on the storefront, the ticket and the wallet pass.",
  tickets: "Tiers, fees and the windows they sell in.",
  inventory: "What can be sold, what is held back, and where it sits in the room.",
  promotions: "Discount codes and the codes that unlock presales or hidden tiers. Codes here apply to this show only.",
  marketing: "Tracking links, the sales timeline, ads and messaging for this show.",
  orders: "Every order for this show, from every place it was sold.",
  guests: "Artist and house guests. The door works from this list on show night.",
  dayof: "The room in real time once doors open.",
  deal: "The deal from the linked offer, priced against this show's real scaling and expenses.",
  settlement: "Settle the night here: manifest, tax, expenses, ancillary, the artist split, signatures and payout.",
  activity: "Who changed what on this show, and when.",
  access: "Staff and portal users who can open this show, and what they can see.",
};

/**
 * Which sections a role may open (eventhub.dc.html ROLE_TABS). null = all.
 * An artist sees the guest list only; box office and the door work orders,
 * guests and the night. Everyone else on staff sees the whole show.
 */
const ROLE_TABS: Record<string, HubTab[]> = {
  artist: ["guests"],
  box_office: ["orders", "guests", "dayof"],
  door_greeter: ["orders", "guests", "dayof"],
};

const ROLE_NAME: Record<string, string> = {
  artist: "Artist",
  box_office: "Box office",
  door_greeter: "Door staff",
};

const ROLE_SEES: Record<string, string> = {
  artist: "Artists see this show's guest list only.",
  box_office: "Box office sees Orders, Guest list and Day of show.",
  door_greeter: "Door staff see Orders, Guest list and Day of show.",
};

export function roleTabs(role: string): HubTab[] | null {
  return ROLE_TABS[role] ?? null;
}

export function canOpen(role: string, tab: HubTab): boolean {
  const allowed = roleTabs(role);
  return !allowed || allowed.includes(tab);
}

export function firstTabFor(role: string): HubTab {
  return roleTabs(role)?.[0] ?? "summary";
}

export function deniedCopy(role: string, tab: HubTab) {
  return {
    title: `Your role can't see ${HUB_LABEL[tab]}`,
    body: `You're signed in as ${ROLE_NAME[role] ?? role.replace(/_/g, " ")}. ${ROLE_SEES[role] ?? ""} Ask the venue owner if you need more.`,
  };
}

/** Roles that may publish, duplicate, postpone or cancel the show. */
export const OWNER_ROLES = ["owner", "super_admin", "venue_admin", "full_admin"];
