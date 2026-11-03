/** Counting the door's cash. Everything in cents, so the sum can't drift. */

export const DENOMINATIONS = [
  { key: "100", label: "$100", cents: 10000 },
  { key: "50", label: "$50", cents: 5000 },
  { key: "20", label: "$20", cents: 2000 },
  { key: "10", label: "$10", cents: 1000 },
  { key: "5", label: "$5", cents: 500 },
  { key: "1", label: "$1", cents: 100 },
  { key: "q", label: "25¢", cents: 25 },
  { key: "d", label: "10¢", cents: 10 },
] as const;

export type DenominationCounts = Record<string, number>;

export function countedCents(counts: DenominationCounts): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d.cents * Math.max(0, Math.floor(Number(counts[d.key]) || 0)), 0);
}

/** Opening float plus cash sales, against what's actually in the drawer. */
export function drawerVariance(floatCents: number, cashSalesCents: number, counted: number) {
  const expected = floatCents + cashSalesCents;
  return { expected, variance: counted - expected, matches: counted === expected };
}
