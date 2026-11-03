import { surchargeCents } from "@/lib/fees/rates";

/**
 * Door pricing, in cents. The reader's charge and the total on the POS screen
 * both come from cardPresentTotal, so the screen can't promise a different
 * number from the one the customer is charged.
 */

/** Who a door sale is under when the buyer gives no name. */
export const WALK_UP_NAME = "Walk-up Sale";

export type UnitPrice = {
  faceCents: number;
  serviceCents: number;
  facilityCents: number;
  taxCents: number;
};

export function cardPresentTotal(unit: UnitPrice, quantity: number) {
  const faceCents = unit.faceCents * quantity;
  const feesCents = (unit.serviceCents + unit.facilityCents) * quantity;
  const taxCents = unit.taxCents * quantity;
  const subtotalCents = faceCents + feesCents + taxCents;
  const processingCents = surchargeCents(subtotalCents, undefined, "terminal");
  return { faceCents, feesCents, taxCents, processingCents, totalCents: subtotalCents + processingCents };
}

/**
 * Amounts a customer is likely to hand over, above what's due: the next `steps`
 * multiples of $10, then the next $100.
 */
export function cashSuggestions(dueCents: number, steps: number): number[] {
  if (dueCents <= 0) return [];
  const above = (unit: number) => (Math.floor(dueCents / unit) + 1) * unit;
  const out: number[] = [];
  for (let i = 0; i < steps; i++) out.push(above(1000) + i * 1000);
  const hundred = above(10000);
  if (!out.includes(hundred)) out.push(hundred);
  return out;
}

/** Cents typed on the keypad, or null when nothing's been entered. */
export function changeDue(dueCents: number, givenCents: number | null) {
  if (givenCents === null) return { state: "empty" as const, cents: 0 };
  const diff = givenCents - dueCents;
  return diff >= 0 ? { state: "enough" as const, cents: diff } : { state: "short" as const, cents: -diff };
}

/** "40" or "40.5" typed into the cash box. Null when it isn't a number. */
export function parseCashInput(text: string): number | null {
  const t = text.replace(/[$,\s]/g, "");
  if (!t || !/^\d*\.?\d{0,2}$/.test(t) || t === ".") return null;
  return Math.round(parseFloat(t) * 100);
}
