import type { ExpenseItem } from "@/lib/types/offer";

/**
 * Door deals: a percentage of the door (face value, after tax and the
 * platform's fees), optionally after named expenses come off the top —
 * "70% of the door after support and catering".
 *
 * Which lines come off the top is a flag on the offer's own fixed expense
 * rows (`off_top`), so it travels with the offer and needs no new column.
 */

/** What an agent asks to come off the top when they ask at all. */
export const DOOR_OFF_TOP_DEFAULTS = ["Support", "Catering"];

const isDoor = (dealType: string) => String(dealType || "").toUpperCase() === "DOOR";

/** The total coming off the door before the split; zero on any other deal. */
export function doorDeductions(fixed: ExpenseItem[] | undefined, dealType: string): number {
  if (!isDoor(dealType) || !Array.isArray(fixed)) return 0;
  return fixed.reduce((s, e) => s + (e.off_top ? Number(e.amount) || 0 : 0), 0);
}

/** The names of the lines coming off the top, for the deal sentence. */
export function offTopNames(fixed: ExpenseItem[] | undefined): string[] {
  return (Array.isArray(fixed) ? fixed : []).filter((e) => e.off_top).map((e) => e.name);
}

/**
 * Switching an offer to DOOR with nothing flagged yet: flag the usual pair,
 * so the common ask needs no clicks. Lines the offer doesn't carry are left
 * alone, and an offer that already has flags keeps them.
 */
export function withDoorDefaults(fixed: ExpenseItem[] | undefined): ExpenseItem[] {
  const rows = Array.isArray(fixed) ? fixed : [];
  if (rows.some((e) => e.off_top)) return rows;
  const wanted = DOOR_OFF_TOP_DEFAULTS.map((n) => n.toLowerCase());
  return rows.map((e) => (wanted.includes(String(e.name || "").trim().toLowerCase()) ? { ...e, off_top: true } : e));
}

/** "Support and Catering" / "Support, Catering and Rent". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
