/**
 * What one purchase buys, and what it costs.
 *
 * A section sells on three axes (plans/seating-sell-modes-migration.sql):
 *
 *   type         row | table | ga     the shape of the thing
 *   seating_mode assigned | first_come  does the ticket name a seat
 *   sale_unit    seat | table         what one purchase buys
 *
 * This resolves the last two into the only question the till has to answer:
 * is this basket priced per seat or per table, and at what price.
 *
 * ── What it replaces ─────────────────────────────────────────────────────
 * The till used to decide with
 *
 *     const isTable = !!sec.sells_as_table || sec.type === "table";
 *
 * so ANY section typed `table` billed as a whole table however the toggle was
 * set. Turning sells_as_table off changed nothing, and selling individual
 * seats at a table was therefore impossible — which is the whole point of
 * the sixth mode.
 */

export type SectionSaleShape = {
  name: string;
  /** Whole-table price on a table section. Per-seat price elsewhere. */
  price_cents: number;
  type?: string | null;
  sale_unit?: string | null;
  seating_mode?: string | null;
  /** Pre-migration fallback. */
  sells_as_table?: boolean | null;
  /** Per-seat price on a table section that sells by the seat. */
  seat_price_cents?: number | null;
};

export type SaleShape = {
  /** One billing unit per table, rather than per seat. */
  byTable: boolean;
  /** What one billing unit costs, in cents. */
  priceCents: number;
};

/** True when a ticket in this section names a specific seat. */
export function isAssigned(sec: Pick<SectionSaleShape, "seating_mode">): boolean {
  // Default assigned: that is what every section was before the column existed.
  return (sec.seating_mode ?? "assigned") === "assigned";
}

/**
 * Resolve how a section prices.
 *
 * Returns an error rather than a number when a table section is set to sell
 * by the seat without a per-seat price. Dividing the table price by the chair
 * count would invent a figure nobody set — on VIP Tables that is the
 * difference between charging $100 and charging $800 — and a till must not
 * guess at a price.
 */
export function resolveSaleShape(sec: SectionSaleShape): SaleShape | { error: string } {
  const byTable = sec.sale_unit ? sec.sale_unit === "table" : !!sec.sells_as_table;

  if (byTable) {
    if (sec.type && sec.type !== "table") {
      return { error: `${sec.name} is set to sell by the table but is not a table section.` };
    }
    return { byTable: true, priceCents: sec.price_cents };
  }

  // Selling seats. On a table section price_cents is the TABLE price, so a
  // per-seat price has to have been set explicitly.
  if (sec.type === "table") {
    if (sec.seat_price_cents == null) {
      return {
        error: `${sec.name} is set to sell individual seats but has no per-seat price. Set one on the section — its price is the whole-table price.`,
      };
    }
    return { byTable: false, priceCents: sec.seat_price_cents };
  }

  return { byTable: false, priceCents: sec.seat_price_cents ?? sec.price_cents };
}
