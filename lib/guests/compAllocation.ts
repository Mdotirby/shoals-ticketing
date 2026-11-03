/**
 * A guest is a comp. Whose comp is a choice: the artist's, the venue's or
 * marketing's. Only a guest who has been checked in counts as a used comp.
 */

export const COMP_ALLOCATIONS = [
  { value: "artist", label: "Artist" },
  { value: "venue", label: "Venue" },
  { value: "marketing", label: "Marketing" },
] as const;

export type CompAllocation = (typeof COMP_ALLOCATIONS)[number]["value"];

export function isCompAllocation(v: unknown): v is CompAllocation {
  return COMP_ALLOCATIONS.some((a) => a.value === v);
}

/** What's saved, or what it should be for a guest saved before the choice existed. */
export function allocationFor(saved: unknown, list: "artist" | "house" | null | undefined): CompAllocation {
  if (isCompAllocation(saved)) return saved;
  return list === "artist" ? "artist" : "venue";
}

export function allocationLabel(a: CompAllocation): string {
  return COMP_ALLOCATIONS.find((x) => x.value === a)?.label ?? "Venue";
}

type GuestLike = { quantity?: number | string | null; checked_in_at?: string | null; comp_allocation?: unknown };

/** Comps used so far: checked-in guests, in tickets, by who they're allocated to. */
export function checkedInGuestComps(guests: GuestLike[]) {
  const by: Record<CompAllocation, number> = { artist: 0, venue: 0, marketing: 0 };
  let total = 0;
  for (const g of guests) {
    if (!g.checked_in_at) continue;
    const qty = Math.max(1, Math.floor(Number(g.quantity) || 1));
    total += qty;
    by[allocationFor(g.comp_allocation, null)] += qty;
  }
  return { total, byAllocation: by };
}

/** Guests take General Admission. A show with no tier by that name uses its first. */
export function generalAdmissionTier(names: string[]): string | undefined {
  return names.find((n) => /general|^\s*g\.?a\.?\b/i.test(n)) ?? names[0];
}
