
/**
 * Read every row a query matches, not the first page of them.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * PostgREST caps a response at `db-max-rows`, which on Supabase is 1000. That
 * cap is applied server-side and IGNORES the `.limit()` you asked for: a query
 * written `.limit(50000)` returns 1000 rows, with no error, no truncation
 * flag, and no way to tell a capped page from a complete result.
 *
 * That is not theoretical. The rebuilt admin dashboard counted tickets by
 * reading the rows and tallying them in memory. There are 1,664 tickets in the
 * hard-ticket band, so it saw the first 1,000 — and Tyler Halverson, a show
 * that had sold 42, reported 15, because 15 was that show's share of the page
 * it happened to land on. Every count, sell-through and per-event figure was
 * wrong by an amount nobody could predict from the number itself.
 *
 * The same shape is one row away from silently truncating REVENUE: the
 * settlement ledger for that band is at 748 rows today. At 1,001 it would
 * start under-reporting gross with no symptom at all.
 *
 * ── USE ────────────────────────────────────────────────────────────────────
 * Pass a query WITHOUT `.limit()` or `.range()` — this supplies both:
 *
 *   const tickets = await fetchAll(
 *     admin.from("tickets").select("id, event_id").in("event_id", ids)
 *   );
 *
 * For a pure count, prefer `.select("id", { count: "exact", head: true })` —
 * it is one round trip and transfers no rows. Use this only when you need the
 * rows themselves.
 */
/**
 * The builder is re-ranged per page, so it must not already carry a range.
 * Typed structurally rather than against PostgrestFilterBuilder's five generic
 * parameters, which differ between supabase-js minor versions and would pin
 * this helper to one of them.
 */
type Rangeable<T> = {
  range: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
};

export async function fetchAll<T>(
  query: Rangeable<T>,
  { pageSize = 1000, maxRows = 100_000 }: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const out: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    // range() is inclusive at both ends.
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      // Return what we have rather than throwing: these feed dashboards, and a
      // partial dashboard beats a 500. The caller logs; the gap is visible
      // because the numbers move, not because they silently settle wrong.
      console.error("fetchAll page failed", { from, message: error.message });
      return out;
    }
    const page = data ?? [];
    out.push(...page);
    // A short page is the last page. Equal-to-pageSize means there may be more.
    if (page.length < pageSize) return out;
  }

  console.warn(`fetchAll hit maxRows (${maxRows}) — result may be truncated.`);
  return out;
}
